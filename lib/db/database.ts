import * as SQLite from 'expo-sqlite';

let _db: SQLite.SQLiteDatabase | null = null;
let _init: Promise<SQLite.SQLiteDatabase> | null = null;

// SQLite is no longer the authoritative store for collections, wishlist, and
// binders — Supabase is (see lib/db/cloud-sync.ts). The local tables below
// are an optimistic mirror plus an offline-write queue:
//
//   cloud_collections      mirror of the user's `collections` rows (UUID-keyed)
//   cloud_collection_items mirror of `collection_items` with the full card_json
//                          embedded so renders stay fast and offline-capable
//   pending_ops            ordered queue of mutations not yet acknowledged by
//                          the cloud — flushed on connectivity / foreground
//
// cache_cards / cache_pricing are read caches for the Scrydex-backed data —
// they're not user mutations. Expired rows are swept on launch (see
// evictStaleCaches) so the database file doesn't grow without bound.

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return Promise.resolve(_db);
  if (_init) return _init;
  _init = SQLite.openDatabaseAsync('pokevault.db').then(async db => {
    await runMigrations(db);
    await evictStaleCaches(db);
    _db = db;
    return db;
  });
  return _init;
}

// ─── Schema migrations ───────────────────────────────────────────────────────
//
// Versioned via PRAGMA user_version: each entry in MIGRATIONS runs exactly
// once per install, inside a transaction that also bumps the version. Append
// new steps — never edit or reorder shipped ones. Step 1 is written
// idempotently (IF NOT EXISTS / guarded ADD COLUMN) because installs that
// predate the runner already have these tables at user_version 0.

