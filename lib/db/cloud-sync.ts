// Cloud-authoritative sync engine for collections / binders / wishlist.
//
// Architecture:
//   • Supabase tables (`collections`, `collection_items`) are the source of
//     truth — surviving uninstall, accessible across devices, visible to
//     friends via RLS.
//   • SQLite tables (`cloud_collections`, `cloud_collection_items`) are an
//     eager-loaded mirror so reads are instant and offline-capable.
//   • Every mutation is written *optimistically* to the mirror with a
//     client-generated UUID, then enqueued in `pending_ops`. A background
//     flusher drains the queue against Supabase; failed ops back off and
//     retry. The client UUID is the row's permanent primary key on both
//     sides, making the cloud insert idempotent.
//   • On sign-in we pull the user's collections + items into the mirror.
//     Per product decision the legacy SQLite-only tables (collection_cards,
//     binders, binder_cards, wishlist_cards) are dropped at that point.

import type { SQLiteDatabase } from 'expo-sqlite';
import { supabase } from '@/lib/supabase';
import { TONE_PAIRS } from '@/lib/binder-tones';
import { CARD_SELECT, mapRow, SupabaseCardFull } from '@/lib/api/types';
import { getDb } from './database';
import { Card } from '@/types';

// ─── Types & helpers ─────────────────────────────────────────────────────────

export type CollectionKind = 'collection' | 'wishlist' | 'binder';

export interface SmartBinderRules {
  match:      'all' | 'any';
  sets?:      string[];        // upper-cased set names
  rarities?:  string[];
  supertypes?:string[];        // 'Pokémon' | 'Trainer' | 'Energy'
  variants?:  string[];        // 'EX' | 'V' | 'VMAX' …
  nameMatch?: string;          // case-insensitive substring of the card name, e.g. "Charizard"
  minValue?:  number;
  maxValue?:  number;
  foilOnly?:  boolean;
  // When true the binder is an *auto-filing* binder rather than a live virtual
  // filter: cards entering the main collection that match these rules are
  // copied in as real, persistent rows (and a one-time backfill files existing
  // matches). Persistent membership survives the card later leaving the
  // collection or the rules changing — unlike the virtual default. Not a filter
  // condition; ignored by cardMatchesRules / rulesHaveAtLeastOneFilter.
  autoAdd?:   boolean;
}

export interface MirrorCollection {
  id: string;
  user_id: string;
  kind: CollectionKind;
  name: string;
  description: string | null;
  tone_start: string | null;
  tone_end: string | null;
  is_public: boolean;
  rules: SmartBinderRules | null;
  created_at: number;
  updated_at: number;
}

export interface MirrorItem {
  id: string;
  collection_id: string;
  card_id: string;
  card_json: string;
  quantity: number;
  position: number;
  added_at: number;
  acquired_price: number | null;  // USD, null = unknown
  acquired_at: number | null;     // epoch ms, null = unknown
  variant_id: string | null;      // card_variants UUID; null = "any printing"
  variant_name: string | null;    // Scrydex variant name (display snapshot)
  condition: string | null;       // NM | LP | MP | HP | DM (raw copies)
  grader: string | null;          // PSA | CGC | BGS | TAG | ACE (graded copies)
  grade: string | null;           // '10' | '9.5' | … (graded copies)
  cert_number: string | null;     // optional graded cert / pop lookup
}

/**
 * Per-copy attributes captured when adding a card. A held card is a specific
 * physical copy: a raw Holo NM and a PSA 10 of the same `card_id` are distinct
 * entries with distinct values. All fields optional — omitting them (e.g. from
 * wishlist / binder adds) preserves the legacy "any printing, ungraded" copy.
 */
export interface ItemDetails {
  variantId?: string | null;
  variantName?: string | null;
  condition?: string | null;
  grader?: string | null;
  grade?: string | null;
  certNumber?: string | null;
  // Effective market value for this copy (graded market for a graded copy,
  // else the selected variant's raw NM price). Snapshotted into card_json so
  // portfolio totals / sort / filter read the right number without re-fetching.
  value?: number | null;
}

/**
 * Apply a copy's value snapshot onto a base card. Graded copies suppress the
 * raw 7d/30d trend (it would be misleading). Used at add-time and on re-pull.
 */
export function applyCopyValue(base: Card, details: ItemDetails | null | undefined): Card {
  if (!details) return base;
  const graded = !!(details.grader && details.grade);
  if (details.value != null) {
    return graded
      ? { ...base, value: details.value, change: 0, trend30d: null }
      : { ...base, value: details.value };
  }
  return graded ? { ...base, change: 0, trend30d: null } : base;
}

export type GradingStage =
  | 'received' | 'research' | 'grading' | 'shipped_back' | 'completed';

export interface MirrorGrading {
  id:              string;
  user_id:         string;
  card_id:         string;
  card_name:       string;
  card_set:        string | null;
  grader:          string;
  submission_id:   string | null;
  stage:           GradingStage;
  submitted_at:    number;
  returned_at:     number | null;
  returned_grade:  string | null;
  declared_value:  number | null;
  notes:           string | null;
  created_at:      number;
  updated_at:      number;
}

export interface MirrorSale {
  id: string;
  user_id: string;
  collection_id: string | null;
  card_id: string;
  card_name: string;
  card_set: string | null;
  cost_basis: number | null;
  sale_price: number;
  currency: string;
  sold_at: number;
  notes: string | null;
  created_at: number;
}

export type BinderMediaKind = 'tile' | 'background';

/** Per-image transform for a tile/background (optional fit/pan/zoom). Stored as
 *  JSON in `transform`; null = default fit. Reserved for a future editor — the
 *  current renderer reads only `cell_mask` + `kind`. */
export interface BinderMediaTransform {
  fitMode?: 'page' | 'bbox';
  scale?: number;
  offsetX?: number;
  offsetY?: number;
}

export interface MirrorBinderMedia {
  id: string;
  binder_id: string;
  user_id: string;
  page_num: number;
  kind: BinderMediaKind;
  cell_mask: number;          // bits 0..8 = occupied cells (tiles); 0 for backgrounds
  storage_key: string;        // public URL into the binder-media bucket
  transform: BinderMediaTransform | null;
  created_at: number;
  updated_at: number;
}

// RFC4122 v4 UUID without pulling in expo-crypto. The harness collision
// chance for a single device's lifetime is astronomically low.
export function uuidv4(): string {
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return (
    hex.slice(0, 8) + '-' +
    hex.slice(8, 12) + '-' +
    hex.slice(12, 16) + '-' +
    hex.slice(16, 20) + '-' +
    hex.slice(20)
  );
}

// ─── Sync lock ───────────────────────────────────────────────────────────────

// Serializes the destructive mirror swap (pull) against the queue flusher.
// Without it, a flush can apply ops to the cloud while a pull is mid-swap,
// resurrecting deleted rows or losing optimistic writes from the mirror.
let _syncLock: Promise<unknown> = Promise.resolve();

function withSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = _syncLock.then(fn, fn);
  _syncLock = run.catch(() => {});
  return run;
}

