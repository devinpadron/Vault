import { useEffect } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getDb } from '@/lib/db/database';
import {
  getCachedCard, setCachedCard,
  getCachedPricing, setCachedPricing, pricingCacheKey,
} from '@/lib/db/cache';
import { Card as AppCard } from '@/types';
import { SupabaseCardFull, CARD_SELECT, mapRow, FEATURED_RARITIES } from './types';
import { getCardPricing, CardPricing, PricingQuery } from './pricing';
import { refreshCardOnView } from './sync-client';

const TABLE = 'cards';

const PAGE_SIZE = 24;
const PRICE_SORT_LIMIT = 200;

export function useFeaturedCard() {
  return useQuery<AppCard | null>({
    queryKey: ['featured-card'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABLE)
        .select(CARD_SELECT)
        .in('rarity', FEATURED_RARITIES)
        .limit(100);

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) return null;

      const pick = Math.floor(Math.random() * data.length);
      return mapRow(data[pick] as unknown as SupabaseCardFull, pick);
    },
    staleTime: 1000 * 60 * 10,
  });
}

export function useCard(id: string) {
  // SQLite cache → instant hydration on repeat views and cold starts.
  const cached = useQuery<AppCard | null>({
    queryKey: ['card-cache', id],
    queryFn: () => getCachedCard(id),
    staleTime: Infinity,
    enabled: !!id,
  });

  const network = useQuery<AppCard | null>({
    queryKey: ['card', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABLE)
        .select(CARD_SELECT)
        .eq('id', id)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) return null;
      const card = mapRow(data as unknown as SupabaseCardFull);
      await setCachedCard(id, card);
      return card;
    },
    staleTime: 1000 * 60 * 60,
    enabled: !!id,
  });

  // Prefer network when it has arrived; fall back to cache otherwise.
  return {
    ...network,
    data: network.data ?? cached.data ?? null,
    isLoading: network.isLoading && !cached.data,
  };
}

const FILTER_COLUMN: Record<string, string> = {
  'Name':     'name',
  'Pokémon':  'name',
  'Set/Pack': 'expansions.name',
  'Artist':   'artist',
  'Rarity':   'rarity',
};

export type SortField = 'relevance' | 'price' | 'release' | 'number';
export type SortDir   = 'asc' | 'desc';

export function useSearchCards(
  query: string,
  filter = 'Name',
  sort: { field: SortField; dir: SortDir } = { field: 'relevance', dir: 'desc' },
) {
  const col = FILTER_COLUMN[filter] ?? 'name';

  return useInfiniteQuery<AppCard[]>({
    queryKey: ['search', query, filter, sort.field, sort.dir],
    queryFn: async ({ pageParam }) => {
      const page = pageParam as number;

      let q = supabase
        .from(TABLE)
        .select(CARD_SELECT)
        .ilike(col, `%${query}%`);

      if (sort.field === 'price') {
        q = (q.order('rarity', { ascending: false }) as typeof q).limit(PRICE_SORT_LIMIT);
      } else if (sort.field === 'release') {
        q = (q
          .order('release_date', { referencedTable: 'expansions', ascending: sort.dir === 'asc' }) as typeof q)
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      } else if (sort.field === 'number') {
        q = (q
          .order('printed_number', { ascending: sort.dir === 'asc' }) as typeof q)
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      } else {
        q = (q.order('rarity', { ascending: false }) as typeof q)
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      }

      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const offset = sort.field === 'price' ? 0 : page * PAGE_SIZE;
      return (data as unknown as SupabaseCardFull[]).map((row, i) => mapRow(row, offset + i));
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (sort.field === 'price') return undefined;
      return lastPage.length === PAGE_SIZE ? allPages.length : undefined;
    },
    enabled: query.trim().length >= 2,
    staleTime: 1000 * 60 * 10,
  });
}

// Aggregated daily total of the user's collection over time, expressed as a
// flat number[] in chronological order. Each day's value is the sum of the
// chosen variant's NM raw market price across every card in the collection,
// forward-filling missing days using each variant's last known price.
export type PortfolioRange = '7D' | '30D' | '90D' | '1Y' | 'ALL';

const RANGE_CUTOFF_DAYS: Record<PortfolioRange, number | null> = {
  '7D':  7,
  '30D': 30,
  '90D': 90,
  '1Y':  365,
  'ALL': null,
};

