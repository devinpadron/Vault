// Filter + sort logic for the Collection screen.
// All state is plain values — easy to serialize, compare, or persist later.

import { Card, CardType, cardNameVariant } from '@/types';

// Value slider — fixed soft cap. valueMax === null means "no upper bound";
// the slider's right thumb at the end emits null so cards above the cap
// are still included.
export const VALUE_MAX_CAP = 10_000;

export type SortMode      = 'recent' | 'value' | 'name';
export type SortDirection = 'desc' | 'asc';

// Each mode has a "natural" default direction — recent newest-first, value
// high-first, name A→Z. Surfaced in the sheet as the initial direction when
// the user activates a mode; subsequent taps flip it.
export const DEFAULT_SORT_DIRECTION: Record<SortMode, SortDirection> = {
  recent: 'desc',
  value:  'desc',
  name:   'asc',
};

export interface CollectionFilters {
  types:       Set<CardType>;         // multi-select; matches if any card type is included
  sets:        Set<string>;
  rarities:    Set<string>;
  supertypes:  Set<string>;           // 'Pokémon' | 'Trainer' | 'Energy'
  variants:    Set<string>;           // 'EX' | 'V' | 'VMAX' | 'VSTAR' | 'GX' | 'V-UNION'
  valueMin:    number;
  valueMax:    number | null;         // null = unlimited
  trend:       'all' | 'gainers' | 'losers';
  foilOnly:    boolean;
  sortMode:    SortMode;
  sortDir:     SortDirection;
}

export const EMPTY_FILTERS: CollectionFilters = {
  types:        new Set(),
  sets:         new Set(),
  rarities:     new Set(),
  supertypes:   new Set(),
  variants:     new Set(),
  valueMin:     0,
  valueMax:     null,
  trend:        'all',
  foilOnly:     false,
  sortMode:     'recent',
  sortDir:      'desc',
};

export interface CollectionEntry {
  item_id:        string;         // collection_item id — identifies this physical copy
  card:           Card;
  quantity:       number;         // how many identical copies this row represents
  added_at:       number;
  acquired_price: number | null;  // USD cost basis, null = not set
  acquired_at:    number | null;  // epoch ms acquisition date, null = unknown
  variant_name:   string | null;  // chosen printing (display), null = any/standard
  condition:      string | null;  // NM | LP | … (raw copies)
  grader:         string | null;  // PSA | CGC | … (graded copies)
  grade:          string | null;  // '10' | '9.5' | … (graded copies)
}

// ─── Apply ───────────────────────────────────────────────────────────────────

export function applyFilters(entries: CollectionEntry[], f: CollectionFilters): CollectionEntry[] {
  const out = entries.filter(({ card }) => matches(card, f));
  return sortEntries(out, f.sortMode, f.sortDir);
}

function matches(card: Card, f: CollectionFilters): boolean {
  if (f.types.size > 0) {
    const cardTypes = card.types ?? [];
    if (!cardTypes.some(t => f.types.has(t))) return false;
  }
  if (f.foilOnly && !card.foil) return false;
  if (f.sets.size > 0 && !f.sets.has(card.set)) return false;
  if (f.rarities.size > 0 && !f.rarities.has(card.rarity)) return false;
  if (f.supertypes.size > 0 && !(card.supertype && f.supertypes.has(card.supertype))) return false;

  if (f.variants.size > 0) {
    const v = cardNameVariant(card.name);
    if (!v || !f.variants.has(v.toUpperCase())) return false;
  }

  if (card.value < f.valueMin) return false;
  if (f.valueMax !== null && card.value > f.valueMax) return false;

  if (f.trend !== 'all') {
    const t = card.trend30d;
    if (t == null) return false;
    if (f.trend === 'gainers' && t <= 0) return false;
    if (f.trend === 'losers'  && t >= 0) return false;
  }

  return true;
}

// ─── Sort ────────────────────────────────────────────────────────────────────

function sortEntries(
  entries: CollectionEntry[],
  mode: SortMode,
  dir: SortDirection,
): CollectionEntry[] {
  const copy = entries.slice();
  const factor = dir === 'desc' ? -1 : 1;
  switch (mode) {
    case 'recent':
      return copy.sort((a, b) => factor * (a.added_at - b.added_at));
    case 'value':
      return copy.sort((a, b) => factor * (a.card.value - b.card.value));
    case 'name':
      return copy.sort((a, b) => factor * a.card.name.localeCompare(b.card.name));
  }
}

// ─── Helpers / facets ────────────────────────────────────────────────────────