// ─── Local wipe ──────────────────────────────────────────────────────────────

/**
 * Purge every per-user local table: the cloud mirror AND the pending-ops
 * queue. Called on sign-out so the next account on this device can't read
 * the previous user's collection or flush their queued mutations under the
 * new credentials.
 */
export async function wipeLocalUserData(): Promise<void> {
  const db = await getDb();
  await withSyncLock(() =>
    db.withTransactionAsync(async () => {
      await db.execAsync(`
        DELETE FROM cloud_collections;
        DELETE FROM cloud_collection_items;
        DELETE FROM cloud_card_sales;
        DELETE FROM cloud_card_grading;
        DELETE FROM cloud_binder_media;
        DELETE FROM pending_ops;
      `);
    }),
  );
}

/**
 * Wipe local user data if the mirror holds rows belonging to someone other
 * than `userId`. Covers the path where the previous session ended without a
 * clean sign-out (token expired while the app was closed) and a different
 * account signs in.
 */
export async function wipeIfForeignUserData(userId: string): Promise<void> {
  const db = await getDb();
  const foreign = await db.getFirstAsync<{ ok: number }>(
    `SELECT 1 AS ok FROM cloud_collections WHERE user_id != ? LIMIT 1`,
    [userId],
  );
  if (foreign) await wipeLocalUserData();
}

// ─── Batched inserts ─────────────────────────────────────────────────────────

type SqlValue = string | number | null;

/**
 * Multi-row INSERT in chunks sized to stay under SQLite's bind-variable limit
 * (999 by default). One statement per chunk instead of one per row — the
 * sign-in pull repopulates the whole mirror, so this is the hot path.
 */
async function insertRows(
  db: SQLiteDatabase,
  prefix: string, // e.g. `INSERT INTO t (a, b)` or `INSERT OR REPLACE INTO t (a, b)`
  columnCount: number,
  rows: SqlValue[][],
): Promise<void> {
  if (rows.length === 0) return;
  const rowsPerChunk = Math.max(1, Math.floor(900 / columnCount));
  const placeholderRow = `(${Array(columnCount).fill('?').join(', ')})`;
  for (let i = 0; i < rows.length; i += rowsPerChunk) {
    const chunk = rows.slice(i, i + rowsPerChunk);
    await db.runAsync(
      `${prefix} VALUES ${Array(chunk.length).fill(placeholderRow).join(', ')}`,
      chunk.flat(),
    );
  }
}

// ─── Pull from cloud ─────────────────────────────────────────────────────────

/**
 * Replace the local mirror with the user's authoritative cloud state.
 * Runs on sign-in and on demand (e.g. pull-to-refresh). The queue is drained
 * first; if undrained ops remain (offline, cloud erroring) the destructive
 * swap is skipped so optimistic local writes aren't clobbered.
 */
export async function pullCollectionsFromCloud(userId: string): Promise<void> {
  // Drain the queue first so cloud state reflects local mutations before we
  // mirror it back down.
  await flushPendingOps();
  return withSyncLock(() => doPull(userId));
}

