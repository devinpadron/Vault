// Thin client wrapper around the `sync` edge function. The edge function is
// the cache barrier — it owns the "is this data stale?" decision and the
// Scrydex API key. The client never decides freshness on its own.

import { supabase } from '@/lib/supabase';
import { getDb } from '@/lib/db/database';

interface OnViewResponse {
  status: 'ok' | 'error';
  phase: 'card-on-view';
  cardId: string;
  refreshedPrices: boolean;
  appendedHistoryDays: number;
  refreshedListings: boolean;
  listingCount: number;
}

interface PrewarmResponse {
  status: 'ok' | 'error';
  phase: 'prewarm';
  requested: number;
  refreshed: number;
  appended: number;
  skipped: number;
  errors: number;
}

async function invokeSync<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('sync', { body });
  if (error) throw error;
  if (!data) throw new Error('Empty response from sync function');
  return data;
}

/**
 * Refresh one card's prices + price history if it's past the TTL. Returns
 * a "no-op" response (refreshedPrices=false, appendedHistoryDays=0) when
 * the data is already fresh — safe and cheap to call on every card view.
 */
export function refreshCardOnView(cardId: string, force = false): Promise<OnViewResponse> {
  return invokeSync<OnViewResponse>({ phase: 'card-on-view', cardId, force });
}

/**
 * Pre-warm many cards at once. Used at app launch with the user's
 * collection + wishlist so opens are instant. Bounded server-side
 * concurrency so it doesn't burn the Scrydex rate limit.
 */
export function prewarmCardPricing(cardIds: string[]): Promise<PrewarmResponse> {
  return invokeSync<PrewarmResponse>({ phase: 'prewarm', cardIds });
}

/**
 * Read the current user's collection + wishlist card ids out of the local
 * SQLite store and fire prewarmCardPricing in one batch. Fire-and-forget —
 * errors are logged but not surfaced. Returns the prewarm result for tests.
 */
export async function prewarmFromLocalCollection(): Promise<PrewarmResponse | null> {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<{ card_id: string }>(
      `SELECT DISTINCT i.card_id
         FROM cloud_collection_items i
         JOIN cloud_collections c ON c.id = i.collection_id
        WHERE c.kind IN ('collection', 'wishlist', 'binder')`,
    );
    const cardIds = rows.map(r => r.card_id);
    if (cardIds.length === 0) return null;
    return await prewarmCardPricing(cardIds);
  } catch (err) {
    if (__DEV__) console.warn('[prewarm] failed:', err);
    return null;
  }
}
