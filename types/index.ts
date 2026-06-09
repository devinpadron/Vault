export type CardType =
  | "fire"
  | "water"
  | "grass"
  | "bolt"
  | "psy"
  | "dark"
  | "metal"
  | "dragon"
  | "fairy";

// Matches known card suffix variants at the end of a card name (case-insensitive).
const CARD_VARIANT_RE = /\s+(ex|gx|V|VMAX|VSTAR|V-UNION)$/i;

/** Returns the base card name with any trailing variant suffix stripped. */
export function cardBaseName(name: string): string {
  return name.replace(CARD_VARIANT_RE, "");
}

/**
 * Returns the variant suffix (e.g. "ex", "VMAX") if the card name ends with one,
 * otherwise null. Use in place of the deprecated `card.variant` field.
 */
export function cardNameVariant(name: string): string | null {
  const m = name.match(CARD_VARIANT_RE);
  return m ? m[1] : null;
}

export interface CardVariants {
  holo: boolean; // holofoil or unlimitedHolofoil
  reverse: boolean; // reverseHolofoil
  firstEdition: boolean; // firstEdition (vintage sets)
}

export interface VariantPrice {
  id: string;          // card_variants UUID
  name: string;        // Scrydex variant name
  displayName: string; // human-readable label
  price: number | null;
}

export interface CardAttack {
  name: string;
  text: string | null;
  damage: string | null;
  cost: string[];                // energy-type strings ("Fire", "Colorless", …)
  convertedEnergyCost: number;
}

export interface CardAbility {
  name: string;
  text: string;
  type: string;                  // "Ability" | "Poké-Power" | "Poké-Body" | "VSTAR Power" | …
}

export interface CardWeakness {
  type: string;                  // "Fire", "Water", …
  value: string;                 // "×2", "-30"
}

export interface Card {
  // Identity
  id: string;
  name: string;
  variant: string; // primary variant display label (e.g. 'holofoil', 'EX ★')
  set: string; // expansion name, uppercased
  series?: string; // expansion series (e.g. 'Scarlet & Violet')
  no: string; // printed card number (e.g. '087/167')
  release: string; // release date (YYYY-MM-DD)

  // Classification
  rarity: string;
  rarity_code?: string; // symbol shorthand (e.g. '★H')
  supertype?: string; // 'Pokémon' | 'Trainer' | 'Energy'
  subtypes?: string[]; // ['Stage 2'] | ['V', 'VMAX'] | etc.
  foil: boolean;
  national_pokedex_numbers?: number[];
  regulation_mark?: string;

  // Market
  value: number;           // current NM raw market price (USD)
  change: number;          // 7-day price change
  trend30d: number | null; // 30-day percent change (null = no data)

  // Visuals
  art: [string, string, string];
  creature: string; // type symbol glyph
  types: CardType[];
  imageUrl?: string;

  // Detail
  artist: string;
  hp?: number;
  description?: string;          // flavor text
  variants?: CardVariants;
  variantPrices?: VariantPrice[];

  // Pokémon-card detail (populated only for supertype === 'Pokémon')
  abilities?: CardAbility[];
  attacks?: CardAttack[];
  weaknesses?: CardWeakness[];
  resistances?: CardWeakness[];
  retreatCost?: string[];        // energy-type strings; length == colorless retreat
  convertedRetreatCost?: number;
}

export interface Binder {
  id: string;
  name: string;
  subtitle: string;
  count: number;
  cover: Card;
  tone: [string, string];
  /** When present, the binder auto-materializes from the owner's collection
   *  using these rules. Manual adds are ignored on smart binders. */
  rules?: import('@/lib/db/cloud-sync').SmartBinderRules | null;
}

export interface Friend {
  id: string;
  name: string;
  handle: string;
  avatar: [string, string];
  binders: number;
  recent: string;     // most-recently-added card name; shown on the friend profile
}

export interface Listing {
  id: string;
  card: Card;
  price: number;
  condition: string;
  seller: string;
  seller_score: number;
  listed: string;
}

export interface NewsItem {
  id: string;
  tag: string;
  when: string;
  title: string;
  art: [string, string, string];   // gradient fallback when image_url is missing
  minutes: number;
  url?: string;                    // article link; tap-through target
  image_url?: string | null;       // when present the row renders this instead of the gradient
  source?: string;
}

export interface User {
  id: string;
  name: string;
  handle: string;
  email: string;
  avatar: [string, string];
}

export type PriceHistory = number[];

export interface AppData {
  cards: Card[];
  news: NewsItem[];
  friends: Friend[];
  binders: Binder[];
  priceHistory: PriceHistory;
  listings: Listing[];
}
