// Cloud-sync helpers. When the user is authenticated, every local write is
// mirrored to Supabase so it survives reinstall and follows the user across
// devices. SQLite remains the offline-first read source; Supabase is the
// canonical store.
//
// The hooks in collection.ts / wishlist.ts call these in a fire-and-forget
// pattern after the local write — a failed cloud write logs and continues,
// because the next reconciliation pass will retry.

import { supabase } from '@/lib/supabase';
import { getDb } from './database';
import { CARD_SELECT, SupabaseCardFull, mapRow } from '@/lib/api/types';
import { Card } from '@/types';

type CollectionKind = 'collection' | 'wishlist';

// One row per (user_id, kind) — created lazily on first write.
async function ensureDefaultCollection(
  userId: string,
  kind: CollectionKind,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('collections')
    .select('id')
    .eq('user_id', userId)
    .eq('kind', kind)
    .limit(1)
    .maybeSingle();

  if (existing) return (existing as { id: string }).id;

  const { data: created, error } = await supabase
    .from('collections')
    .insert({
      user_id:   userId,
      kind,
      name:      kind === 'collection' ? 'Main' : 'Wishlist',
      is_public: false,
    })
    .select('id')
    .single();

  if (error) {
    console.warn(`[cloud] failed to create default ${kind}:`, error.message);
    return null;
  }
  return (created as { id: string }).id;
}

// ─── Write-through ────────────────────────────────────────────────────────────

export async function cloudAddItem(
  userId: string,
  kind: CollectionKind,
  cardId: string,
): Promise<void> {
  try {
    const collectionId = await ensureDefaultCollection(userId, kind);
    if (!collectionId) return;
    const { error } = await supabase
      .from('collection_items')
      .upsert(
        { collection_id: collectionId, card_id: cardId, quantity: 1 },
        { onConflict: 'collection_id,card_id' },
      );
    if (error) console.warn(`[cloud] add to ${kind} failed:`, error.message);
  } catch (e) {
    console.warn(`[cloud] add to ${kind} threw:`, e);
  }
}

export async function cloudRemoveItem(
  userId: string,
  kind: CollectionKind,
  cardId: string,
): Promise<void> {
  try {
    const collectionId = await ensureDefaultCollection(userId, kind);
    if (!collectionId) return;
    const { error } = await supabase
      .from('collection_items')
      .delete()
      .eq('collection_id', collectionId)
      .eq('card_id', cardId);
    if (error) console.warn(`[cloud] remove from ${kind} failed:`, error.message);
  } catch (e) {
    console.warn(`[cloud] remove from ${kind} threw:`, e);
  }
}

// ─── Sign-in reconciliation ───────────────────────────────────────────────────
//
// Runs once per authenticated session. Pushes any local-only rows up to
// Supabase, then pulls anything in Supabase that isn't local yet. Idempotent:
// the unique index on (collection_id, card_id) prevents duplicate pushes,
// and the local SQLite INSERT OR IGNORE keeps the pull idempotent too.

const LOCAL_TABLE_BY_KIND: Record<CollectionKind, string> = {
  collection: 'collection_cards',
  wishlist:   'wishlist_cards',
};

async function pushLocalToCloud(userId: string, kind: CollectionKind): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ card_id: string }>(
    `SELECT card_id FROM ${LOCAL_TABLE_BY_KIND[kind]}`,
  );
  if (rows.length === 0) return;

  const collectionId = await ensureDefaultCollection(userId, kind);
  if (!collectionId) return;

  const payload = rows.map(r => ({
    collection_id: collectionId,
    card_id:       r.card_id,
    quantity:      1,
  }));

  const { error } = await supabase
    .from('collection_items')
    .upsert(payload, { onConflict: 'collection_id,card_id' });

  if (error) console.warn(`[cloud] push ${kind} failed:`, error.message);
}

async function pullCloudToLocal(userId: string, kind: CollectionKind): Promise<void> {
  const collectionId = await ensureDefaultCollection(userId, kind);
  if (!collectionId) return;

  const { data: items, error: itemsErr } = await supabase
    .from('collection_items')
    .select('card_id')
    .eq('collection_id', collectionId);

  if (itemsErr || !items || items.length === 0) return;

  const cardIds = (items as { card_id: string }[]).map(i => i.card_id);

  // Filter to ids not already in local SQLite to avoid the heavier card fetch.
  const db = await getDb();
  const localRows = await db.getAllAsync<{ card_id: string }>(
    `SELECT card_id FROM ${LOCAL_TABLE_BY_KIND[kind]} WHERE card_id IN (${cardIds.map(() => '?').join(',')})`,
    cardIds,
  );
  const localSet = new Set(localRows.map(r => r.card_id));
  const missing = cardIds.filter(id => !localSet.has(id));
  if (missing.length === 0) return;

  // Hydrate full card rows for the missing ids — these are what the local
  // table stores as JSON.
  const { data: cardRows } = await supabase
    .from('cards')
    .select(CARD_SELECT)
    .in('id', missing);

  if (!cardRows || cardRows.length === 0) return;

  const cards: Card[] = (cardRows as unknown as SupabaseCardFull[]).map(r => mapRow(r));
  const now = Date.now();

  for (const card of cards) {
    const id = `${now}-${card.id}`;
    await db.runAsync(
      `INSERT OR IGNORE INTO ${LOCAL_TABLE_BY_KIND[kind]} (id, card_id, card_json, added_at) VALUES (?, ?, ?, ?)`,
      [id, card.id, JSON.stringify(card), now],
    );
  }
}

/**
 * Run the full local ↔ cloud reconciliation for one user. Idempotent, safe to
 * call on every app launch — the network round trips are bounded by the size
 * of the collection / wishlist.
 *
 * NOTE: Binders are not synced yet — they need a UUID-keyed local schema (the
 * current schema uses base36 IDs) and a per-binder collection row. Tracked as
 * a follow-up in TODO-functional.md.
 */
export async function reconcileWithCloud(userId: string): Promise<void> {
  await Promise.all([
    pushLocalToCloud(userId, 'collection'),
    pushLocalToCloud(userId, 'wishlist'),
  ]);
  await Promise.all([
    pullCloudToLocal(userId, 'collection'),
    pullCloudToLocal(userId, 'wishlist'),
  ]);
}
