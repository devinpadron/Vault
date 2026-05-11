import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';
import { CardBrief, CardFull, TCGDEX_TYPE_MAP, TYPE_ART, TYPE_CREATURES, FOIL_RARITIES, RARITY_VALUES, RARITY_VARIANTS } from './types';
import { MOCK_DATA } from '@/data/mock';
import { Listing, Card as AppCard } from '@/types';

const SORT_FNS: Record<string, (a: Listing, b: Listing) => number> = {
  'Trending':     (a, b) => b.price - a.price,
  'Lowest price': (a, b) => a.price - b.price,
  'Ending soon':  () => 0,
  'PSA Graded':   (a, b) =>
    (b.condition.startsWith('PSA') ? 1 : 0) - (a.condition.startsWith('PSA') ? 1 : 0),
};

export function useListings(sort: string) {
  return useQuery<Listing[]>({
    queryKey: ['listings', sort],
    queryFn: () => {
      const fn = SORT_FNS[sort] ?? SORT_FNS['Trending'];
      return Promise.resolve([...MOCK_DATA.listings].sort(fn));
    },
    staleTime: Infinity,
  });
}

function mapLotCard(raw: CardFull): AppCard {
  const primaryType = raw.types?.[0];
  const appType = TCGDEX_TYPE_MAP[primaryType ?? ''] ?? 'dark';
  const rarity = raw.rarity ?? 'Common';
  const foil = FOIL_RARITIES.has(rarity);
  const pricing = RARITY_VALUES[rarity] ?? { value: 8, change: 0 };
  const imageUrl = raw.image ? `${raw.image}/high.webp` : undefined;
  const variant = raw.suffix ?? RARITY_VARIANTS[rarity] ?? '—';
  const totalCards = raw.set?.cardCount?.official ?? raw.set?.cardCount?.total ?? 0;
  const cardNo = totalCards > 0 ? `${raw.localId}/${totalCards}` : String(raw.localId ?? '?');
  return {
    id:       raw.id ?? 'lot',
    name:     raw.name ?? 'Unknown',
    variant,
    set:      (raw.set?.name ?? 'Unknown Set').toUpperCase(),
    no:       cardNo,
    release:  raw.set?.releaseDate ?? '—',
    rarity,
    value:    pricing.value,
    change:   pricing.change,
    foil,
    art:      TYPE_ART[appType],
    creature: TYPE_CREATURES[appType] ?? '○',
    types:    [appType],
    artist:   raw.illustrator ?? 'Unknown',
    imageUrl,
    hp:       raw.hp,
  };
}

export function useLiveLot() {
  return useQuery<AppCard | null>({
    queryKey: ['live-lot'],
    queryFn: async () => {
      const briefs = await apiFetch<CardBrief[]>('/cards', {
        'rarity':                  'Special Illustration Rare',
        'sort:field':              'localId',
        'sort:order':              'ASC',
        'pagination:page':         '2',
        'pagination:itemsPerPage': '1',
      });
      if (!briefs.length) return null;
      const full = await apiFetch<CardFull>(`/cards/${briefs[0].id}`);
      return mapLotCard(full);
    },
    staleTime: 1000 * 60 * 60,
  });
}
