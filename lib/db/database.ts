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
// The legacy collection_cards / binders / binder_cards / wishlist_cards tables
// are dropped by lib/db/cloud-sync.ts on first authenticated launch — any
// rows the user had that weren't already pushed to Supabase are lost (this
// was an explicit product decision; see PR for context).
//
// cache_cards / cache_pricing are read caches for the Scrydex-backed data
// and stay as they were — they're not user mutations.

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return Promise.resolve(_db);
  if (_init) return _init;
  _init = SQLite.openDatabaseAsync('pokevault.db').then(async db => {
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
        kind        TEXT NOT NULL,           -- 'collection' | 'wishlist' | 'binder' | 'for_trade'
        name        TEXT NOT NULL,
        description TEXT,
        tone_start  TEXT,
        tone_end    TEXT,
        is_public   INTEGER NOT NULL DEFAULT 0,
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
        acquired_at     INTEGER                -- epoch ms; null = unknown
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
    await migrateAddColumns(db);
    _db = db;
    return db;
  });
  return _init;
}

// SQLite has no ADD COLUMN IF NOT EXISTS — inspect the schema and add the
// missing ones. Safe to call repeatedly. Add new column migrations here as
// the mirror schema evolves.
async function migrateAddColumns(db: SQLite.SQLiteDatabase): Promise<void> {
  const itemCols = await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(cloud_collection_items)`,
  );
  const itemNames = new Set(itemCols.map(c => c.name));
  if (!itemNames.has('acquired_price')) {
    await db.execAsync(`ALTER TABLE cloud_collection_items ADD COLUMN acquired_price REAL`);
  }
  if (!itemNames.has('acquired_at')) {
    await db.execAsync(`ALTER TABLE cloud_collection_items ADD COLUMN acquired_at INTEGER`);
  }

  const collCols = await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(cloud_collections)`,
  );
  const collNames = new Set(collCols.map(c => c.name));
  if (!collNames.has('rules')) {
    // Stored as JSON-encoded TEXT; null = manual binder.
    await db.execAsync(`ALTER TABLE cloud_collections ADD COLUMN rules TEXT`);
  }

  const opCols = await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(pending_ops)`,
  );
  const opNames = new Set(opCols.map(c => c.name));
  if (!opNames.has('status')) {
    await db.execAsync(`ALTER TABLE pending_ops ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'`);
  }
}

// Called once per authenticated session by cloud-sync after the initial pull
// completes. Drops any legacy user-data tables — the explicit product choice
// is that local-only rows are lost when this version first launches.
// Idempotent: safe to call multiple times.
export async function dropLegacyUserTables(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    DROP TABLE IF EXISTS collection_cards;
    DROP TABLE IF EXISTS binders;
    DROP TABLE IF EXISTS binder_cards;
    DROP TABLE IF EXISTS wishlist_cards;
  `);
}
