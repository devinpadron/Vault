// Phase: listings (Tier 2)
// Backfills card_listings from Scrydex /cards/{id}/listings for one page of
// cards. This is the only Scrydex endpoint that ships company + grade fields,
// so it's the canonical source of graded pricing data in our system.
//
// Chain by incrementing `page` until nextPage is null.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { ScrydexClient, ScrydexListing } from '../scrydex.ts';

export interface ListingsOpts {
  page?: number;
  pageSize?: number;
  days?: number;     // days of sold history to fetch per card; default 90
}

export interface ListingsResult {
  page: number;
  cardCount: number;
  listingCount: number;
  nextPage: number | null;
}

const PAGE_SIZE = 25; // small — one Scrydex API call per card

export async function syncListings(
  supabase: SupabaseClient,
  scrydex: ScrydexClient,
  opts: ListingsOpts,
): Promise<ListingsResult> {
  const { page = 1, pageSize = PAGE_SIZE, days = 90 } = opts;
  const offset = (page - 1) * pageSize;

  // Scope to cards that actually have current prices — same heuristic as
  // history.ts. No point fetching listings for cards Scrydex has no data on.
  const { data: cardRows, count: totalCount } = await supabase
    .from('cards')
    .select('id, card_variants!inner(card_prices_current!inner(variant_id))', { count: 'exact' })
    .range(offset, offset + pageSize - 1);

  if (!cardRows || cardRows.length === 0) {
    return { page, cardCount: 0, listingCount: 0, nextPage: null };
  }

  const cardIds = (cardRows as { id: string }[]).map(c => c.id);

  // Fetch listings per card. One Scrydex call each — keep pageSize small.
  const allRows: Record<string, unknown>[] = [];

  await Promise.all(
    cardIds.map(async cardId => {
      try {
        const resp = await scrydex.getCardListings(cardId, { days, pageSize: 100 });
        for (const l of resp.data ?? []) {
          allRows.push(mapListingRow(cardId, l));
        }
      } catch {
        // Non-fatal: skip cards that 404 or rate-limit.
      }
    }),
  );

  let listingCount = 0;
  if (allRows.length > 0) {
    const { error } = await supabase
      .from('card_listings')
      .upsert(allRows, { onConflict: 'id' });
    if (!error) listingCount = allRows.length;
  }

  const total = totalCount ?? 0;
  const nextPage = offset + pageSize < total ? page + 1 : null;

  return { page, cardCount: cardIds.length, listingCount, nextPage };
}

export function mapListingRow(cardId: string, l: ScrydexListing): Record<string, unknown> {
  return {
    id:          l.id,
    card_id:     cardId,
    source:      l.source,
    title:       l.title ?? null,
    url:         l.url ?? null,
    variant:     l.variant ?? null,
    company:     l.company ?? null,
    grade:       l.grade ?? null,
    is_perfect:  l.is_perfect ?? false,
    is_signed:   l.is_signed ?? false,
    is_error:    l.is_error ?? false,
    price:       l.price,
    currency:    l.currency ?? 'USD',
    sold_at:     l.sold_at ? l.sold_at.replace(/\//g, '-') : null,
    raw_payload: l,
    synced_at:   new Date().toISOString(),
  };
}
