import {
  CardType,
  Card as AppCard,
  VariantPrice,
  CardAttack,
  CardAbility,
  CardWeakness,
} from '@/types';

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

export const HIGH_VALUE_RARITIES = [
  'Special Illustration Rare',
  'Hyper Rare',
  'Illustration Rare',
  'Ultra Rare',
  'Double Rare',
] as const;

export const FEATURED_RARITIES = [
  'Special Illustration Rare',
  'Hyper Rare',
  'Illustration Rare',
] as const;

// ---------------------------------------------------------------------------
// Supabase row shapes (new tiered schema)
// ---------------------------------------------------------------------------

export interface SupabaseExpansion {
  id: string;
  name: string;
  series: string | null;
  release_date: string | null;
}

export interface SupabaseCardImage {
  url: string;
  type: string;   // 'front' | 'back'
  size: string;   // 'small' | 'medium' | 'large'
}

export interface SupabaseCurrentPrice {
  market: number | null;
  low: number | null;
  trend_7d_change: number | null;
  trend_7d_pct: number | null;
  trend_30d_change: number | null;
  trend_30d_pct: number | null;
  trend_90d_change: number | null;
  trend_90d_pct: number | null;
  type: string;                  // 'raw' | 'graded'
  condition: string | null;      // 'NM' | 'LP' | ... | '' for graded
  grader: string | null;         // 'PSA' | 'CGC' | 'BGS' | … | '' for raw
  grade: string | null;          // '10' | '9.5' | … | '' for raw
}

export interface SupabaseCardVariant {
  id: string;
  name: string;
  card_prices_current: SupabaseCurrentPrice[];
}

// Raw Scrydex shapes as stored in jsonb columns on cards. Mirrors ScrydexCardFull.
export interface RawScrydexAttack {
  cost?: string[];
  converted_energy_cost?: number;
  name: string;
  text?: string | null;
  damage?: string | null;
}

export interface RawScrydexAbility {
  type: string;
  name: string;
  text: string;
}

export interface RawScrydexTypedValue {
  type: string;
  value: string;
}

export interface SupabaseCardFull {
  id: string;
  name: string;
  supertype: string | null;
  subtypes: string[] | null;
  types: string[] | null;
  hp: string | null;
  rarity: string | null;
  rarity_code: string | null;
  artist: string | null;
  number: string | null;
  printed_number: string | null;
  flavor_text: string | null;
  national_pokedex_numbers: number[] | null;
  regulation_mark: string | null;
  abilities: RawScrydexAbility[] | null;
  attacks: RawScrydexAttack[] | null;
  weaknesses: RawScrydexTypedValue[] | null;
  resistances: RawScrydexTypedValue[] | null;
  retreat_cost: string[] | null;
  converted_retreat_cost: number | string | null;
  expansions: SupabaseExpansion;
  card_images: SupabaseCardImage[];
  card_variants: SupabaseCardVariant[];
}

// Columns to select in every card query — nested PostgREST syntax
export const CARD_SELECT = [
  'id', 'name', 'supertype', 'subtypes', 'types', 'hp',
  'rarity', 'rarity_code', 'artist',
  'number', 'printed_number', 'flavor_text',
  'national_pokedex_numbers', 'regulation_mark',
  'abilities', 'attacks', 'weaknesses', 'resistances',
  'retreat_cost', 'converted_retreat_cost',
  'expansions!expansion_id!inner(id, name, series, release_date)',
  'card_images(url, type, size)',
  'card_variants(id, name, card_prices_current(market, low, trend_7d_change, trend_7d_pct, trend_30d_change, trend_30d_pct, trend_90d_change, trend_90d_pct, type, condition, grader, grade))',
].join(', ');

// Known variant overrides — covers the most common cases cleanly.
const KNOWN_VARIANTS: Record<string, string> = {
  normal:               'Normal',
  holofoil:             'Holofoil',
  unlimitedHolofoil:    'Unlimited',
  reverseHolofoil:      'Reverse Holo',
  firstEdition:         '1st Edition',
  firstEditionHolofoil: '1st Edition',
};

export function formatVariantName(name: string): string {
  if (KNOWN_VARIANTS[name]) return KNOWN_VARIANTS[name];

  // Convert camelCase → individual words
  const words = name
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

  // Strip trailing "Holofoil" when other words are present — it's implied
  // by the holo badge already shown on the card.
  if (words.length > 1 && words[words.length - 1].toLowerCase() === 'holofoil') {
    words.pop();
  }

  return words.join(' ') || name;
}