async function doPull(userId: string): Promise<void> {
  // 1. Fetch collections + items in two queries.
  const { data: collectionsData, error: cErr } = await supabase
    .from('collections')
    .select('id, user_id, kind, name, description, tone_start, tone_end, is_public, rules, cover_card_ids, created_at, updated_at')
    .eq('user_id', userId);
  if (cErr) throw new Error(`pull collections: ${cErr.message}`);

  const collectionIds = (collectionsData ?? []).map(c => (c as { id: string }).id);

  type ItemRow = {
    id: string;
    collection_id: string;
    card_id: string;
    quantity: number;
    position: number;
    created_at: string;
    acquired_price: number | null;
    acquired_at: string | null;
    variant_id: string | null;
    condition: string | null;
    grader: string | null;
    grade: string | null;
    cert_number: string | null;
    cards: { id: string; name: string; rarity: string | null } | null;
  };

  let items: ItemRow[] = [];
  if (collectionIds.length > 0) {
    const { data, error: iErr } = await supabase
      .from('collection_items')
      .select('id, collection_id, card_id, quantity, position, created_at, acquired_price, acquired_at, variant_id, condition, grader, grade, cert_number')
      .in('collection_id', collectionIds);
    if (iErr) throw new Error(`pull items: ${iErr.message}`);
    items = (data ?? []) as ItemRow[];
  }

  // Pull realized sales ledger.
  type SaleRow = {
    id: string;
    user_id: string;
    collection_id: string | null;
    card_id: string;
    card_name: string;
    card_set: string | null;
    cost_basis: number | null;
    sale_price: number;
    currency: string;
    sold_at: string;
    notes: string | null;
    created_at: string;
  };
  const { data: salesData, error: sErr } = await supabase
    .from('card_sales')
    .select('id, user_id, collection_id, card_id, card_name, card_set, cost_basis, sale_price, currency, sold_at, notes, created_at')
    .eq('user_id', userId);
  if (sErr) throw new Error(`pull sales: ${sErr.message}`);
  const sales: SaleRow[] = (salesData ?? []) as SaleRow[];

  // Pull grading queue.
  type GradingRow = {
    id: string; user_id: string; card_id: string;
    card_name: string; card_set: string | null;
    grader: string; submission_id: string | null; stage: string;
    submitted_at: string; returned_at: string | null;
    returned_grade: string | null; declared_value: number | null;
    notes: string | null; created_at: string; updated_at: string;
  };
  const { data: gradingData, error: gErr } = await supabase
    .from('card_grading_submissions')
    .select('id, user_id, card_id, card_name, card_set, grader, submission_id, stage, submitted_at, returned_at, returned_grade, declared_value, notes, created_at, updated_at')
    .eq('user_id', userId);
  if (gErr) throw new Error(`pull grading: ${gErr.message}`);
  const grading: GradingRow[] = (gradingData ?? []) as GradingRow[];

  // Pull binder media (photo tiles + full-page backgrounds).
  type BinderMediaRow = {
    id: string; binder_id: string; user_id: string;
    page_num: number; kind: string; cell_mask: number;
    storage_key: string; transform: unknown | null;
    created_at: string; updated_at: string;
  };
  const { data: mediaData, error: mErr } = await supabase
    .from('binder_media')
    .select('id, binder_id, user_id, page_num, kind, cell_mask, storage_key, transform, created_at, updated_at')
    .eq('user_id', userId);
  if (mErr) throw new Error(`pull binder media: ${mErr.message}`);
  const media: BinderMediaRow[] = (mediaData ?? []) as BinderMediaRow[];

  // 2. Hydrate card_json for items. First read the local cache_cards mirror;
  // for ids not in the cache (e.g. a fresh install where the cache is empty)
  // fetch the real card rows from Supabase so items rehydrate with their true
  // name / art / value instead of a placeholder. Only ids that can't be found
  // anywhere fall through to placeholderCard below.
  const db = await getDb();
  const cardIds = [...new Set(items.map(i => i.card_id))];
  const cachedById = new Map<string, Card>();
  if (cardIds.length > 0) {
    const placeholders = cardIds.map(() => '?').join(',');
    const rows = await db.getAllAsync<{ card_id: string; card_json: string }>(
      `SELECT card_id, card_json FROM cache_cards WHERE card_id IN (${placeholders})`,
      cardIds,
    );
    for (const r of rows) {
      try {
        cachedById.set(r.card_id, JSON.parse(r.card_json) as Card);
      } catch {
        // bad cache entry — fall through to a network fetch / placeholder
      }
    }

    // Ids still missing after the local cache read — fetch them from the
    // `cards` table (the authoritative card metadata source) and seed the
    // local cache so subsequent reads stay offline-capable.
    const missing = cardIds.filter(id => !cachedById.has(id));
    const now = Date.now();
    for (let i = 0; i < missing.length; i += 100) {
      const chunk = missing.slice(i, i + 100);
      const { data, error } = await supabase
        .from('cards')
        .select(CARD_SELECT)
        .in('id', chunk);
      if (error) {
        // Non-fatal: leave these ids to placeholderCard. A later card view or
        // the next pull will backfill them.
        if (__DEV__) console.warn('[cloud-sync] pull card hydration failed:', error.message);
        break;
      }
      const seedRows: SqlValue[][] = [];
      for (const raw of (data ?? []) as unknown as SupabaseCardFull[]) {
        const card = mapRow(raw);
        cachedById.set(card.id, card);
        seedRows.push([card.id, JSON.stringify(card), now]);
      }
      await insertRows(
        db,
        `INSERT OR REPLACE INTO cache_cards (card_id, card_json, fetched_at)`,
        3,
        seedRows,
      );
    }
  }

  // 2b. Snapshot prior per-item values so a re-pull on the same device keeps
  // graded copies' valuations (the cloud has no value column — value lives in
  // card_json, which we rebuild from cache_cards below). Keyed by item id.
  const priorValueById = new Map<string, number>();
  {
    const prior = await db.getAllAsync<{ id: string; card_json: string }>(
      `SELECT id, card_json FROM cloud_collection_items`,
    );
    for (const r of prior) {
      try {
        const v = (JSON.parse(r.card_json) as Card).value;
        if (typeof v === 'number') priorValueById.set(r.id, v);
      } catch {
        // ignore unparseable cache row
      }
    }
  }

  // 3. Atomic swap: clear + repopulate the mirror in a single transaction.
  // Re-check the queue inside the transaction: an op enqueued while we were
  // fetching (or stuck offline) means the cloud snapshot we hold is already
  // stale relative to local intent — skip the swap and keep the optimistic
  // mirror; the next pull after the queue drains will reconcile.
  await db.withTransactionAsync(async () => {
    const undrained = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM pending_ops WHERE status != 'failed'`,
    );
    if ((undrained?.n ?? 0) > 0) return;
    await db.execAsync(`DELETE FROM cloud_collections; DELETE FROM cloud_collection_items; DELETE FROM cloud_card_sales; DELETE FROM cloud_card_grading; DELETE FROM cloud_binder_media;`);

    const collectionRows: SqlValue[][] = (collectionsData ?? []).map(raw => {
      const c = raw as {
        id: string;
        user_id: string;
        kind: CollectionKind;
        name: string;
        description: string | null;
        tone_start: string | null;
        tone_end: string | null;
        is_public: boolean;
        rules: SmartBinderRules | null | undefined;
        cover_card_ids: string[] | null | undefined;
        created_at: string;
        updated_at: string;
      };
      return [
        c.id, c.user_id, c.kind, c.name, c.description,
        c.tone_start, c.tone_end, c.is_public ? 1 : 0,
        c.rules ? JSON.stringify(c.rules) : null,
        c.cover_card_ids && c.cover_card_ids.length > 0 ? JSON.stringify(c.cover_card_ids) : null,
        new Date(c.created_at).getTime(),
        new Date(c.updated_at).getTime(),
      ];
    });
    await insertRows(
      db,
      `INSERT INTO cloud_collections
       (id, user_id, kind, name, description, tone_start, tone_end, is_public, rules, cover_card_ids, created_at, updated_at)`,
      12,
      collectionRows,
    );

    const itemRows: SqlValue[][] = [];
    for (const it of items) {
      const base: Card = cachedById.get(it.card_id) ?? placeholderCard(it.card_id);
      // Re-apply this copy's value snapshot. Raw variant copies recompute from
      // the cached card's variant prices (cheap, always fresh); graded copies
      // carry forward the prior local value when known.
      const graded = !!(it.grader && it.grade);
      let value: number | null | undefined;
      if (graded) {
        value = priorValueById.get(it.id);
      } else if (it.variant_id) {
        value = base.variantPrices?.find(v => v.id === it.variant_id)?.price ?? undefined;
      }
      const card = applyCopyValue(base, {
        variantId: it.variant_id, grader: it.grader, grade: it.grade,
        value: value ?? undefined,
      });
      // variant_name is a local display snapshot (not stored cloud-side) —
      // derive it from the cached card's variant prices.
      const variantName = it.variant_id
        ? base.variantPrices?.find(v => v.id === it.variant_id)?.displayName ?? null
        : null;
      itemRows.push([
        it.id, it.collection_id, it.card_id, JSON.stringify(card),
        it.quantity, it.position,
        new Date(it.created_at).getTime(),
        it.acquired_price,
        it.acquired_at ? new Date(it.acquired_at).getTime() : null,
        it.variant_id, variantName, it.condition, it.grader, it.grade, it.cert_number,
      ]);
    }
    await insertRows(
      db,
      `INSERT INTO cloud_collection_items
       (id, collection_id, card_id, card_json, quantity, position, added_at, acquired_price, acquired_at,
        variant_id, variant_name, condition, grader, grade, cert_number)`,
      15,
      itemRows,
    );

    await insertRows(
      db,
      `INSERT INTO cloud_card_sales
       (id, user_id, collection_id, card_id, card_name, card_set, cost_basis, sale_price, currency, sold_at, notes, created_at)`,
      12,
      sales.map(s => [
        s.id, s.user_id, s.collection_id, s.card_id, s.card_name, s.card_set,
        s.cost_basis, s.sale_price, s.currency,
        new Date(s.sold_at).getTime(),
        s.notes,
        new Date(s.created_at).getTime(),
      ]),
    );

    await insertRows(
      db,
      `INSERT INTO cloud_card_grading
       (id, user_id, card_id, card_name, card_set, grader, submission_id, stage,
        submitted_at, returned_at, returned_grade, declared_value, notes, created_at, updated_at)`,
      15,
      grading.map(g => [
        g.id, g.user_id, g.card_id, g.card_name, g.card_set,
        g.grader, g.submission_id, g.stage,
        new Date(g.submitted_at).getTime(),
        g.returned_at ? new Date(g.returned_at).getTime() : null,
        g.returned_grade, g.declared_value, g.notes,
        new Date(g.created_at).getTime(),
        new Date(g.updated_at).getTime(),
      ]),
    );

    await insertRows(
      db,
      `INSERT INTO cloud_binder_media
       (id, binder_id, user_id, page_num, kind, cell_mask, storage_key, transform, created_at, updated_at)`,
      10,
      media.map(m => [
        m.id, m.binder_id, m.user_id, m.page_num,
        m.kind === 'background' ? 'background' : 'tile',
        m.cell_mask ?? 0,
        m.storage_key,
        m.transform != null ? JSON.stringify(m.transform) : null,
        new Date(m.created_at).getTime(),
        new Date(m.updated_at).getTime(),
      ]),
    );
  });
}

function placeholderCard(cardId: string): Card {
  return {
    id: cardId,
    name: cardId,
    variant: '—',
    set: '',
    no: '',
    release: '',
    rarity: 'Unknown',
    value: 0,
    change: 0,
    trend30d: null,
    foil: false,
    art: ['#1F0E3A', '#2D1B5E', '#1F0E3A'],
    creature: '○',
    types: ['dark'],
    artist: '',
  };
}

// ─── Pending ops queue ───────────────────────────────────────────────────────

export type PendingOp =
  | { op_type: 'create_collection'; payload: { id: string; kind: CollectionKind; name: string; tone_start?: string | null; tone_end?: string | null; is_public?: boolean } }
  | { op_type: 'delete_collection'; payload: { id: string } }
  | { op_type: 'rename_collection'; payload: { id: string; name: string } }
  | { op_type: 'add_item';          payload: { id: string; collection_id: string; card_id: string; quantity?: number; position?: number; variant_id?: string | null; condition?: string | null; grader?: string | null; grade?: string | null; cert_number?: string | null } }
  | { op_type: 'remove_item';       payload: { id: string } }
  | { op_type: 'remove_item_by_card'; payload: { collection_id: string; card_id: string } }
  | { op_type: 'set_cost_basis';    payload: { collection_id: string; card_id: string; acquired_price: number | null; acquired_at: string | null } }
  | { op_type: 'set_cost_basis_by_id'; payload: { id: string; acquired_price: number | null; acquired_at: string | null } }
  | { op_type: 'record_sale';       payload: { id: string; collection_id: string | null; card_id: string; card_name: string; card_set: string | null; cost_basis: number | null; sale_price: number; sold_at: string } }
  | { op_type: 'set_collection_visibility'; payload: { id: string; is_public: boolean } }
  | { op_type: 'upsert_grading';    payload: GradingUpsertPayload }
  | { op_type: 'delete_grading';    payload: { id: string } }
  | { op_type: 'set_collection_rules'; payload: { id: string; rules: SmartBinderRules | null } }
  | { op_type: 'set_collection_cover'; payload: { id: string; cover_card_ids: string[] | null } }
  | { op_type: 'reorder_item';      payload: { id: string; position: number } }
  | { op_type: 'add_binder_media';    payload: { id: string; binder_id: string; page_num: number; kind: BinderMediaKind; cell_mask: number; storage_key: string; transform: unknown | null } }
  | { op_type: 'update_binder_media'; payload: { id: string; page_num?: number; cell_mask?: number; transform?: unknown | null } }
  | { op_type: 'remove_binder_media'; payload: { id: string } };

export interface GradingUpsertPayload {
  id: string;
  card_id: string;
  card_name: string;
  card_set: string | null;
  grader: string;
  submission_id: string | null;
  stage: GradingStage;
  submitted_at: string;            // ISO date
  returned_at: string | null;      // ISO date
  returned_grade: string | null;
  declared_value: number | null;
  notes: string | null;
}

async function enqueue(op: PendingOp): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO pending_ops (op_type, payload, created_at) VALUES (?, ?, ?)`,
    [op.op_type, JSON.stringify(op.payload), Date.now()],
  );
  // Fire-and-forget flush — best-effort drain after every enqueue.
  flushPendingOps().catch(() => {});
}

// ─── Public mutation helpers (called from hooks) ─────────────────────────────

export interface CreateCollectionInput {
  userId: string;
  kind: CollectionKind;
  name: string;
  toneStart?: string;
  toneEnd?: string;
  rules?: SmartBinderRules | null;   // when non-null, binder is a smart binder
}

export async function createCollection(input: CreateCollectionInput): Promise<MirrorCollection> {
  const id = uuidv4();
  const now = Date.now();
  const tone = input.kind === 'binder'
    ? [input.toneStart ?? TONE_PAIRS[0][0], input.toneEnd ?? TONE_PAIRS[0][1]]
    : [input.toneStart ?? null, input.toneEnd ?? null];
  const rules = input.rules ?? null;

  const row: MirrorCollection = {
    id,
    user_id: input.userId,
    kind: input.kind,
    name: input.name,
    description: null,
    tone_start: tone[0],
    tone_end: tone[1],
    is_public: false,
    rules,
    created_at: now,
    updated_at: now,
  };

  const db = await getDb();
  await db.runAsync(
    `INSERT INTO cloud_collections
     (id, user_id, kind, name, description, tone_start, tone_end, is_public, rules, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.user_id, row.kind, row.name, null, row.tone_start, row.tone_end, 0,
     rules ? JSON.stringify(rules) : null, now, now],
  );

  await enqueue({
    op_type: 'create_collection',
    payload: {
      id,
      kind: input.kind,
      name: input.name,
      tone_start: row.tone_start,
      tone_end: row.tone_end,
    },
  });
  // create_collection's payload doesn't include rules — push them as a
  // separate op so the cloud row is updated after creation lands.
  if (rules) {
    await enqueue({ op_type: 'set_collection_rules', payload: { id, rules } });
  }
  return row;
}

/** Set or clear the rules JSON for a smart binder. Pass `null` to convert
 *  the binder back to a manual one. */
export async function setCollectionRules(id: string, rules: SmartBinderRules | null): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE cloud_collections SET rules = ?, updated_at = ? WHERE id = ?`,
    [rules ? JSON.stringify(rules) : null, Date.now(), id],
  );
  await enqueue({ op_type: 'set_collection_rules', payload: { id, rules } });
}

/** Choose the binder's cover cards (up to two card ids), or pass `null` to fall
 *  back to the first two cards by position. */
export async function setCollectionCover(id: string, coverCardIds: string[] | null): Promise<void> {
  const db = await getDb();
  const value = coverCardIds && coverCardIds.length > 0 ? coverCardIds.slice(0, 2) : null;
  await db.runAsync(
    `UPDATE cloud_collections SET cover_card_ids = ?, updated_at = ? WHERE id = ?`,
    [value ? JSON.stringify(value) : null, Date.now(), id],
  );
  await enqueue({ op_type: 'set_collection_cover', payload: { id, cover_card_ids: value } });
}

export async function deleteCollection(id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM cloud_collection_items WHERE collection_id = ?`, [id]);
    await db.runAsync(`DELETE FROM cloud_collections WHERE id = ?`, [id]);
  });
  await enqueue({ op_type: 'delete_collection', payload: { id } });
}

export async function renameCollection(id: string, name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE cloud_collections SET name = ?, updated_at = ? WHERE id = ?`,
    [name, Date.now(), id],
  );
  await enqueue({ op_type: 'rename_collection', payload: { id, name } });
}

