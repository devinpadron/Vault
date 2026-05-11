import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';
import { Card as AppCard } from '@/types';
import {
  CardBrief,
  CardFull,
  TCGDEX_TYPE_MAP,
  TYPE_ART,
  TYPE_CREATURES,
  FOIL_RARITIES,
  RARITY_VALUES,
  RARITY_VARIANTS,
} from './types';

function mapCard(raw: CardFull, index = 0): AppCard {
  const primaryType = raw.types?.[0];
  const appType = TCGDEX_TYPE_MAP[primaryType ?? ''] ?? 'dark';
  const art = TYPE_ART[appType];
  const rarity = raw.rarity ?? 'Common';
  const foil = FOIL_RARITIES.has(rarity);
  const pricing = RARITY_VALUES[rarity] ?? { value: 8, change: 0 };
  const mult = 0.85 + (index % 9) * 0.04;

  const imageUrl = raw.image ? `${raw.image}/high.webp` : undefined;
  const variant = raw.suffix ?? RARITY_VARIANTS[rarity] ?? '—';
  const totalCards = raw.set?.cardCount?.official ?? raw.set?.cardCount?.total ?? 0;
  const cardNo = totalCards > 0 ? `${raw.localId}/${totalCards}` : String(raw.localId ?? '?');

  return {
    id:          raw.id ?? `card-${index}`,
    name:        raw.name ?? 'Unknown',
    variant,
    set:         (raw.set?.name ?? 'Unknown Set').toUpperCase(),
    no:          cardNo,
    release:     raw.set?.releaseDate ?? '—',
    rarity,
    value:       Math.round(pricing.value * mult * 100) / 100,
    change:      pricing.change,
    foil,
    art,
    creature:    TYPE_CREATURES[appType] ?? '○',
    types:       [appType],
    artist:      raw.illustrator ?? 'Unknown',
    imageUrl,
    hp:          raw.hp,
    description: raw.description,
  };
}

async function fetchFullCards(briefs: CardBrief[]): Promise<CardFull[]> {
  return Promise.all(briefs.map(b => apiFetch<CardFull>(`/cards/${b.id}`)));
}

export function useCards() {
  return useQuery<AppCard[]>({
    queryKey: ['cards'],
    queryFn: async () => {
      const briefs = await apiFetch<CardBrief[]>('/cards', {
        'rarity':                  'Special Illustration Rare',
        'sort:field':              'localId',
        'sort:order':              'ASC',
        'pagination:page':         '1',
        'pagination:itemsPerPage': '12',
      });
      const full = await fetchFullCards(briefs);
      return full.map((c, i) => mapCard(c, i));
    },
    staleTime: 1000 * 60 * 60,
  });
}

export function useFeaturedCard() {
  return useQuery<AppCard | null>({
    queryKey: ['featured-card'],
    queryFn: async () => {
      const briefs = await apiFetch<CardBrief[]>('/cards', {
        'rarity':                  'Special Illustration Rare',
        'sort:field':              'localId',
        'sort:order':              'DESC',
        'pagination:page':         '1',
        'pagination:itemsPerPage': '1',
      });
      if (!briefs.length) return null;
      const full = await apiFetch<CardFull>(`/cards/${briefs[0].id}`);
      return mapCard(full, 11);
    },
    staleTime: 1000 * 60 * 60 * 6,
  });
}

function genPriceHistory(baseValue: number, range: string, seed: number): number[] {
  const counts: Record<string, number> = { '1W': 8, '1M': 30, '6M': 26, '1Y': 52, 'ALL': 60 };
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

export function useCard(id: string) {
  return useQuery<AppCard | null>({
    queryKey: ['card', id],
    queryFn: async () => {
      const raw = await apiFetch<CardFull>(`/cards/${id}`);
      return mapCard(raw);
    },
    staleTime: 1000 * 60 * 60,
    enabled:   !!id,
  });
}
