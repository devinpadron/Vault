import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { SupabaseCard, mapRow } from './types';
import { Listing, Card as AppCard } from '@/types';

const TABLE = 'pokemon_cards';

const COLS = [
  'id', 'name', 'image_url', 'artist', 'set_name', 'set_series',
  'release_date', 'card_number', 'rarity', 'variant', 'hp', 'types',
  'description', 'variant_first_edition', 'variant_holo', 'variant_normal',
  'variant_reverse', 'variant_wpromo',
].join(',');

const SORT_FNS: Record<string, (a: Listing, b: Listing) => number> = {
  'Trending':     (a, b) => b.price - a.price,
  'Lowest price': (a, b) => a.price - b.price,
  'Ending soon':  () => 0,
  'PSA Graded':   (a, b) =>
    (b.condition.startsWith('PSA') ? 1 : 0) - (a.condition.startsWith('PSA') ? 1 : 0),
};

const SELLERS    = ['goldspring', 'cardvault', 'tideline', 'primepack', 'holostash', 'sparkbox', 'volkovshop', 'tracerPCG', 'aetherdrop', 'gemcase'];
const CONDITIONS = ['NM', 'NM', 'LP', 'PSA 9', 'EX', 'NM', 'LP', 'NM', 'EX', 'PSA 9'];
const SCORES     = [4.97, 4.99, 4.92, 4.85, 4.99, 4.94, 4.88, 4.99, 4.91, 4.96];
const LISTED     = ['2h', '15m', '4h', '1d', '8h', '3h', '2d', '45m', '6h', '1d'];

function cardToListing(card: AppCard, index: number): Listing {
  const i = index % 10;
  return {
    id:           `listing-${card.id}`,
    card,
    price:        Math.round(card.value * (0.88 + (index % 5) * 0.07)),
    condition:    CONDITIONS[i],
    seller:       SELLERS[i],
    seller_score: SCORES[i],
    listed:       LISTED[i],
  };
}

export function useListings(sort: string) {
  return useQuery<Listing[]>({
    queryKey: ['listings', sort],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABLE)
        .select(COLS)
        .eq('rarity', 'Special Illustration Rare')
        .not('image_url', 'is', null)
        .order('id', { ascending: true })
        .limit(10);

      if (error) throw new Error(error.message);
      const cards = (data as unknown as SupabaseCard[]).map(mapRow);
      const listings = cards.map(cardToListing);
      const fn = SORT_FNS[sort] ?? SORT_FNS['Trending'];
      return [...listings].sort(fn);
    },
    staleTime: 1000 * 60 * 30,
  });
}

export function useLiveLot() {
  return useQuery<AppCard | null>({
    queryKey: ['live-lot'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABLE)
        .select(COLS)
        .eq('rarity', 'Special Illustration Rare')
        .not('image_url', 'is', null)
        .order('id', { ascending: false })
        .limit(1)
        .single();

      if (error) throw new Error(error.message);
      return mapRow(data as unknown as SupabaseCard);
    },
    staleTime: 1000 * 60 * 60,
  });
}
