export type CardType = 'fire' | 'water' | 'grass' | 'bolt' | 'psy' | 'dark' | 'metal' | 'dragon' | 'fairy';

// Matches known card suffix variants at the end of a card name (case-insensitive).
const CARD_VARIANT_RE = /\s+(ex|gx|V|VMAX|VSTAR)$/i;

/** Returns the base card name with any trailing variant suffix stripped. */
export function cardBaseName(name: string): string {
  return name.replace(CARD_VARIANT_RE, '');
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
  firstEdition: boolean;
  holo: boolean;
  normal: boolean;
  reverse: boolean;
  wPromo: boolean;
}

export interface Card {
  id: string;
  name: string;
  variant: string;
  set: string;
  no: string;
  release: string;
  rarity: string;
  value: number;
  change: number;
  avg30?: number;
  foil: boolean;
  art: [string, string, string];
  creature: string;
  types: CardType[];
  artist: string;
  imageUrl?: string;
  hp?: number;
  description?: string;
  variants?: CardVariants;
}

export interface Binder {
  id: string;
  name: string;
  subtitle: string;
  count: number;
  cover: Card;
  tone: [string, string];
}

export interface Friend {
  id: string;
  name: string;
  handle: string;
  avatar: [string, string];
  value: number;
  binders: number;
  online: boolean;
  recent: string;
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
  art: [string, string, string];
  minutes: number;
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
