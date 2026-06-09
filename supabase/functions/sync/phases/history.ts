// Phase: history (Tier 3)
// Appends daily price snapshots to card_price_history for cards that have
// current prices. Operates on one page of card_variants at a time.
//
// Chain by incrementing page until nextPage is null.
// Run daily — the upsert_card_price_history RPC ignores duplicate date rows.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { ScrydexClient, ScrydexPriceHistoryEntry } from '../scrydex.ts';

export interface HistoryOpts {
  page?: number;
  pageSize?: number;
  days?: number; // how many days back to fetch; default 2 (today + yesterday)
}

export interface HistoryResult {
  page: number;
  cardCount: number;
  snapshotCount: number;
  nextPage: number | null;
}

const PAGE_SIZE = 50; // smaller — each card is one Scrydex API call

export async function syncHistory(
  supabase: SupabaseClient,
  scrydex: ScrydexClient,
  opts: HistoryOpts,
): Promise<HistoryResult> {
  const { page = 1, pageSize = PAGE_SIZE, days = 2 } = opts;
  const offset = (page - 1) * pageSize;

  // Fetch distinct card_ids from card_variants that have at least one current price.
  // This scopes history sync to cards Scrydex actually has pricing for.
  const { data: variantRows, count: totalCount } = await supabase
    .from('card_variants')
    .select('id, name, card_id, card_prices_current!inner(variant_id)', { count: 'exact' })
    .range(offset, offset + pageSize - 1);

  if (!variantRows || variantRows.length === 0) {
    return { page, cardCount: 0, snapshotCount: 0, nextPage: null };
  }

  // Deduplicate card_ids; build variant lookup for this page
  type VariantRow = { id: string; name: string; card_id: string };
  const seenCardIds = new Set<string>();
  const variantIdMap = new Map<string, string>(); // "card_id:variant_name" → uuid

  for (const row of variantRows as VariantRow[]) {
    seenCardIds.add(row.card_id);
    variantIdMap.set(`${row.card_id}:${row.name}`, row.id);
  }

  const cardIds = [...seenCardIds];

  // Fetch price history per card and build snapshot rows
  const historyRows: Record<string, unknown>[] = [];

  await Promise.all(
    cardIds.map(async cardId => {
      try {
        const resp = await scrydex.getCardPriceHistory(cardId, { days });
        const entries: ScrydexPriceHistoryEntry[] = resp.data ?? [];

        for (const entry of entries) {
          for (const p of entry.prices) {
            // Skip graded — no grader/grade available from this endpoint.
            if (p.type === 'graded') continue;
            const variantId = variantIdMap.get(`${cardId}:${p.variant}`);
            if (!variantId) continue;

            historyRows.push({
              variant_id:    variantId,
              snapshot_date: entry.date,
              type:          p.type,
              condition:     p.condition || '',
              grader:        '',
              grade:         '',
              is_perfect:    p.is_perfect,
              is_signed:     p.is_signed,
              is_error:      p.is_error,
              low:           p.low ?? null,
              market:        p.market ?? null,
              currency:      p.currency ?? 'USD',
            });
          }
        }
      } catch {
        // Non-fatal: skip cards that fail (404, rate limit, etc.)
      }
    }),
  );

  let snapshotCount = 0;
  if (historyRows.length > 0) {
    const { data: count } = await supabase.rpc('upsert_card_price_history', {
      rows: historyRows,
    });
    snapshotCount = count ?? historyRows.length;
  }

  const total = totalCount ?? 0;
  const nextPage = offset + pageSize < total ? page + 1 : null;

  return { page, cardCount: cardIds.length, snapshotCount, nextPage };
}
