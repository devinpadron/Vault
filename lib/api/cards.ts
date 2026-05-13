import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card as AppCard } from '@/types';
import { SupabaseCard, mapRow, HIGH_VALUE_RARITIES, FEATURED_RARITIES } from './types';
import { getCardPricing, CardPricing } from './pricing';

const TABLE = 'pokemon_cards';

const COLS = [
  'id', 'name', 'image_url', 'artist', 'set_name', 'set_series',
  'release_date', 'card_number', 'rarity', 'variant', 'hp', 'types',
  'description', 'variant_first_edition', 'variant_holo', 'variant_normal',
  'variant_reverse', 'variant_wpromo',
].join(',');




export function useFeaturedCard() {
  return useQuery<AppCard | null>({
    queryKey: ['featured-card'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABLE)
        .select(COLS)
        .in('rarity', FEATURED_RARITIES)
        .not('image_url', 'is', null)
        .limit(100);

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) return null;

      const pick = Math.floor(Math.random() * data.length);
      return mapRow(data[pick] as unknown as SupabaseCard, pick);
    },
    staleTime: 1000 * 60 * 10,
  });
}

export function useCard(id: string) {
  return useQuery<AppCard | null>({
    queryKey: ['card', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABLE)
        .select(COLS)
        .eq('id', id)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) return null;
      return mapRow(data as unknown as SupabaseCard);
    },
    staleTime: 1000 * 60 * 60,
    enabled: !!id,
  });
}

const FILTER_COLUMN: Record<string, string> = {
  'Name':     'name',
  'Pokémon':  'name',
  'Set/Pack': 'set_name',
  'Artist':   'artist',
  'Rarity':   'rarity',
};

export type SortField = 'relevance' | 'price' | 'release' | 'number';
export type SortDir   = 'asc' | 'desc';

const PAGE_SIZE = 24;
const PRICE_SORT_LIMIT = 200;

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
        .select(COLS)
        .ilike(col, `%${query}%`)
        .not('image_url', 'is', null);

      if (sort.field === 'price') {
        // Price is rarity-derived — fetch a large batch for correct global ordering
        q = (q.order('rarity', { ascending: false }) as typeof q).limit(PRICE_SORT_LIMIT);
      } else if (sort.field === 'release') {
        q = (q.order('release_date', { ascending: sort.dir === 'asc' }) as typeof q)
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      } else if (sort.field === 'number') {
        q = (q.order('card_number', { ascending: sort.dir === 'asc' }) as typeof q)
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      } else {
        q = (q.order('rarity', { ascending: false }) as typeof q)
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      }

      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const offset = sort.field === 'price' ? 0 : page * PAGE_SIZE;
      return (data as unknown as SupabaseCard[]).map((row, i) => mapRow(row, offset + i));
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

// Portfolio-level history is not backed by JustTCG; returns empty so callers degrade gracefully.
export function useCardPriceHistory(_id: string, _range: string, _baseValue = 1000) {
  return useQuery<number[]>({
    queryKey: ['price-history-stub'],
    queryFn: () => Promise.resolve([]),
    staleTime: Infinity,
  });
}

export function useCardPricing(card: AppCard | null | undefined) {
  return useQuery<CardPricing | null>({
    queryKey: ['card-pricing', card?.id],
    queryFn: () => {
      if (!card) return Promise.resolve(null);
      return getCardPricing(card.id, card.set, card.name, card.no, card.rarity);
    },
    staleTime: 1000 * 60 * 60 * 24,
    enabled: !!card?.id,
  });
}