async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>(`PRAGMA user_version`);
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    await db.withTransactionAsync(async () => {
      await MIGRATIONS[v](db);
      await db.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

const MIGRATIONS: ReadonlyArray<(db: SQLite.SQLiteDatabase) => Promise<void>> = [
  migration1BaseSchema,
  migration2DropLegacyTables,
];

// v0 → v1: the full mirror schema as it stood when the runner was introduced,
// folding in the column additions that used to be applied ad hoc on every
// launch (acquired_price/acquired_at, per-copy variant + grading metadata,
// collection rules, pending_ops status).
async function migration1BaseSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS cache_cards (
      card_id TEXT PRIMARY KEY,
      card_json TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cache_pricing (
      cache_key TEXT PRIMARY KEY,
      pricing_json TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    );

    -- ── Cloud-authoritative mirror ──────────────────────────────────────
    CREATE TABLE IF NOT EXISTS cloud_collections (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      kind        TEXT NOT NULL,           -- 'collection' | 'wishlist' | 'binder'
      name        TEXT NOT NULL,
      description TEXT,
      tone_start  TEXT,
      tone_end    TEXT,
      is_public   INTEGER NOT NULL DEFAULT 0,
      rules       TEXT,                    -- JSON; null = manual binder
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS cloud_collections_kind_idx
      ON cloud_collections (user_id, kind);

    CREATE TABLE IF NOT EXISTS cloud_collection_items (
      id              TEXT PRIMARY KEY,
      collection_id   TEXT NOT NULL,
      card_id         TEXT NOT NULL,
      card_json       TEXT NOT NULL,         -- cached payload for fast renders
      quantity        INTEGER NOT NULL DEFAULT 1,
      position        INTEGER NOT NULL DEFAULT 0,
      added_at        INTEGER NOT NULL,
      acquired_price  REAL,                  -- USD; null = no cost basis set
      acquired_at     INTEGER,               -- epoch ms; null = unknown
      variant_id      TEXT,                  -- card_variants UUID; null = "any printing"
      variant_name    TEXT,                  -- Scrydex variant name snapshot (display)
      condition       TEXT,                  -- NM | LP | MP | HP | DM (raw copies)
      grader          TEXT,                  -- PSA | CGC | BGS | TAG | ACE (graded copies)
      grade           TEXT,                  -- '10' | '9.5' | … (graded copies)
      cert_number     TEXT                   -- optional graded cert / pop lookup
    );
    CREATE INDEX IF NOT EXISTS cloud_collection_items_collection_idx
      ON cloud_collection_items (collection_id, position);
    CREATE INDEX IF NOT EXISTS cloud_collection_items_card_idx
      ON cloud_collection_items (card_id);

    -- ── Grading queue (mirror of card_grading_submissions) ─────────────
    CREATE TABLE IF NOT EXISTS cloud_card_grading (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL,
      card_id         TEXT NOT NULL,
      card_name       TEXT NOT NULL,
      card_set        TEXT,
      grader          TEXT NOT NULL,
      submission_id   TEXT,
      stage           TEXT NOT NULL DEFAULT 'received',
      submitted_at    INTEGER NOT NULL,
      returned_at     INTEGER,
      returned_grade  TEXT,
      declared_value  REAL,
      notes           TEXT,
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS cloud_card_grading_user_idx
      ON cloud_card_grading (user_id, stage, submitted_at);

    -- ── Realized sales ledger (mirror of card_sales) ───────────────────
    CREATE TABLE IF NOT EXISTS cloud_card_sales (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL,
      collection_id TEXT,
      card_id       TEXT NOT NULL,
      card_name     TEXT NOT NULL,
      card_set      TEXT,
      cost_basis    REAL,
      sale_price    REAL NOT NULL,
      currency      TEXT NOT NULL DEFAULT 'USD',
      sold_at       INTEGER NOT NULL,
      notes         TEXT,
      created_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS cloud_card_sales_user_idx
      ON cloud_card_sales (user_id, sold_at);

    -- ── Offline mutation queue ─────────────────────────────────────────
    -- payload is a JSON blob whose shape depends on op_type; see cloud-sync.ts.
    CREATE TABLE IF NOT EXISTS pending_ops (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      op_type         TEXT NOT NULL,
      payload         TEXT NOT NULL,
      created_at      INTEGER NOT NULL,
      last_attempt_at INTEGER,
      attempt_count   INTEGER NOT NULL DEFAULT 0,
      last_error      TEXT,
      status          TEXT NOT NULL DEFAULT 'pending'  -- 'pending' | 'failed'
    );
  `);

  // Installs that predate the runner created these tables without the newer
  // columns — SQLite has no ADD COLUMN IF NOT EXISTS, so inspect and add.
  await addMissingColumns(db, 'cloud_collection_items', {
    acquired_price: 'REAL',
    acquired_at:    'INTEGER',
    variant_id:     'TEXT',
    variant_name:   'TEXT',
    condition:      'TEXT',
    grader:         'TEXT',
    grade:          'TEXT',
    cert_number:    'TEXT',
  });
  await addMissingColumns(db, 'cloud_collections', { rules: 'TEXT' });
  await addMissingColumns(db, 'pending_ops', {
    status: `TEXT NOT NULL DEFAULT 'pending'`,
  });
}

// v1 → v2: drop the legacy SQLite-authoritative user tables. Cloud-sync used
// to drop these after every pull; any install that has synced since the
// cloud-authoritative rewrite no longer has them. Local-only rows that were
// never pushed are lost — an explicit product decision made at the time.
async function migration2DropLegacyTables(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    DROP TABLE IF EXISTS collection_cards;
    DROP TABLE IF EXISTS binders;
    DROP TABLE IF EXISTS binder_cards;
    DROP TABLE IF EXISTS wishlist_cards;
  `);
}

async function addMissingColumns(
  db: SQLite.SQLiteDatabase,
  table: string,
  columns: Record<string, string>,
): Promise<void> {
  const existing = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  const names = new Set(existing.map(c => c.name));
  for (const [col, type] of Object.entries(columns)) {
    if (!names.has(col)) {
      await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
    }
  }
}

// ─── Cache eviction ──────────────────────────────────────────────────────────
//
// cache reads already treat rows past their TTL as misses (lib/db/cache.ts);
// this sweep reclaims the space. Pricing rows expire after 12h, card rows
// after 7d — sweep with a grace factor so a row is never evicted while a
// reader could still consider it fresh. cache_cards is additionally capped:
// anything a collection item needs is re-seeded by the next cloud pull.

const PRICING_SWEEP_AGE_MS = 1000 * 60 * 60 * 24;          // 12h TTL × 2
const CARD_SWEEP_AGE_MS    = 1000 * 60 * 60 * 24 * 8;      // 7d TTL + 1d grace
const CARD_CACHE_MAX_ROWS  = 2000;

async function evictStaleCaches(db: SQLite.SQLiteDatabase): Promise<void> {
  try {
    const now = Date.now();
    await db.runAsync(
      `DELETE FROM cache_pricing WHERE fetched_at < ?`,
      [now - PRICING_SWEEP_AGE_MS],
    );
    await db.runAsync(
      `DELETE FROM cache_cards WHERE fetched_at < ?`,
      [now - CARD_SWEEP_AGE_MS],
    );
    await db.runAsync(
      `DELETE FROM cache_cards
        WHERE card_id NOT IN (
          SELECT card_id FROM cache_cards ORDER BY fetched_at DESC LIMIT ?
        )`,
      [CARD_CACHE_MAX_ROWS],
    );
  } catch (err) {
    // Eviction is housekeeping — never block app start on it.
    if (__DEV__) console.warn('[db] cache eviction failed:', err);
  }
}
