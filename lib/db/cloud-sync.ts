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

import { supabase } from '@/lib/supabase';
import { TONE_PAIRS } from '@/lib/binder-tones';
import { dropLegacyUserTables, getDb } from './database';
import { Card } from '@/types';

// ─── Types & helpers ─────────────────────────────────────────────────────────

export type CollectionKind = 'collection' | 'wishlist' | 'binder' | 'for_trade';

export interface MirrorCollection {
  id: string;
  user_id: string;
  kind: CollectionKind;
  name: string;
  description: string | null;
  tone_start: string | null;
  tone_end: string | null;
  is_public: boolean;
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

// ─── Pull from cloud ─────────────────────────────────────────────────────────

/**
 * Replace the local mirror with the user's authoritative cloud state.
 * Runs on sign-in and on demand (e.g. pull-to-refresh). Pending ops are NOT
 * touched — they're applied on top of whatever the pull writes.
 */
export async function pullCollectionsFromCloud(userId: string): Promise<void> {
  // 1. Fetch collections + items in two queries.
  const { data: collections, error: cErr } = await supabase
    .from('collections')
    .select('id, user_id, kind, name, description, tone_start, tone_end, is_public, created_at, updated_at')
    .eq('user_id', userId);
  if (cErr) throw new Error(`pull collections: ${cErr.message}`);

  const collectionIds = (collections ?? []).map(c => (c as { id: string }).id);

  type ItemRow = {
    id: string;
    collection_id: string;
    card_id: string;
    quantity: number;
    position: number;
    created_at: string;
    cards: { id: string; name: string; rarity: string | null } | null;
  };

  let items: ItemRow[] = [];
  if (collectionIds.length > 0) {
    const { data, error: iErr } = await supabase
      .from('collection_items')
      .select('id, collection_id, card_id, quantity, position, created_at')
      .in('collection_id', collectionIds);
    if (iErr) throw new Error(`pull items: ${iErr.message}`);
    items = (data ?? []) as ItemRow[];
  }

  // 2. Hydrate card_json for items by joining to the cache_cards mirror.
  // For ids not yet in the cache, fetch a minimal card row and synthesize
  // a placeholder. This keeps offline reads working before cache_cards is
  // populated by the search/list flows.
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
        // bad cache entry — fall through to placeholder
      }
    }
  }

  // 3. Atomic swap: clear + repopulate the mirror in a single transaction.
  await db.withTransactionAsync(async () => {
    await db.execAsync(`DELETE FROM cloud_collections; DELETE FROM cloud_collection_items;`);

    for (const raw of collections ?? []) {
      const c = raw as {
        id: string;
        user_id: string;
        kind: CollectionKind;
        name: string;
        description: string | null;
        tone_start: string | null;
        tone_end: string | null;
        is_public: boolean;
        created_at: string;
        updated_at: string;
      };
      await db.runAsync(
        `INSERT INTO cloud_collections
         (id, user_id, kind, name, description, tone_start, tone_end, is_public, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          c.id, c.user_id, c.kind, c.name, c.description,
          c.tone_start, c.tone_end, c.is_public ? 1 : 0,
          new Date(c.created_at).getTime(),
          new Date(c.updated_at).getTime(),
        ],
      );
    }

    for (const it of items) {
      const card: Card = cachedById.get(it.card_id) ?? placeholderCard(it.card_id);
      await db.runAsync(
        `INSERT INTO cloud_collection_items
         (id, collection_id, card_id, card_json, quantity, position, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          it.id, it.collection_id, it.card_id, JSON.stringify(card),
          it.quantity, it.position,
          new Date(it.created_at).getTime(),
        ],
      );
    }
  });

  // 4. Drop legacy tables now that cloud state is mirrored locally.
  await dropLegacyUserTables();
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
  | { op_type: 'add_item';          payload: { id: string; collection_id: string; card_id: string; quantity?: number; position?: number } }
  | { op_type: 'remove_item';       payload: { id: string } }
  | { op_type: 'remove_item_by_card'; payload: { collection_id: string; card_id: string } };

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
}

export async function createCollection(input: CreateCollectionInput): Promise<MirrorCollection> {
  const id = uuidv4();
  const now = Date.now();
  const tone = input.kind === 'binder'
    ? [input.toneStart ?? TONE_PAIRS[0][0], input.toneEnd ?? TONE_PAIRS[0][1]]
    : [input.toneStart ?? null, input.toneEnd ?? null];

  const row: MirrorCollection = {
    id,
    user_id: input.userId,
    kind: input.kind,
    name: input.name,
    description: null,
    tone_start: tone[0],
    tone_end: tone[1],
    is_public: false,
    created_at: now,
    updated_at: now,
  };

  const db = await getDb();
  await db.runAsync(
    `INSERT INTO cloud_collections
     (id, user_id, kind, name, description, tone_start, tone_end, is_public, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.user_id, row.kind, row.name, null, row.tone_start, row.tone_end, 0, now, now],
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
  return row;
}

export async function deleteCollection(id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM cloud_collection_items WHERE collection_id = ?`, [id]);
    await db.runAsync(`DELETE FROM cloud_collections WHERE id = ?`, [id]);
  });
  await enqueue({ op_type: 'delete_collection', payload: { id } });
}

/**
 * Add a card to a collection. Idempotent at the (collection_id, card_id)
 * level — if the card is already there nothing happens. Returns the
 * resulting mirror row (existing or new).
 */
export async function addItemToCollection(
  collectionId: string,
  card: Card,
  position = 0,
): Promise<MirrorItem | null> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM cloud_collection_items WHERE collection_id = ? AND card_id = ?`,
    [collectionId, card.id],
  );
  if (existing) return null; // no-op

  const id = uuidv4();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO cloud_collection_items
     (id, collection_id, card_id, card_json, quantity, position, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, collectionId, card.id, JSON.stringify(card), 1, position, now],
  );

  await enqueue({
    op_type: 'add_item',
    payload: { id, collection_id: collectionId, card_id: card.id, position },
  });

  return {
    id,
    collection_id: collectionId,
    card_id: card.id,
    card_json: JSON.stringify(card),
    quantity: 1,
    position,
    added_at: now,
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

// ─── Flusher ─────────────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 6;
// Exponential backoff in ms: 2s, 8s, 32s, 2m, 8m, 30m
const BACKOFF_MS = [2_000, 8_000, 32_000, 120_000, 480_000, 1_800_000];

let _flushInFlight: Promise<void> | null = null;

/**
 * Drain pending_ops in FIFO order. Best-effort: errors back off, succeeded
 * ops are deleted. Reentrant-safe — concurrent callers share the same
 * in-flight promise so we never run two flushers at once.
 */
export function flushPendingOps(): Promise<void> {
  if (_flushInFlight) return _flushInFlight;
  _flushInFlight = doFlush().finally(() => { _flushInFlight = null; });
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
        // Permanently failed. Drop so we don't block the queue forever.
        if (__DEV__) {
          console.warn(`[cloud-sync] dropping op #${op.id} (${op.op_type}) after ${MAX_ATTEMPTS} attempts: ${msg}`);
        }
        await db.runAsync(`DELETE FROM pending_ops WHERE id = ?`, [op.id]);
        continue;
      }
      // Backoff — leave the queue here and let the next flush retry.
      return;
    }
  }
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
    case 'add_item': {
      const p = payload as { id: string; collection_id: string; card_id: string; position?: number };
      const { error } = await supabase.from('collection_items').upsert({
        id:            p.id,
        collection_id: p.collection_id,
        card_id:       p.card_id,
        quantity:      1,
        position:      p.position ?? 0,
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
