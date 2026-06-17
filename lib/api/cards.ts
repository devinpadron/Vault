import { useEffect, useMemo } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getDb } from '@/lib/db/database';
import {
  getCachedCard, setCachedCard,
  getCachedPricing, setCachedPricing, pricingCacheKey,
} from '@/lib/db/cache';
import { useAuth } from '@/lib/auth/AuthContext';
import { Card as AppCard } from '@/types';
import { SupabaseCardFull, CARD_SELECT, mapRow, FEATURED_RARITIES } from './types';
import { getCardPricing, CardPricing, PricingQuery } from './pricing';
import { getCardPopReports, PopReport } from './pop-reports';
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

export type SortField = 'relevance' | 'price' | 'release' | 'number';
export type SortDir   = 'asc' | 'desc';

// All expansion names, lowercased — used by the smart parser to recognize a
// set name embedded in a free-text query. Rarely changes, so cache hard.
export function useExpansionNames() {
  return useQuery<string[]>({
    queryKey: ['expansion-names'],
    queryFn: async () => {
      const { data, error } = await supabase.from('expansions').select('name');
      if (error) throw new Error(error.message);
      return ((data ?? []) as { name: string }[]).map(e => e.name.toLowerCase());
    },
    staleTime: 1000 * 60 * 60 * 24,
  });
}

// All expansion names, UPPER-cased + de-duped, newest first — the full set
// catalog for the smart-binder rule editor (card.set is stored upper-cased, so
// rules match against this form). Auto-updates as new sets sync into the
// expansions table; cached hard since it rarely changes.
export function useAllSetNames() {
  return useQuery<string[]>({
    queryKey: ['all-set-names'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expansions')
        .select('name, release_date')
        .order('release_date', { ascending: false });
      if (error) throw new Error(error.message);
      const seen = new Set<string>();
      const out: string[] = [];
      for (const e of (data ?? []) as { name: string }[]) {
        const up = (e.name || '').toUpperCase();
        if (up && !seen.has(up)) { seen.add(up); out.push(up); }
      }
      return out;
    },
    staleTime: 1000 * 60 * 60 * 24,
  });
}

interface SearchFilter { col: string; value: string }
// Each group is a set of OR alternatives (any may match); groups are AND-ed
// together. `setFilter` is held apart because it targets the joined expansions
// table, which can't share an .or() with the cards-table columns.
interface ParsedSearch {
  setFilter?: string;
  groups: SearchFilter[][];
  key: string;
}