// Render a value like 0, 87, 1500, 10000 as "$0", "$85", "$1.5k", "$10k+".
// Used by the slider + the active filter chip so both surfaces agree.
export function formatValue(v: number, maxIsUnlimited = false): string {
  if (maxIsUnlimited) return `$${formatCompact(VALUE_MAX_CAP)}+`;
  if (v === 0)        return '$0';
  if (v < 1000)       return `$${Math.round(v)}`;
  return `$${formatCompact(v)}`;
}

function formatCompact(v: number): string {
  const k = v / 1000;
  return `${k >= 10 ? k.toFixed(0) : k.toFixed(1).replace(/\.0$/, '')}k`;
}

// Snap a continuous value to round dollars at a granularity that matches its
// magnitude. The slider stores the snapped number so the chip + filter logic
// stay clean (no "$87.413…").
export function snapValue(v: number): number {
  if (v <= 0)    return 0;
  if (v < 10)    return Math.round(v);
  if (v < 100)   return Math.round(v / 5)   * 5;
  if (v < 1000)  return Math.round(v / 25)  * 25;
  return Math.round(v / 100) * 100;
}

// True when a range filter is meaningfully set (i.e. excludes any card).
export function isValueRangeActive(f: CollectionFilters): boolean {
  return f.valueMin > 0 || f.valueMax !== null;
}

export function valueRangeLabel(f: CollectionFilters): string {
  const hasMin = f.valueMin > 0;
  const hasMax = f.valueMax !== null;
  if (hasMin && hasMax) return `${formatValue(f.valueMin)} – ${formatValue(f.valueMax!)}`;
  if (hasMin)           return `Over ${formatValue(f.valueMin)}`;
  if (hasMax)           return `Under ${formatValue(f.valueMax!)}`;
  return '';
}

// Mode label + direction arrow shown inline next to the active mode chip.
// Direction text ("Newest" / "Oldest", "High" / "Low", "A→Z" / "Z→A") is
// rendered separately so the sheet can theme it independently.
export const SORT_LABEL: Record<SortMode, string> = {
  recent: 'Date added',
  value:  'Value',
  name:   'Name',
};

export function sortDirectionLabel(mode: SortMode, dir: SortDirection): string {
  if (mode === 'name')   return dir === 'asc' ? 'A → Z'    : 'Z → A';
  if (mode === 'recent') return dir === 'desc' ? 'Newest'  : 'Oldest';
  return dir === 'desc' ? 'High → low' : 'Low → high';
}

export const TYPE_LABEL: Record<CardType, string> = {
  fire:   'Fire',
  water:  'Water',
  grass:  'Grass',
  bolt:   'Lightning',
  psy:    'Psychic',
  dark:   'Dark',
  metal:  'Metal',
  dragon: 'Dragon',
  fairy:  'Fairy',
};

export const TYPE_COLOR: Record<CardType, string> = {
  fire:   '#FF7A3A',
  water:  '#5FD2FF',
  grass:  '#9CFF6E',
  bolt:   '#FFE03A',
  psy:    '#FF7AE0',
  dark:   '#5C5C75',
  metal:  '#D6D9E0',
  dragon: '#7A6BFF',
  fairy:  '#FFB8E0',
};

export const ALL_TYPES: CardType[] = [
  'fire', 'water', 'grass', 'bolt', 'psy', 'dark', 'metal', 'dragon', 'fairy',
];

// Distinct values present in the current collection — feeds the sheet's
// multi-select sections so we never show options that filter to zero.
export interface CollectionFacets {
  sets:       string[];
  rarities:   string[];
  supertypes: string[];
  variants:   string[];
}

export function facetsFor(entries: CollectionEntry[]): CollectionFacets {
  const sets       = new Set<string>();
  const rarities   = new Set<string>();
  const supertypes = new Set<string>();
  const variants   = new Set<string>();
  for (const { card } of entries) {
    if (card.set)       sets.add(card.set);
    if (card.rarity)    rarities.add(card.rarity);
    if (card.supertype) supertypes.add(card.supertype);
    const v = cardNameVariant(card.name);
    if (v) variants.add(v.toUpperCase());
  }
  return {
    sets:       Array.from(sets).sort(),
    rarities:   Array.from(rarities).sort(),
    supertypes: Array.from(supertypes).sort(),
    variants:   Array.from(variants).sort(),
  };
}

// True when the user has any filter active aside from sort.
export function activeFilterCount(f: CollectionFilters): number {
  return (
    f.types.size +
    f.sets.size +
    f.rarities.size +
    f.supertypes.size +
    f.variants.size +
    (isValueRangeActive(f) ? 1 : 0) +
    (f.trend !== 'all' ? 1 : 0) +
    (f.foilOnly ? 1 : 0)
  );
}