// ─── Grading submissions ─────────────────────────────────────────────────────

export interface GradingUpsertInput {
  id?: string;                       // omit for new, supply to update
  userId: string;
  cardId: string;
  cardName: string;
  cardSet: string | null;
  grader: string;
  submissionId?: string | null;
  stage: GradingStage;
  submittedAtMs: number;
  returnedAtMs?: number | null;
  returnedGrade?: string | null;
  declaredValue?: number | null;
  notes?: string | null;
}

/** Insert or update a grading submission. Upsert keyed on the row id. */
export async function upsertGradingSubmission(input: GradingUpsertInput): Promise<string> {
  const db = await getDb();
  const id = input.id ?? uuidv4();
  const now = Date.now();
  const existing = await db.getFirstAsync<{ id: string; created_at: number }>(
    `SELECT id, created_at FROM cloud_card_grading WHERE id = ?`,
    [id],
  );
  const createdAt = existing?.created_at ?? now;

  if (existing) {
    await db.runAsync(
      `UPDATE cloud_card_grading
          SET card_id = ?, card_name = ?, card_set = ?, grader = ?,
              submission_id = ?, stage = ?, submitted_at = ?, returned_at = ?,
              returned_grade = ?, declared_value = ?, notes = ?, updated_at = ?
        WHERE id = ?`,
      [
        input.cardId, input.cardName, input.cardSet, input.grader,
        input.submissionId ?? null, input.stage,
        input.submittedAtMs, input.returnedAtMs ?? null,
        input.returnedGrade ?? null, input.declaredValue ?? null,
        input.notes ?? null, now, id,
      ],
    );
  } else {
    await db.runAsync(
      `INSERT INTO cloud_card_grading
       (id, user_id, card_id, card_name, card_set, grader, submission_id, stage,
        submitted_at, returned_at, returned_grade, declared_value, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, input.userId, input.cardId, input.cardName, input.cardSet,
        input.grader, input.submissionId ?? null, input.stage,
        input.submittedAtMs, input.returnedAtMs ?? null,
        input.returnedGrade ?? null, input.declaredValue ?? null,
        input.notes ?? null, createdAt, now,
      ],
    );
  }

  await enqueue({
    op_type: 'upsert_grading',
    payload: {
      id,
      card_id:        input.cardId,
      card_name:      input.cardName,
      card_set:       input.cardSet,
      grader:         input.grader,
      submission_id:  input.submissionId ?? null,
      stage:          input.stage,
      submitted_at:   new Date(input.submittedAtMs).toISOString().slice(0, 10),
      returned_at:    input.returnedAtMs ? new Date(input.returnedAtMs).toISOString().slice(0, 10) : null,
      returned_grade: input.returnedGrade ?? null,
      declared_value: input.declaredValue ?? null,
      notes:          input.notes ?? null,
    },
  });
  return id;
}

export async function deleteGradingSubmission(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM cloud_card_grading WHERE id = ?`, [id]);
  await enqueue({ op_type: 'delete_grading', payload: { id } });
}

/** Toggle the `is_public` flag on a collection. RLS makes the row visible to
 *  any signed-in user when public, and only to the owner when private. */
export async function setCollectionVisibility(id: string, isPublic: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE cloud_collections SET is_public = ?, updated_at = ? WHERE id = ?`,
    [isPublic ? 1 : 0, Date.now(), id],
  );
  await enqueue({ op_type: 'set_collection_visibility', payload: { id, is_public: isPublic } });
}

/**
 * Add a card to a collection as a specific physical copy. Idempotency is keyed
 * on the full tuple (collection_id, card_id, variant_id, condition, grader,
 * grade) — adding an *identical* copy is a no-op, but a different variant or
 * grade creates a new row (multiple distinct copies are supported). Passing no
 * `details` (e.g. wishlist / binder adds) preserves the legacy one-per-card,
 * "any printing, ungraded" behavior. Returns the resulting mirror row, or null
 * when the identical copy already exists. The chosen value is snapshotted into
 * card_json so portfolio totals reflect the actual copy held.
 */
export async function addItemToCollection(
  collectionId: string,
  card: Card,
  details?: ItemDetails,
  position = 0,
): Promise<MirrorItem | null> {
  const db = await getDb();
  const variantId  = details?.variantId ?? null;
  const variantName = details?.variantName ?? null;
  const condition  = details?.condition ?? null;
  const grader     = details?.grader ?? null;
  const grade      = details?.grade ?? null;
  const certNumber = details?.certNumber ?? null;

  const existing = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM cloud_collection_items
      WHERE collection_id = ? AND card_id = ?
        AND IFNULL(variant_id, '') = IFNULL(?, '')
        AND IFNULL(condition, '')  = IFNULL(?, '')
        AND IFNULL(grader, '')     = IFNULL(?, '')
        AND IFNULL(grade, '')      = IFNULL(?, '')`,
    [collectionId, card.id, variantId, condition, grader, grade],
  );
  if (existing) return null; // no-op — identical copy already held

  const id = uuidv4();
  const now = Date.now();
  const snapshot = applyCopyValue(card, details);
  const cardJson = JSON.stringify(snapshot);
  await db.runAsync(
    `INSERT INTO cloud_collection_items
     (id, collection_id, card_id, card_json, quantity, position, added_at,
      variant_id, variant_name, condition, grader, grade, cert_number)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, collectionId, card.id, cardJson, 1, position, now,
     variantId, variantName, condition, grader, grade, certNumber],
  );

  await enqueue({
    op_type: 'add_item',
    payload: {
      id, collection_id: collectionId, card_id: card.id, position,
      variant_id: variantId, condition, grader, grade, cert_number: certNumber,
    },
  });

  return {
    id,
    collection_id: collectionId,
    card_id: card.id,
    card_json: cardJson,
    quantity: 1,
    position,
    added_at: now,
    acquired_price: null,
    acquired_at: null,
    variant_id: variantId,
    variant_name: variantName,
    condition,
    grader,
    grade,
    cert_number: certNumber,
  };
}

export async function removeItemFromCollectionByCard(
  collectionId: string,
  cardId: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM cloud_collection_items WHERE collection_id = ? AND card_id = ?`,
    [collectionId, cardId],
  );
  await enqueue({
    op_type: 'remove_item_by_card',
    payload: { collection_id: collectionId, card_id: cardId },
  });
}