const SMART_MIN_SET_LEN = 3;
// Fields the unified "All" search matches each word against (all on `cards`).
const ALL_COLUMNS = ['name', 'artist', 'rarity'];
// PostgREST .or() grammar reserves these — strip them from a token's value.
const sanitizeToken = (t: string) => t.replace(/[,()."*:\\]/g, '').trim();

// Peel the longest trailing run of words that matches a real expansion name
// off a token list, so "<anything> Journey Together" recognizes the set.
// Iterating k ascending tries the longest suffix first; the first suffix that
// is a substring of some expansion name wins (most specific).
function peelSet(
  tokens: string[],
  expansionNames: string[],
): { setValue?: string; rest: string[] } {
  if (tokens.length >= 2 && expansionNames.length > 0) {
    for (let k = 0; k < tokens.length; k++) {
      const set = tokens.slice(k).join(' ');
      if (set.length < SMART_MIN_SET_LEN) continue;
      const lower = set.toLowerCase();
      if (expansionNames.some(n => n.includes(lower))) {
        return { setValue: set, rest: tokens.slice(0, k) };
      }
    }
  }
  return { rest: tokens };
}

// Turn a free-text query + active pill into the filters to apply.
//   • "All"      — every word must match name OR artist OR rarity, plus any
//                  trailing set name is recognized. So "Charizard Sugimori
//                  Base Set" → name~Charizard AND artist~Sugimori AND set~Base.
//   • "Name"     — dual search: card name + trailing set name.
//   • Set/Pack / Artist / Rarity — single-column match on that field.
export function parseSearchQuery(
  rawQuery: string,
  filter: string,
  expansionNames: string[],
): ParsedSearch {
  const query = rawQuery.trim();
  const keyed = (p: Omit<ParsedSearch, 'key'>): ParsedSearch => ({
    ...p,
    key:
      (p.setFilter ? `set=${p.setFilter}` : '') +
      p.groups.map(g => '|' + g.map(f => `${f.col}~${f.value}`).join(',')).join(''),
  });

  // Explicit single-field pills.
  if (filter === 'Set/Pack') return keyed({ setFilter: query, groups: [] });
  if (filter === 'Artist')  return keyed({ groups: [[{ col: 'artist', value: query }]] });
  if (filter === 'Rarity')  return keyed({ groups: [[{ col: 'rarity', value: query }]] });

  const tokens = query.split(/\s+/).filter(Boolean);
  const { setValue, rest } = peelSet(tokens, expansionNames);

  // "Name" keeps the remaining words as one card-name phrase (dual search).
  if (filter === 'Name' || filter === 'Pokémon') {
    const groups: SearchFilter[][] = [];
    const name = rest.join(' ');
    if (name) groups.push([{ col: 'name', value: name }]);
    return keyed({ setFilter: setValue, groups });
  }

  // "All" (default): each remaining word must hit one of the ALL_COLUMNS.
  const groups: SearchFilter[][] = [];
  for (const tok of rest) {
    const value = sanitizeToken(tok);
    if (!value) continue;
    groups.push(ALL_COLUMNS.map(col => ({ col, value })));
  }
  // No usable words but a set was recognized → search the set alone.
  if (groups.length === 0 && !setValue) {
    groups.push(ALL_COLUMNS.map(col => ({ col, value: sanitizeToken(query) || query })));
  }
  return keyed({ setFilter: setValue, groups });
}

// Apply a parsed query to a Supabase builder. Single-alternative groups use a
// plain .ilike (keeps spaces/punctuation intact); multi-alternative groups use
// .or() across the cards-table columns.
function applyParsed<
  Q extends { ilike(c: string, p: string): Q; or(f: string): Q },
>(q: Q, parsed: ParsedSearch): Q {
  if (parsed.setFilter) q = q.ilike('expansions.name', `%${parsed.setFilter}%`);
  for (const group of parsed.groups) {
    if (group.length === 1) {
      q = q.ilike(group[0].col, `%${group[0].value}%`);
    } else {
      q = q.or(group.map(f => `${f.col}.ilike.*${f.value}*`).join(','));
    }
  }
  return q;
}

// Exact total of cards matching a query — a cheap HEAD count so the results
// header can show the true number found instead of only the rows loaded so far.
export function useSearchCount(
  query: string,
  filter = 'All',
  expansionNames: string[] = [],
) {
  const parsed = useMemo(
    () => parseSearchQuery(query, filter, expansionNames),
    [query, filter, expansionNames],
  );

  return useQuery<number>({
    queryKey: ['search-count', parsed.key],
    queryFn: async () => {
      const q = applyParsed(
        supabase
          .from(TABLE)
          .select('id, expansions!expansion_id!inner(name)', { count: 'exact', head: true }),
        parsed,
      );

      const { count, error } = await q;
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    enabled: query.trim().length >= 2,
    staleTime: 1000 * 60 * 10,
  });
}

export function useSearchCards(
  query: string,
  filter = 'All',
  sort: { field: SortField; dir: SortDir } = { field: 'relevance', dir: 'desc' },
  expansionNames: string[] = [],
) {
  const parsed = useMemo(
    () => parseSearchQuery(query, filter, expansionNames),
    [query, filter, expansionNames],
  );

  return useInfiniteQuery<AppCard[]>({
    queryKey: ['search', parsed.key, sort.field, sort.dir],
    queryFn: async ({ pageParam }) => {
      const page = pageParam as number;

      let q = applyParsed(supabase.from(TABLE).select(CARD_SELECT), parsed);

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
  const { user } = useAuth();
  return useQuery<number[]>({
    queryKey: ['portfolio-history', user?.id, range],
    enabled: !!user?.id,
    queryFn: async () => {
      // 1. Local collection (cloud mirror, kind='collection')
      const db = await getDb();
      const rows = await db.getAllAsync<{ card_id: string }>(
        `SELECT DISTINCT i.card_id
           FROM cloud_collection_items i
           JOIN cloud_collections c ON c.id = i.collection_id
          WHERE c.user_id = ? AND c.kind = 'collection'`,
        [user!.id],
      );
      const cardIds = rows.map(r => r.card_id);
      if (cardIds.length === 0) return [];

      // 2. One RPC round trip: variant resolution, history join, and
      // forward-fill all happen server-side (migration 024).
      const days = RANGE_CUTOFF_DAYS[range];
      const cutoffDate =
        days != null
          ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
          : null;

      const { data, error } = await supabase.rpc('portfolio_history', {
        card_ids: cardIds,
        cutoff: cutoffDate,
      });
      if (error) throw new Error(`portfolio history: ${error.message}`);

      const totals = (data as { snapshot_date: string; total: number | string }[] | null) ?? [];
      return totals.map(t => Number(t.total));
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
    ? pricingCacheKey(card.id, variantId, type, query.grader, query.grade, query.condition)
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
    query.condition ?? '',
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
    // Keep the prior result on screen while a new variant/condition loads so
    // the chart, range/condition pills, and raw/graded segment don't collapse
    // and reflow mid-fetch.
    placeholderData: keepPreviousData,
  });

  // SWR refresh: while the network query is serving (possibly stale) DB
  // rows to the UI, kick the edge function to refresh prices, append any
  // missing history days, and refresh graded sold listings. When it reports
  // work was done, invalidate so the DB-backed query re-runs and the UI
  // updates with the fresh numbers. One raw on-view call covers graded too:
  // getCardPricing reads graded_options from card_listings, which the edge
  // function refreshes in the same pass — so this stays gated to raw to avoid
  // a duplicate kick from the graded query.
  useEffect(() => {
    if (!card?.id || type !== 'raw') return;
    let cancelled = false;
    refreshCardOnView(card.id)
      .then(r => {
        if (cancelled) return;
        if (r.refreshedPrices || r.appendedHistoryDays > 0 || r.listingCount > 0) {
          queryClient.invalidateQueries({ queryKey: networkKey });
        }
        // Pop reports are (re)written in the same pricesStale pass as prices.
        if (r.refreshedPrices && card.id) {
          queryClient.invalidateQueries({ queryKey: ['card-pop-reports', card.id] });
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

// Population (census) reports for a card. Populated lazily server-side by the
// on-view refresh (same pass as prices), so this query is invalidated from
// useCardPricing when that refresh reports fresh data.
export function useCardPopReports(card: AppCard | null | undefined) {
  return useQuery<PopReport[]>({
    queryKey: ['card-pop-reports', card?.id],
    queryFn: () => getCardPopReports(card!.id),
    enabled: !!card?.id,
    staleTime: 1000 * 60 * 60,
  });
}