export function usePortfolioHistory(range: PortfolioRange = '30D') {
  return useQuery<number[]>({
    queryKey: ['portfolio-history', range],
    queryFn: async () => {
      // 1. Local collection
      const db = await getDb();
      const rows = await db.getAllAsync<{ card_id: string }>(
        'SELECT DISTINCT card_id FROM collection_cards',
      );
      const cardIds = rows.map(r => r.card_id);
      if (cardIds.length === 0) return [];

      // 2. Resolve variant_ids that have NM raw current prices, one per card.
      const { data: variantRows } = await supabase
        .from('card_variants')
        .select('id, card_id')
        .in('card_id', cardIds);
      if (!variantRows || variantRows.length === 0) return [];

      const variants = variantRows as { id: string; card_id: string }[];
      const variantIds = variants.map(v => v.id);

      const { data: priced } = await supabase
        .from('card_prices_current')
        .select('variant_id')
        .in('variant_id', variantIds)
        .eq('type', 'raw')
        .eq('condition', 'NM');

      const pricedIds = new Set((priced as { variant_id: string }[] | null ?? []).map(p => p.variant_id));
      const cardToVariant = new Map<string, string>();
      for (const v of variants) {
        if (pricedIds.has(v.id) && !cardToVariant.has(v.card_id)) {
          cardToVariant.set(v.card_id, v.id);
        }
      }
      const chosenVariantIds = Array.from(cardToVariant.values());
      if (chosenVariantIds.length === 0) return [];

      // 3. Fetch history rows for chosen variants over the range.
      const days = RANGE_CUTOFF_DAYS[range];
      const cutoffDate =
        days != null
          ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
          : null;

      let historyQuery = supabase
        .from('card_price_history')
        .select('snapshot_date, market, variant_id')
        .in('variant_id', chosenVariantIds)
        .eq('type', 'raw')
        .eq('condition', 'NM')
        .order('snapshot_date', { ascending: true });
      if (cutoffDate) historyQuery = historyQuery.gte('snapshot_date', cutoffDate);

      const { data: history } = await historyQuery;
      const rowsTyped = (history as { snapshot_date: string; market: number | null; variant_id: string }[] | null) ?? [];
      if (rowsTyped.length === 0) return [];

      // 4. Build per-variant series and forward-fill across all dates.
      const variantSeries = new Map<string, { date: string; market: number }[]>();
      for (const h of rowsTyped) {
        if (h.market == null) continue;
        const arr = variantSeries.get(h.variant_id) ?? [];
        arr.push({ date: h.snapshot_date, market: h.market });
        variantSeries.set(h.variant_id, arr);
      }

      const allDates = Array.from(new Set(rowsTyped.map(h => h.snapshot_date))).sort();

      const lastKnown = new Map<string, number>();
      const ptrs = new Map<string, number>();
      const totals: number[] = [];

      for (const date of allDates) {
        for (const [vid, series] of variantSeries.entries()) {
          let ptr = ptrs.get(vid) ?? 0;
          while (ptr < series.length && series[ptr].date <= date) {
            lastKnown.set(vid, series[ptr].market);
            ptr++;
          }
          ptrs.set(vid, ptr);
        }
        let dayTotal = 0;
        for (const v of lastKnown.values()) dayTotal += v;
        if (dayTotal > 0) totals.push(dayTotal);
      }

      return totals;
    },
    staleTime: 1000 * 60 * 30,
  });
}

export function useCardPricing(
  card: AppCard | null | undefined,
  variantId?: string,
  query: PricingQuery = {},
) {
  const type: 'raw' | 'graded' = query.type ?? 'raw';
  const cacheKey = card?.id
    ? pricingCacheKey(card.id, variantId, type, query.grader, query.grade)
    : '';
  const queryClient = useQueryClient();

  const cached = useQuery<CardPricing | null>({
    queryKey: ['pricing-cache', cacheKey],
    queryFn: () => getCachedPricing(cacheKey),
    staleTime: Infinity,
    enabled: !!cacheKey,
  });

  const networkKey = [
    'card-pricing',
    card?.id,
    variantId ?? null,
    type,
    query.grader ?? '',
    query.grade ?? '',
  ];

  const network = useQuery<CardPricing | null>({
    queryKey: networkKey,
    queryFn: async () => {
      if (!card) return null;
      const pricing = await getCardPricing(card.id, variantId, query);
      await setCachedPricing(cacheKey, pricing);
      return pricing;
    },
    staleTime: 1000 * 60 * 60 * 12,
    enabled: !!card?.id,
  });

  // SWR refresh: while the network query is serving (possibly stale) DB
  // rows to the UI, kick the edge function to refresh prices + append any
  // missing history days. When it reports work was done, invalidate so the
  // DB-backed query re-runs and the UI updates with the fresh numbers.
  // Skipped for graded queries (their data lives in card_listings, not in
  // the on-view refresh path).
  useEffect(() => {
    if (!card?.id || type !== 'raw') return;
    let cancelled = false;
    refreshCardOnView(card.id)
      .then(r => {
        if (cancelled) return;
        if (r.refreshedPrices || r.appendedHistoryDays > 0) {
          queryClient.invalidateQueries({ queryKey: networkKey });
        }
      })
      .catch(err => {
        if (__DEV__) console.warn('[pricing] on-view refresh failed:', err);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, type]);

  return {
    ...network,
    data: network.data ?? cached.data ?? null,
    isLoading: network.isLoading && !cached.data,
  };
}