/** Remove a single copy by its item id. Use when multiple copies of the same
 *  card may be held and only one should be removed. */
export async function removeItemById(itemId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM cloud_collection_items WHERE id = ?`, [itemId]);
  await enqueue({ op_type: 'remove_item', payload: { id: itemId } });
}

/**
 * Set or clear the cost basis (paid amount + acquisition date) for a card
 * already in a collection. Pass `acquiredPrice: null` to clear. No-op if the
 * card is not in the collection.
 */
export async function setItemCostBasis(
  collectionId: string,
  cardId: string,
  acquiredPrice: number | null,
  acquiredAt: number | null,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE cloud_collection_items
        SET acquired_price = ?, acquired_at = ?
      WHERE collection_id = ? AND card_id = ?`,
    [acquiredPrice, acquiredAt, collectionId, cardId],
  );
  await enqueue({
    op_type: 'set_cost_basis',
    payload: {
      collection_id: collectionId,
      card_id: cardId,
      acquired_price: acquiredPrice,
      // acquired_price is numeric, acquired_at is date — keep ISO string in cloud.
      acquired_at: acquiredAt ? new Date(acquiredAt).toISOString().slice(0, 10) : null,
    },
  });
}

/** Set/clear cost basis for a single copy by its item id (copy-aware variant
 *  of setItemCostBasis). */
