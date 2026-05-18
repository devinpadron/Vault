// SQLite-backed cache for Supabase-sourced card metadata and pricing.
//
// Purpose: hydrate first-paint instantly on cold launches and repeat views
// without waiting for a round trip to Supabase. Always treat the network as
// authoritative — cache reads are best-effort and the calling hooks should
// fire the real query in parallel and reconcile when fresh data arrives.

import { getDb } from './database';
import { Card } from '@/types';
import type { CardPricing } from '@/lib/api/pricing';

// ─── Cards ────────────────────────────────────────────────────────────────────

const CARD_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 1 week — card metadata changes weekly

export async function getCachedCard(cardId: string): Promise<Card | null> {
  if (!cardId) return null;
  const db = await getDb();
  const row = await db.getFirstAsync<{ card_json: string; fetched_at: number }>(
    'SELECT card_json, fetched_at FROM cache_cards WHERE card_id = ?',
    [cardId],
  );
  if (!row) return null;
  if (Date.now() - row.fetched_at > CARD_TTL_MS) return null;
  try {
    return JSON.parse(row.card_json) as Card;
  } catch {
    return null;
  }
}

export async function setCachedCard(cardId: string, card: Card): Promise<void> {
  if (!cardId || !card) return;
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO cache_cards (card_id, card_json, fetched_at) VALUES (?, ?, ?)',
    [cardId, JSON.stringify(card), Date.now()],
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

const PRICING_TTL_MS = 1000 * 60 * 60 * 12; // 12h — within the daily sync cadence

export function pricingCacheKey(
  cardId: string,
  variantId: string | undefined,
  type: 'raw' | 'graded',
  grader: string | undefined,
  grade: string | undefined,
): string {
  return [cardId, variantId ?? '_', type, grader ?? '_', grade ?? '_'].join('|');
}

export async function getCachedPricing(key: string): Promise<CardPricing | null> {
  if (!key) return null;
  const db = await getDb();
  const row = await db.getFirstAsync<{ pricing_json: string; fetched_at: number }>(
    'SELECT pricing_json, fetched_at FROM cache_pricing WHERE cache_key = ?',
    [key],
  );
  if (!row) return null;
  if (Date.now() - row.fetched_at > PRICING_TTL_MS) return null;
  try {
    return JSON.parse(row.pricing_json) as CardPricing;
  } catch {
    return null;
  }
}

export async function setCachedPricing(key: string, pricing: CardPricing): Promise<void> {
  if (!key || !pricing) return;
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO cache_pricing (cache_key, pricing_json, fetched_at) VALUES (?, ?, ?)',
    [key, JSON.stringify(pricing), Date.now()],
  );
}
