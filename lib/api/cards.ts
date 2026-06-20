import { useEffect, useMemo, useRef } from 'react';
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
import { refreshCardOnView, prewarmCardPricing } from './sync-client';

const TABLE = 'cards';

const PAGE_SIZE = 24;
const PRICE_SORT_LIMIT = 200;

// A set released within this window counts as "recent" and gets priority as the
// featured-card source.
const FEATURED_RECENT_DAYS = 45;
const WEEK_MS = 1000 * 60 * 60 * 24 * 7;

// Integer index of the current ISO-ish week since the unix epoch. Stable for a
// whole week, so the featured pick only changes once a week.
function currentWeekSeed(): number {
  return Math.floor(Date.now() / WEEK_MS);
}

// Deterministic index into a pool of size `len` for a given week. Multiplying by
// a large odd constant before the modulo decorrelates consecutive weeks so the
// card visibly jumps around the pool instead of marching by one.
function weeklyIndex(seed: number, len: number): number {
  const scrambled = Math.abs((seed * 2654435761) % len);
  return scrambled % len;
}

// Featured card: a Pokémon (never Trainer/Energy) drawn from the chase rarities.
// Refreshes once a week. If a set was released in the last FEATURED_RECENT_DAYS,
// the pick is drawn from that newest set; otherwise from the whole chase pool.
export function useFeaturedCard() {
  const week = currentWeekSeed();
  return useQuery<AppCard | null>({
    queryKey: ['featured-card', week],
    queryFn: async () => {
      // 1. Try the most recently released set first. Fetch lightweight id +
      //    release_date rows for chase-rarity Pokémon from sets newer than the
      //    cutoff, then narrow to the single newest set in that window.
      const cutoff = new Date(Date.now() - FEATURED_RECENT_DAYS * 86400000)
        .toISOString()
        .slice(0, 10);

      const { data: recent, error: recentErr } = await supabase
        .from(TABLE)
        .select('id, expansions!expansion_id!inner(release_date)')
        .eq('supertype', 'Pokémon')
        .in('rarity', FEATURED_RARITIES)
        .gte('expansions.release_date', cutoff);

      if (recentErr) throw new Error(recentErr.message);

      type PoolRow = { id: string; expansions: { release_date: string | null } };
      let candidateIds: string[] = [];

      const recentRows = (recent ?? []) as unknown as PoolRow[];
      if (recentRows.length > 0) {
        const newest = recentRows.reduce<string>(
          (max, r) => (r.expansions.release_date ?? '') > max ? (r.expansions.release_date ?? '') : max,
          '',
        );
        candidateIds = recentRows
          .filter(r => (r.expansions.release_date ?? '') === newest)
          .map(r => r.id);
      }

      // 2. Fall back to the full chase pool when nothing recent qualifies.
      if (candidateIds.length === 0) {
        const { data: pool, error: poolErr } = await supabase
          .from(TABLE)
          .select('id')
          .eq('supertype', 'Pokémon')
          .in('rarity', FEATURED_RARITIES)
          .limit(1000);
        if (poolErr) throw new Error(poolErr.message);
        candidateIds = ((pool ?? []) as { id: string }[]).map(r => r.id);
      }

      if (candidateIds.length === 0) return null;

      // 3. Deterministic weekly pick. Sort ids first so the pick is stable
      //    regardless of row order returned by Postgres.
      candidateIds.sort();
      const chosenId = candidateIds[weeklyIndex(week, candidateIds.length)];

      const { data, error } = await supabase
        .from(TABLE)
        .select(CARD_SELECT)
        .eq('id', chosenId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) return null;
      return mapRow(data as unknown as SupabaseCardFull);
    },
    // Deterministic per week, so cache hard; the queryKey rolls over weekly.
    staleTime: WEEK_MS,
    gcTime: WEEK_MS,
  });
}

/**
 * Imperative single-card fetch (non-hook): pulls the full card row by id, caches
 * it, and returns the app-level Card. Used where a Card is needed outside React
 * Query's hook flow — e.g. quick-adding a scanner match without leaving the
 * scanner. Returns null when the id isn't in the catalog.
 */
export async function fetchCardById(id: string): Promise<AppCard | null> {
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

// Debounce window for coalescing scroll bursts into one batched prewarm.
const PREWARM_VISIBLE_DEBOUNCE_MS = 600;

/**
 * Lazily revalidate prices for whichever cards are currently on screen. This is
 * the read-time half of the "Supabase is truth, refresh on view if stale" model
 * for list surfaces (search, collection) — the card-detail screen already does
 * it per-card via refreshCardOnView.
 *
 * Each id is requested at most once per mount, and bursts (e.g. infinite-scroll
 * loading a page) are debounced into a single batched `prewarm` call. The edge
 * function TTL-gates every id server-side, so already-fresh cards cost nothing
 * and only stale ones hit Scrydex + get stored. `onRefreshed` fires only when a
 * batch actually refreshed something, so the caller can invalidate and re-read.
 */
export function usePrewarmVisiblePricing(cardIds: string[], onRefreshed?: () => void) {
  const requested = useRef<Set<string>>(new Set());
  const pending = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cbRef = useRef(onRefreshed);
  cbRef.current = onRefreshed;

  useEffect(() => {
    let added = false;
    for (const id of cardIds) {
      if (!id || requested.current.has(id)) continue;
      requested.current.add(id);
      pending.current.add(id);
      added = true;
    }
    if (!added) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      const batch = Array.from(pending.current);
      pending.current.clear();
      if (batch.length === 0) return;
      prewarmCardPricing(batch)
        .then(res => { if (res && res.refreshed > 0) cbRef.current?.(); })
        .catch(err => { if (__DEV__) console.warn('[prewarm-visible] failed:', err); });
    }, PREWARM_VISIBLE_DEBOUNCE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [cardIds]);
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
  const queryClient = useQueryClient();
  const searchKey = ['search', parsed.key, sort.field, sort.dir];

  const result = useInfiniteQuery<AppCard[]>({
    queryKey: searchKey,
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

  // Revalidate the prices of cards shown in the results: stale ones refresh
  // server-side, then we re-run the search so the join picks up fresh values.
  const visibleIds = useMemo(
    () => (result.data?.pages.flat() ?? []).map(c => c.id),
    [result.data],
  );
  usePrewarmVisiblePricing(visibleIds, () => {
    queryClient.invalidateQueries({ queryKey: searchKey });
  });

  return result;
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
      // 1. Local collection (cloud mirror, kind='collection'). Sum quantity per
      // card so the chart weights each holding by how many copies are held.
      const db = await getDb();
      const rows = await db.getAllAsync<{ card_id: string; qty: number }>(
        `SELECT i.card_id, SUM(i.quantity) AS qty
           FROM cloud_collection_items i
           JOIN cloud_collections c ON c.id = i.collection_id
          WHERE c.user_id = ? AND c.kind = 'collection'
          GROUP BY i.card_id`,
        [user!.id],
      );
      const cardIds = rows.map(r => r.card_id);
      if (cardIds.length === 0) return [];
      const qtys = rows.map(r => Number(r.qty) || 1);

      // 2. One RPC round trip: variant resolution, history join, quantity
      // weighting, and forward-fill all happen server-side (migrations 024/028).
      const days = RANGE_CUTOFF_DAYS[range];
      const cutoffDate =
        days != null
          ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
          : null;

      const { data, error } = await supabase.rpc('portfolio_history', {
        card_ids: cardIds,
        cutoff: cutoffDate,
        qtys,
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