export function mapRow(row: SupabaseCardFull, index = 0): AppCard {
  const primaryType = row.types?.[0];
  const appType = TCGDEX_TYPE_MAP[primaryType ?? ''] ?? 'dark';
  const rarity = row.rarity ?? 'Common';
  const foil = FOIL_RARITIES.has(rarity);

  // Use live NM raw price. When no price data exists, value = 0 so the UI
  // can show "—" rather than a misleading rarity-based estimate.
  const nmPrice = row.card_variants
    .flatMap(v => v.card_prices_current)
    .find(p => p.type === 'raw' && p.condition === 'NM');

  const value   = nmPrice?.market         ?? 0;
  const change  = nmPrice?.trend_7d_change ?? 0;
  const trend30d = nmPrice?.trend_30d_pct  ?? null;

  // Pick front/large image, falling back through sizes
  const pickImage = (imgType: string, ...sizes: string[]): string | undefined => {
    for (const size of sizes) {
      const img = row.card_images.find(i => i.type === imgType && i.size === size);
      if (img) return img.url;
    }
    return undefined;
  };

  // Variant price list — only variants with an NM raw price, sorted highest first.
  const variantPrices: VariantPrice[] = row.card_variants
    .map(v => {
      const nm = v.card_prices_current.find(p => p.type === 'raw' && p.condition === 'NM');
      return {
        id:          v.id,
        name:        v.name,
        displayName: formatVariantName(v.name),
        price:       nm?.market ?? null,
      };
    })
    .filter(v => v.price != null)
    .sort((a, b) => (b.price ?? 0) - (a.price ?? 0));

  // Map Scrydex variant name strings → CardVariants boolean flags for UI chips
  const variantNames = new Set(row.card_variants.map(v => v.name));
  const variants: import('@/types').CardVariants = {
    holo:         variantNames.has('holofoil') || variantNames.has('unlimitedHolofoil'),
    reverse:      variantNames.has('reverseHolofoil'),
    firstEdition: variantNames.has('firstEdition'),
  };

  // Map the rich Pokémon-card detail (jsonb fields) to clean app shapes.
  const attacks: CardAttack[] | undefined = row.attacks?.length
    ? row.attacks.map(a => ({
        name:                a.name,
        text:                a.text ?? null,
        damage:              a.damage ?? null,
        cost:                a.cost ?? [],
        convertedEnergyCost: a.converted_energy_cost ?? (a.cost?.length ?? 0),
      }))
    : undefined;

  const abilities: CardAbility[] | undefined = row.abilities?.length
    ? row.abilities.map(a => ({ name: a.name, text: a.text, type: a.type }))
    : undefined;

  const weaknesses: CardWeakness[] | undefined = row.weaknesses?.length
    ? row.weaknesses.map(w => ({ type: w.type, value: w.value }))
    : undefined;

  const resistances: CardWeakness[] | undefined = row.resistances?.length
    ? row.resistances.map(r => ({ type: r.type, value: r.value }))
    : undefined;

  const retreatCost = row.retreat_cost?.length ? row.retreat_cost : undefined;
  const rawCrc = row.converted_retreat_cost;
  const convertedRetreatCost =
    typeof rawCrc === 'number'
      ? rawCrc
      : typeof rawCrc === 'string'
        ? (parseInt(rawCrc, 10) || undefined)
        : retreatCost?.length;

  return {
    id:                       row.id,
    name:                     row.name,
    variant:                  row.card_variants[0]?.name ?? RARITY_VARIANTS[rarity] ?? '—',
    set:                      row.expansions.name.toUpperCase(),
    series:                   row.expansions.series ?? undefined,
    no:                       row.printed_number ?? row.number ?? '—',
    release:                  row.expansions.release_date ?? '—',
    rarity,
    rarity_code:              row.rarity_code ?? undefined,
    supertype:                row.supertype ?? undefined,
    subtypes:                 row.subtypes?.length ? row.subtypes : undefined,
    national_pokedex_numbers: row.national_pokedex_numbers?.length
                                ? row.national_pokedex_numbers
                                : undefined,
    regulation_mark:          row.regulation_mark ?? undefined,
    value,
    change,
    trend30d,
    foil,
    art:                      TYPE_ART[appType],
    creature:                 TYPE_CREATURES[appType] ?? '○',
    types:                    [appType],
    artist:                   row.artist ?? 'Unknown',
    imageUrl:                 pickImage('front', 'large', 'medium', 'small'),
    hp:                       row.hp ? (parseInt(row.hp, 10) || undefined) : undefined,
    description:              row.flavor_text ?? undefined,
    variants,
    variantPrices:            variantPrices.length > 0 ? variantPrices : undefined,
    abilities,
    attacks,
    weaknesses,
    resistances,
    retreatCost,
    convertedRetreatCost,
  };
}