export async function setItemCostBasisById(
  itemId: string,
  acquiredPrice: number | null,
  acquiredAt: number | null,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE cloud_collection_items SET acquired_price = ?, acquired_at = ? WHERE id = ?`,
    [acquiredPrice, acquiredAt, itemId],
  );
  await enqueue({
    op_type: 'set_cost_basis_by_id',
    payload: {
      id: itemId,
      acquired_price: acquiredPrice,
      acquired_at: acquiredAt ? new Date(acquiredAt).toISOString().slice(0, 10) : null,
    },
  });
}

/**
 * Record a realized sale (delta = sale_price − cost_basis) and remove the card
 * from the collection in the same transaction. cost_basis is snapshotted from
 * the item row so future cost-basis edits don't retroactively change history.
 */
export async function recordSaleAndRemove(
  userId: string,
  collectionId: string,
  card: Card,
  salePrice: number,
  soldAtMs: number = Date.now(),
): Promise<void> {
  const db = await getDb();
  const id = uuidv4();

  // Snapshot cost basis from the item row (may be null).
  const row = await db.getFirstAsync<{ acquired_price: number | null }>(
    `SELECT acquired_price FROM cloud_collection_items
      WHERE collection_id = ? AND card_id = ?`,
    [collectionId, card.id],
  );
  const costBasis = row?.acquired_price ?? null;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO cloud_card_sales
       (id, user_id, collection_id, card_id, card_name, card_set, cost_basis,
        sale_price, currency, sold_at, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, collectionId, card.id, card.name, card.set || null,
       costBasis, salePrice, 'USD', soldAtMs, null, Date.now()],
    );
    await db.runAsync(
      `DELETE FROM cloud_collection_items WHERE collection_id = ? AND card_id = ?`,
      [collectionId, card.id],
    );
  });

  await enqueue({
    op_type: 'record_sale',
    payload: {
      id,
      collection_id: collectionId,
      card_id: card.id,
      card_name: card.name,
      card_set: card.set || null,
      cost_basis: costBasis,
      sale_price: salePrice,
      sold_at: new Date(soldAtMs).toISOString(),
    },
  });
  await enqueue({
    op_type: 'remove_item_by_card',
    payload: { collection_id: collectionId, card_id: card.id },
  });
}

/**
 * Copy-aware sale: record a realized sale for a single copy (by item id) and
 * remove just that copy. cost_basis is snapshotted from the item row.
 */
export async function recordSaleAndRemoveById(
  userId: string,
  itemId: string,
  card: Card,
  salePrice: number,
  soldAtMs: number = Date.now(),
): Promise<void> {
  const db = await getDb();
  const id = uuidv4();

  const row = await db.getFirstAsync<{ collection_id: string; acquired_price: number | null }>(
    `SELECT collection_id, acquired_price FROM cloud_collection_items WHERE id = ?`,
    [itemId],
  );
  if (!row) return; // copy already gone
  const costBasis = row.acquired_price ?? null;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO cloud_card_sales
       (id, user_id, collection_id, card_id, card_name, card_set, cost_basis,
        sale_price, currency, sold_at, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, row.collection_id, card.id, card.name, card.set || null,
       costBasis, salePrice, 'USD', soldAtMs, null, Date.now()],
    );
    await db.runAsync(`DELETE FROM cloud_collection_items WHERE id = ?`, [itemId]);
  });

  await enqueue({
    op_type: 'record_sale',
    payload: {
      id,
      collection_id: row.collection_id,
      card_id: card.id,
      card_name: card.name,
      card_set: card.set || null,
      cost_basis: costBasis,
      sale_price: salePrice,
      sold_at: new Date(soldAtMs).toISOString(),
    },
  });
  await enqueue({ op_type: 'remove_item', payload: { id: itemId } });
}

// ─── Reorder ─────────────────────────────────────────────────────────────────

/**
 * Persist a new card ordering for a binder. `orderedItemIds` is the full list of
 * the binder's item ids in their desired order; rows are renumbered 0..n-1 in
 * the mirror and a `reorder_item` op is enqueued for each row that actually
 * moved. Idempotent — re-applying the same order is a no-op.
 */
export async function reorderBinder(binderId: string, orderedItemIds: string[]): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; position: number }>(
    `SELECT id, position FROM cloud_collection_items WHERE collection_id = ?`,
    [binderId],
  );
  const currentPos = new Map(rows.map(r => [r.id, r.position]));
  const changed: { id: string; position: number }[] = [];
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < orderedItemIds.length; i++) {
      const id = orderedItemIds[i];
      if (currentPos.get(id) === i) continue;
      await db.runAsync(`UPDATE cloud_collection_items SET position = ? WHERE id = ?`, [i, id]);
      changed.push({ id, position: i });
    }
  });
  for (const c of changed) {
    await enqueue({ op_type: 'reorder_item', payload: { id: c.id, position: c.position } });
  }
}

/**
 * Set explicit slot positions for specific binder items (slot = page·9 + cell),
 * leaving every other item untouched. Unlike reorderBinder this preserves gaps —
 * cards can sit in non-contiguous cells. Used by free-placement drag-and-drop
 * (move into an empty cell, or swap two cards' slots).
 */
export async function setBinderItemPositions(
  updates: { itemId: string; position: number }[],
): Promise<void> {
  if (updates.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const u of updates) {
      await db.runAsync(
        `UPDATE cloud_collection_items SET position = ? WHERE id = ?`,
        [u.position, u.itemId],
      );
    }
  });
  for (const u of updates) {
    await enqueue({ op_type: 'reorder_item', payload: { id: u.itemId, position: u.position } });
  }
}

// ─── Binder media (tiles / backgrounds) ──────────────────────────────────────

export interface AddBinderMediaInput {
  userId: string;
  binderId: string;
  pageNum: number;
  kind: BinderMediaKind;
  cellMask: number;          // ignored for backgrounds
  storageKey: string;        // public URL into the binder-media bucket
  transform?: BinderMediaTransform | null;
}

export async function addBinderMedia(input: AddBinderMediaInput): Promise<MirrorBinderMedia> {
  const db = await getDb();
  const id = uuidv4();
  const now = Date.now();
  const transform = input.transform ?? null;
  const cellMask = input.kind === 'background' ? 0 : input.cellMask;
  await db.runAsync(
    `INSERT INTO cloud_binder_media
       (id, binder_id, user_id, page_num, kind, cell_mask, storage_key, transform, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.binderId, input.userId, input.pageNum, input.kind, cellMask, input.storageKey,
     transform ? JSON.stringify(transform) : null, now, now],
  );
  await enqueue({
    op_type: 'add_binder_media',
    payload: {
      id, binder_id: input.binderId, page_num: input.pageNum, kind: input.kind,
      cell_mask: cellMask, storage_key: input.storageKey, transform,
    },
  });
  return {
    id, binder_id: input.binderId, user_id: input.userId, page_num: input.pageNum,
    kind: input.kind, cell_mask: cellMask, storage_key: input.storageKey,
    transform, created_at: now, updated_at: now,
  };
}

