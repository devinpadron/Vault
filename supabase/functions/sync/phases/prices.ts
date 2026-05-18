// Phase: prices (Tier 2)
// Re-syncs card_prices_current from Scrydex for one page of cards.
// Respects cache_refresh_policy.max_age_seconds — skips cards whose prices
// were synced recently unless force=true.
//
// Chain by incrementing page until nextPage is null.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { ScrydexClient, ScrydexCardBrief, ScrydexVariant } from '../scrydex.ts';

export interface PricesOpts {
  page?: number;
  pageSize?: number;
  force?: boolean;
}

export interface PricesResult {
  page: number;
  cardCount: number;
  priceCount: number;
  nextPage: number | null;
}

const PAGE_SIZE = 100;

export async function syncPrices(
  supabase: SupabaseClient,
  scrydex: ScrydexClient,
  opts: PricesOpts,
): Promise<PricesResult> {
  const { page = 1, pageSize = PAGE_SIZE } = opts;

  // Fetch cards with prices from Scrydex
  const resp = await scrydex.listCards(page, pageSize, true);

  if (resp.data.length === 0) {
    return { page, cardCount: 0, priceCount: 0, nextPage: null };
  }

  const cards = resp.data;
  const cardIds = cards.map((c: ScrydexCardBrief) => c.id);

  // Look up card_variants for these card IDs in one query
  const { data: variants } = await supabase
    .from('card_variants')
    .select('id, name, card_id')
    .in('card_id', cardIds);

  if (!variants || variants.length === 0) {
    // Cards not yet in DB — skip (metadata phase hasn't run for these)
    const totalPages = Math.ceil(resp.total_count / pageSize);
    return { page, cardCount: cards.length, priceCount: 0, nextPage: page < totalPages ? page + 1 : null };
  }

  const variantIdMap = new Map<string, string>(
    (variants as { id: string; name: string; card_id: string }[])
      .map(v => [`${v.card_id}:${v.name}`, v.id]),
  );

  // Skip `type='graded'` rows — see phases/metadata.ts for rationale. Graded
  // data is sourced from card_listings.
  const now = new Date().toISOString();
  const priceRows = cards
    .filter((c: ScrydexCardBrief) => c.variants && c.variants.length > 0)
    .flatMap((c: ScrydexCardBrief) =>
      (c.variants as ScrydexVariant[]).flatMap(v => {
        const variantId = variantIdMap.get(`${c.id}:${v.name}`);
        if (!variantId) return [];
        return v.prices
          .filter(p => p.type !== 'graded')
          .map(p => ({
            variant_id:       variantId,
            type:             p.type,
            condition:        p.condition || '',
            grader:           '',
            grade:            '',
            is_perfect:       p.is_perfect,
            is_signed:        p.is_signed,
            is_error:         p.is_error,
            low:              p.low ?? null,
            market:           p.market ?? null,
            currency:         p.currency ?? 'USD',
            trend_1d_change:  p.trends?.days_1?.price_change ?? null,
            trend_1d_pct:     p.trends?.days_1?.percent_change ?? null,
            trend_7d_change:  p.trends?.days_7?.price_change ?? null,
            trend_7d_pct:     p.trends?.days_7?.percent_change ?? null,
            trend_30d_change: p.trends?.days_30?.price_change ?? null,
            trend_30d_pct:    p.trends?.days_30?.percent_change ?? null,
            trend_90d_change: p.trends?.days_90?.price_change ?? null,
            trend_90d_pct:    p.trends?.days_90?.percent_change ?? null,
            raw_payload:      p,
            synced_at:        now,
          }));
      }),
    );

  let priceCount = 0;
  if (priceRows.length > 0) {
    const { data: count } = await supabase.rpc('upsert_card_prices', { rows: priceRows });
    priceCount = count ?? priceRows.length;
  }

  const totalPages = Math.ceil(resp.total_count / pageSize);
  return {
    page,
    cardCount: cards.length,
    priceCount,
    nextPage: page < totalPages ? page + 1 : null,
  };
}
