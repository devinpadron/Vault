import { CardType } from '@/types';

// Raw shapes returned by the TCGDex REST API
export interface CardBrief {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

export interface CardmarketPrices {
  updated?: string;
  unit?: string;
  avg?: number;
  low?: number;
  trend?: number;
  avg1?: number;
  avg7?: number;
  avg30?: number;
  'avg-holo'?: number;
  'low-holo'?: number;
  'trend-holo'?: number;
  'avg1-holo'?: number;
  'avg7-holo'?: number;
  'avg30-holo'?: number;
}

export interface CardFull extends CardBrief {
  rarity: string;
  category: string;
  illustrator?: string;
  hp?: number;
  types?: string[];
  suffix?: string;
  description?: string;
  variants?: {
    firstEdition?: boolean;
    holo?: boolean;
    normal?: boolean;
    reverse?: boolean;
    wPromo?: boolean;
  };
  pricing?: {
    cardmarket?: CardmarketPrices;
    tcgplayer?: unknown;
  };
  set: {
    id: string;
    name: string;
    cardCount: { total: number; official: number };
    releaseDate?: string;
  };
}

export const TCGDEX_TYPE_MAP: Record<string, CardType> = {
  Fire: 'fire',
  Water: 'water',
  Grass: 'grass',
  Lightning: 'bolt',
  Psychic: 'psy',
  Darkness: 'dark',
  Metal: 'metal',
  Dragon: 'dragon',
  Fairy: 'fairy',
  Colorless: 'dark',
  Fighting: 'dark',
  Poison: 'psy',
  Normal: 'dark',
};

export const TYPE_ART: Record<CardType, [string, string, string]> = {
  fire:   ['#FF7A3A', '#C0291A', '#3A0E0E'],
  water:  ['#5FD2FF', '#2A6BC9', '#0E1F3A'],
  grass:  ['#9CFF6E', '#2EA15A', '#0E2F1F'],
  bolt:   ['#FFE03A', '#D9A300', '#3A2A0E'],
  psy:    ['#FF7AE0', '#7B2AC9', '#1F0E3A'],
  dark:   ['#5C5C75', '#1F1F2D', '#08080F'],
  metal:  ['#D6D9E0', '#7A8090', '#1A1C24'],
  dragon: ['#7A6BFF', '#3A1E9C', '#0E0A2E'],
  fairy:  ['#FFB8E0', '#C96AAF', '#3A1A2E'],
};

export const TYPE_CREATURES: Record<CardType, string> = {
  fire:   '🜂',
  water:  '≈',
  grass:  '✿',
  bolt:   '⚡',
  psy:    '◐',
  dark:   '☾',
  metal:  '◆',
  dragon: '✶',
  fairy:  '✦',
};

export const FOIL_RARITIES = new Set([
  'Illustration Rare',
  'Special Illustration Rare',
  'Ultra Rare',
  'Double Rare',
  'Hyper Rare',
  'Rare Holo',
  'VMAX Rare',
  'VSTAR Rare',
  'Amazing Rare',
  'Radiant Rare',
  'Shiny Rare',
  'Shiny Ultra Rare',
  'Secret Rare',
  'Rainbow Rare',
  'ACE SPEC Rare',
]);

export const RARITY_VALUES: Record<string, { value: number; change: number }> = {
  'Special Illustration Rare': { value: 9800,  change: 480    },
  'Hyper Rare':                { value: 5400,  change: 210    },
  'Shiny Ultra Rare':          { value: 4600,  change: 156    },
  'Illustration Rare':         { value: 4280,  change: 124.50 },
  'Ultra Rare':                { value: 2140,  change: 84     },
  'Shiny Rare':                { value: 1840,  change: 42     },
  'Double Rare':               { value: 1620,  change: 18.20  },
  'Amazing Rare':              { value: 1320,  change: 32.80  },
  'ACE SPEC Rare':             { value: 1080,  change: 28     },
  'Rare Holo':                 { value: 980,   change: -12.40 },
  'Radiant Rare':              { value: 760,   change: 14.40  },
  'VMAX Rare':                 { value: 620,   change: 10.20  },
  'VSTAR Rare':                { value: 380,   change: -8.10  },
  'Rare':                      { value: 240,   change: 4.10   },
  'Uncommon':                  { value: 12,    change: 0      },
  'Common':                    { value: 4,     change: 0      },
};

export const RARITY_VARIANTS: Record<string, string> = {
  'Special Illustration Rare': 'EX ★',
  'Hyper Rare':                '★★',
  'Shiny Ultra Rare':          'Shiny ★',
  'Illustration Rare':         '★',
  'Ultra Rare':                'V',
  'Double Rare':               'ex',
  'VMAX Rare':                 'VMAX',
  'VSTAR Rare':                'VSTAR',
  'Amazing Rare':              '★A',
  'Radiant Rare':              'Radiant',
  'Shiny Rare':                'Shiny',
  'ACE SPEC Rare':             'ACE',
  'Rare Holo':                 'Holo',
  'Rare':                      '—',
  'Uncommon':                  '—',
  'Common':                    '—',
};