export async function updateBinderMedia(
  id: string,
  patch: { pageNum?: number; cellMask?: number; transform?: BinderMediaTransform | null },
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const args: SqlValue[] = [];
  if (patch.pageNum !== undefined)  { sets.push('page_num = ?');  args.push(patch.pageNum); }
  if (patch.cellMask !== undefined) { sets.push('cell_mask = ?'); args.push(patch.cellMask); }
  if (patch.transform !== undefined) {
    sets.push('transform = ?');
    args.push(patch.transform ? JSON.stringify(patch.transform) : null);
  }
  if (sets.length === 0) return;
  sets.push('updated_at = ?'); args.push(Date.now());
  args.push(id);
  await db.runAsync(`UPDATE cloud_binder_media SET ${sets.join(', ')} WHERE id = ?`, args);
  await enqueue({
    op_type: 'update_binder_media',
    payload: {
      id,
      ...(patch.pageNum  !== undefined ? { page_num: patch.pageNum } : {}),
      ...(patch.cellMask !== undefined ? { cell_mask: patch.cellMask } : {}),
      ...(patch.transform !== undefined ? { transform: patch.transform } : {}),
    },
  });
}

export async function removeBinderMedia(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM cloud_binder_media WHERE id = ?`, [id]);
  await enqueue({ op_type: 'remove_binder_media', payload: { id } });
}

// ─── Flusher ─────────────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 6;
// Exponential backoff in ms: 2s, 8s, 32s, 2m, 8m, 30m
const BACKOFF_MS = [2_000, 8_000, 32_000, 120_000, 480_000, 1_800_000];

let _flushInFlight: Promise<void> | null = null;

/**
 * Drain pending_ops in FIFO order. Best-effort: errors back off, succeeded
 * ops are deleted, permanently-failed ops are parked with status='failed'
 * (see useFailedOpsCount / retryFailedOps). Reentrant-safe — concurrent
 * callers share the same in-flight promise so we never run two flushers at
 * once, and the shared sync lock keeps flushes from interleaving with pulls.
 */
export function flushPendingOps(): Promise<void> {
  if (_flushInFlight) return _flushInFlight;
  _flushInFlight = withSyncLock(doFlush).finally(() => { _flushInFlight = null; });
  return _flushInFlight;
}

async function doFlush(): Promise<void> {
  const db = await getDb();

  while (true) {
    const op = await db.getFirstAsync<{
      id: number;
      op_type: string;
      payload: string;
      attempt_count: number;
      last_attempt_at: number | null;
    }>(
      `SELECT id, op_type, payload, attempt_count, last_attempt_at
         FROM pending_ops
        WHERE status != 'failed'
        ORDER BY id ASC
        LIMIT 1`,
    );
    if (!op) return;

    // Respect backoff window.
    if (op.last_attempt_at && op.attempt_count > 0) {
      const wait = BACKOFF_MS[Math.min(op.attempt_count - 1, BACKOFF_MS.length - 1)];
      if (Date.now() - op.last_attempt_at < wait) return; // come back later
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(op.payload);
    } catch {
      // Corrupt row — drop and continue.
      await db.runAsync(`DELETE FROM pending_ops WHERE id = ?`, [op.id]);
      continue;
    }

    try {
      await applyOpToCloud(op.op_type, payload);
      await db.runAsync(`DELETE FROM pending_ops WHERE id = ?`, [op.id]);
    } catch (err) {
      const nextAttempt = op.attempt_count + 1;
      const msg = err instanceof Error ? err.message : String(err);
      await db.runAsync(
        `UPDATE pending_ops
            SET attempt_count = ?,
                last_attempt_at = ?,
                last_error = ?
          WHERE id = ?`,
        [nextAttempt, Date.now(), msg.slice(0, 500), op.id],
      );
      if (nextAttempt >= MAX_ATTEMPTS) {
        // Permanently failed. Park it as a dead letter so it stops blocking
        // the queue but stays visible — the UI surfaces a banner offering
        // retry/discard instead of silently losing the mutation.
        if (__DEV__) {
          console.warn(`[cloud-sync] parking op #${op.id} (${op.op_type}) as failed after ${MAX_ATTEMPTS} attempts: ${msg}`);
        }
        await db.runAsync(`UPDATE pending_ops SET status = 'failed' WHERE id = ?`, [op.id]);
        continue;
      }
      // Backoff — leave the queue here and let the next flush retry.
      return;
    }
  }
}

/** Number of dead-lettered ops (mutations that exhausted their retries). */
export async function getFailedOpsCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM pending_ops WHERE status = 'failed'`,
  );
  return row?.n ?? 0;
}

/** Re-queue all dead-lettered ops with a fresh retry budget and kick a flush. */
export async function retryFailedOps(): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE pending_ops
        SET status = 'pending', attempt_count = 0, last_attempt_at = NULL
      WHERE status = 'failed'`,
  );
  await flushPendingOps();
}

/** Drop all dead-lettered ops. The local mirror keeps its optimistic state,
 *  which the next successful pull reconciles back to cloud truth. */
