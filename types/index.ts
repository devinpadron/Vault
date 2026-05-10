export type CardType = 'fire' | 'water' | 'grass' | 'bolt' | 'psy' | 'dark' | 'metal' | 'dragon' | 'fairy';

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
  foil: boolean;
  art: [string, string, string];
  creature: string;
  types: CardType[];
  artist: string;
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

export type PriceHistory = number[];

export interface AppData {
  cards: Card[];
  news: NewsItem[];
  friends: Friend[];
  binders: Binder[];
  priceHistory: PriceHistory;
  listings: Listing[];
}
