import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card as AppCard } from '@/types';
import { SupabaseCard, mapRow, HIGH_VALUE_RARITIES, FEATURED_RARITIES } from './types';

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

export function useSearchCards(query: string, filter = 'Name') {
  const col = FILTER_COLUMN[filter] ?? 'name';

  return useQuery<AppCard[]>({
    queryKey: ['search', query, filter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABLE)
        .select(COLS)
        .ilike(col, `%${query}%`)
        .not('image_url', 'is', null)
        .order('rarity', { ascending: false })
        .limit(24);

      if (error) throw new Error(error.message);
      return (data as unknown as SupabaseCard[]).map(mapRow);
    },
    enabled: query.trim().length >= 2,
    staleTime: 1000 * 60 * 10,
  });
}

function genPriceHistory(baseValue: number, range: string, seed: number): number[] {
  const counts:  Record<string, number> = { '1W': 8, '1M': 30, '6M': 26, '1Y': 52, 'ALL': 60 };
  const spreads: Record<string, number> = { '1W': 0.06, '1M': 0.15, '6M': 0.30, '1Y': 0.50, 'ALL': 0.70 };
  const n = counts[range] ?? 30;
  const spread = spreads[range] ?? 0.15;
  let v = baseValue * (1 - spread * 0.8);
  const arr: number[] = [];
  for (let i = 0; i < n; i++) {
    const progress = (i + 1) / n;
    const noise = Math.sin(i * 1.3 + seed) * spread * baseValue * 0.15;
    v = v + (baseValue - v) * (0.05 + progress * 0.03) + noise;
    arr.push(Math.round(Math.max(baseValue * 0.05, v)));
  }
  arr.push(baseValue);
  return arr;
}

export function useCardPriceHistory(id: string, range: string, baseValue = 1000) {
  return useQuery<number[]>({
    queryKey: ['price-history', id, range],
    queryFn: () => {
      const seed = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      return Promise.resolve(genPriceHistory(baseValue, range, seed));
    },
    staleTime: Infinity,
    enabled: !!id,
  });
}