export async function discardFailedOps(): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM pending_ops WHERE status = 'failed'`);
}

async function applyOpToCloud(opType: string, payload: Record<string, unknown>): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  switch (opType) {
    case 'create_collection': {
      const p = payload as { id: string; kind: CollectionKind; name: string; tone_start?: string | null; tone_end?: string | null };
      const { error } = await supabase.from('collections').upsert({
        id:          p.id,
        user_id:     user.id,
        kind:        p.kind,
        name:        p.name,
        tone_start:  p.tone_start ?? null,
        tone_end:    p.tone_end ?? null,
        is_public:   false,
      }, { onConflict: 'id' });
      if (error) throw new Error(error.message);
      return;
    }
    case 'delete_collection': {
      const p = payload as { id: string };
      const { error } = await supabase.from('collections').delete().eq('id', p.id);
      if (error) throw new Error(error.message);
      return;
    }
    case 'rename_collection': {
      const p = payload as { id: string; name: string };
      const { error } = await supabase.from('collections').update({ name: p.name }).eq('id', p.id);
      if (error) throw new Error(error.message);
      return;
    }
    case 'set_collection_visibility': {
      const p = payload as { id: string; is_public: boolean };
      const { error } = await supabase
        .from('collections')
        .update({ is_public: p.is_public })
        .eq('id', p.id);
      if (error) throw new Error(error.message);
      return;
    }
    case 'upsert_grading': {
      const p = payload as unknown as GradingUpsertPayload;
      const { error } = await supabase.from('card_grading_submissions').upsert({
        id:             p.id,
        user_id:        user.id,
        card_id:        p.card_id,
        card_name:      p.card_name,
        card_set:       p.card_set,
        grader:         p.grader,
        submission_id:  p.submission_id,
        stage:          p.stage,
        submitted_at:   p.submitted_at,
        returned_at:    p.returned_at,
        returned_grade: p.returned_grade,
        declared_value: p.declared_value,
        notes:          p.notes,
      }, { onConflict: 'id' });
      if (error) throw new Error(error.message);
      return;
    }
    case 'delete_grading': {
      const p = payload as { id: string };
      const { error } = await supabase
        .from('card_grading_submissions')
        .delete()
        .eq('id', p.id);
      if (error) throw new Error(error.message);
      return;
    }
    case 'set_collection_rules': {
      const p = payload as { id: string; rules: SmartBinderRules | null };
      const { error } = await supabase
        .from('collections')
        .update({ rules: p.rules })
        .eq('id', p.id);
      if (error) throw new Error(error.message);
      return;
    }
    case 'add_item': {
      const p = payload as { id: string; collection_id: string; card_id: string; position?: number; variant_id?: string | null; condition?: string | null; grader?: string | null; grade?: string | null; cert_number?: string | null };
      const { error } = await supabase.from('collection_items').upsert({
        id:            p.id,
        collection_id: p.collection_id,
        card_id:       p.card_id,
        quantity:      1,
        position:      p.position ?? 0,
        variant_id:    p.variant_id ?? null,
        condition:     p.condition ?? null,
        grader:        p.grader ?? null,
        grade:         p.grade ?? null,
        cert_number:   p.cert_number ?? null,
      }, { onConflict: 'id' });
      if (error) throw new Error(error.message);
      return;
    }
    case 'remove_item': {
      const p = payload as { id: string };
      const { error } = await supabase.from('collection_items').delete().eq('id', p.id);
      if (error) throw new Error(error.message);
      return;
    }
    case 'remove_item_by_card': {
      const p = payload as { collection_id: string; card_id: string };
      const { error } = await supabase
        .from('collection_items')
        .delete()
        .eq('collection_id', p.collection_id)
        .eq('card_id', p.card_id);
      if (error) throw new Error(error.message);
      return;
    }
    case 'set_cost_basis': {
      const p = payload as { collection_id: string; card_id: string; acquired_price: number | null; acquired_at: string | null };
      const { error } = await supabase
        .from('collection_items')
        .update({
          acquired_price: p.acquired_price,
          acquired_at:    p.acquired_at,
        })
        .eq('collection_id', p.collection_id)
        .eq('card_id', p.card_id);
      if (error) throw new Error(error.message);
      return;
    }
    case 'set_cost_basis_by_id': {
      const p = payload as { id: string; acquired_price: number | null; acquired_at: string | null };
      const { error } = await supabase
        .from('collection_items')
        .update({ acquired_price: p.acquired_price, acquired_at: p.acquired_at })
        .eq('id', p.id);
      if (error) throw new Error(error.message);
      return;
    }
    case 'record_sale': {
      const p = payload as { id: string; collection_id: string | null; card_id: string; card_name: string; card_set: string | null; cost_basis: number | null; sale_price: number; sold_at: string };
      const { error } = await supabase.from('card_sales').upsert({
        id:            p.id,
        user_id:       user.id,
        collection_id: p.collection_id,
        card_id:       p.card_id,
        card_name:     p.card_name,
        card_set:      p.card_set,
        cost_basis:    p.cost_basis,
        sale_price:    p.sale_price,
        sold_at:       p.sold_at,
      }, { onConflict: 'id' });
      if (error) throw new Error(error.message);
      return;
    }
    case 'set_collection_cover': {
      const p = payload as { id: string; cover_card_ids: string[] | null };
      const { error } = await supabase
        .from('collections')
        .update({ cover_card_ids: p.cover_card_ids })
        .eq('id', p.id);
      if (error) throw new Error(error.message);
      return;
    }
    case 'reorder_item': {
      const p = payload as { id: string; position: number };
      const { error } = await supabase
        .from('collection_items')
        .update({ position: p.position })
        .eq('id', p.id);
      if (error) throw new Error(error.message);
      return;
    }
    case 'add_binder_media': {
      const p = payload as { id: string; binder_id: string; page_num: number; kind: BinderMediaKind; cell_mask: number; storage_key: string; transform: unknown | null };
      const { error } = await supabase.from('binder_media').upsert({
        id:          p.id,
        binder_id:   p.binder_id,
        user_id:     user.id,
        page_num:    p.page_num,
        kind:        p.kind,
        cell_mask:   p.cell_mask,
        storage_key: p.storage_key,
        transform:   p.transform ?? null,
      }, { onConflict: 'id' });
      if (error) throw new Error(error.message);
      return;
    }
    case 'update_binder_media': {
      const p = payload as { id: string; page_num?: number; cell_mask?: number; transform?: unknown | null };
      const patch: Record<string, unknown> = {};
      if (p.page_num !== undefined)  patch.page_num = p.page_num;
      if (p.cell_mask !== undefined) patch.cell_mask = p.cell_mask;
      if (p.transform !== undefined) patch.transform = p.transform;
      const { error } = await supabase.from('binder_media').update(patch).eq('id', p.id);
      if (error) throw new Error(error.message);
      return;
    }
    case 'remove_binder_media': {
      const p = payload as { id: string };
      const { error } = await supabase.from('binder_media').delete().eq('id', p.id);
      if (error) throw new Error(error.message);
      return;
    }
    default:
      throw new Error(`unknown op_type: ${opType}`);
  }
}

// ─── Default collections ─────────────────────────────────────────────────────

/**
 * Ensure the user has a default 'collection' and 'wishlist' row. Idempotent —
 * called after the first pull on a new account.
 */
export async function ensureDefaultCollections(userId: string): Promise<void> {
  await getOrCreateDefaultCollection(userId, 'collection', 'Main');
  await getOrCreateDefaultCollection(userId, 'wishlist',   'Wishlist');
}

/**
 * Look up the user's default collection of the given kind, creating it if
 * missing. The "default" is the oldest row of that kind owned by the user.
 * Used by the collection / wishlist hooks before every mutation so they're
 * resilient to ensureDefaultCollections not having run yet.
 */
export async function getOrCreateDefaultCollection(
  userId: string,
  kind: 'collection' | 'wishlist',
  defaultName: string,
): Promise<string> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM cloud_collections
      WHERE user_id = ? AND kind = ?
      ORDER BY created_at ASC LIMIT 1`,
    [userId, kind],
  );
  if (row) return row.id;
  const created = await createCollection({ userId, kind, name: defaultName });
  return created.id;
}
