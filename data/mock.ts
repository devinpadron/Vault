import { AppData } from '@/types';

// Master switch for mock-backed surfaces. Set to false once a real backend
// exists for that data type. Currently no Scrydex endpoint covers news or
// friends — they remain mocked behind this flag while the rest of the app
// runs on Supabase data.
//
// TODO: when supabase/migrations/005_app_collections.sql is wired up
// (profiles + friendships tables), drop friends mocks and use real queries.
export const MOCK_DATA_ENABLED = true;

const fire: [string, string, string] = ['#FF7A3A', '#C0291A', '#3A0E0E'];
const water: [string, string, string] = ['#5FD2FF', '#2A6BC9', '#0E1F3A'];
const grass: [string, string, string] = ['#9CFF6E', '#2EA15A', '#0E2F1F'];
const bolt: [string, string, string] = ['#FFE03A', '#D9A300', '#3A2A0E'];
const psy: [string, string, string] = ['#FF7AE0', '#7B2AC9', '#1F0E3A'];
const dark: [string, string, string] = ['#5C5C75', '#1F1F2D', '#08080F'];
const metal: [string, string, string] = ['#D6D9E0', '#7A8090', '#1A1C24'];
const dragon: [string, string, string] = ['#7A6BFF', '#3A1E9C', '#0E0A2E'];
const fairy: [string, string, string] = ['#FFB8E0', '#C96AAF', '#3A1A2E'];

// Loose typing on purpose — these are placeholder rows, not real Card values.
// Consumers re-type them as needed; legacy fields like trend30d default to null.
const cards = [
  { id: 'c01', name: 'Emberwyrm',  variant: 'EX',    set: 'AETHER PRIME', no: '014/189', release: '2025-09-14', rarity: 'Holo Rare',  value: 4280.00, change: +124.50, trend30d: null, foil: true,  art: fire,   creature: '🜂', types: ['fire'],   artist: 'M. Volkov' },
  { id: 'c02', name: 'Voltlynx',   variant: '★',     set: 'STORMBOUND',   no: '041/198', release: '2024-11-02', rarity: 'Secret',      value: 1620.00, change: +18.20,  trend30d: null, foil: true,  art: bolt,   creature: '⚡', types: ['bolt'],   artist: 'J. Hayashi' },
  { id: 'c03', name: 'Aquadrake',  variant: 'V-MAX', set: 'TIDEBORN',     no: '007/212', release: '2025-03-20', rarity: 'Ultra Rare',  value: 980.00,  change: -12.40,  trend30d: null, foil: true,  art: water,  creature: '≈', types: ['water'],  artist: 'L. Bouchard' },
  { id: 'c04', name: 'Verdantis',  variant: 'GX',    set: 'AETHER PRIME', no: '022/189', release: '2025-09-14', rarity: 'Rare',        value: 240.00,  change: +4.10,   trend30d: null, foil: false, art: grass,  creature: '✿', types: ['grass'],  artist: 'M. Volkov' },
  { id: 'c05', name: 'Noxshade',   variant: 'EX',    set: 'OBSIDIAN',     no: '055/172', release: '2024-06-08', rarity: 'Holo Rare',   value: 2140.00, change: +84.00,  trend30d: null, foil: true,  art: dark,   creature: '☾', types: ['dark'],   artist: 'A. Reyes' },
  { id: 'c06', name: 'Chronoseer', variant: '★★',   set: 'TIMEWEAVE',    no: '003/120', release: '2024-12-01', rarity: 'Secret',      value: 5400.00, change: +210.00, trend30d: null, foil: true,  art: psy,    creature: '◐', types: ['psy'],    artist: 'K. Lindqvist' },
  { id: 'c07', name: 'Ferromorph', variant: 'V',     set: 'IRONHEART',    no: '088/220', release: '2024-04-19', rarity: 'Rare',        value: 380.00,  change: -8.10,   trend30d: null, foil: false, art: metal,  creature: '◆', types: ['metal'],  artist: 'D. Park' },
  { id: 'c08', name: 'Pyralisk',   variant: 'EX',    set: 'EMBERFALL',    no: '012/186', release: '2023-10-15', rarity: 'Holo Rare',   value: 1320.00, change: +32.80,  trend30d: null, foil: true,  art: fire,   creature: '☼', types: ['fire'],   artist: 'M. Volkov' },
  { id: 'c09', name: 'Mossfen',    variant: '—',     set: 'TIDEBORN',     no: '019/212', release: '2025-03-20', rarity: 'Common',      value: 12.00,   change: 0,       trend30d: null, foil: false, art: grass,  creature: '✦', types: ['grass'],  artist: 'L. Bouchard' },
  { id: 'c10', name: 'Glacira',    variant: 'V-MAX', set: 'STORMBOUND',   no: '008/198', release: '2024-11-02', rarity: 'Ultra Rare',  value: 760.00,  change: +14.40,  trend30d: null, foil: true,  art: water,  creature: '❄', types: ['water'],  artist: 'J. Hayashi' },
  { id: 'c11', name: 'Mirthrune',  variant: '—',     set: 'OBSIDIAN',     no: '110/172', release: '2024-06-08', rarity: 'Common',      value: 4.00,    change: 0,       trend30d: null, foil: false, art: fairy,  creature: '✿', types: ['fairy'],  artist: 'A. Reyes' },
  { id: 'c12', name: 'Drakorvex',  variant: 'EX ★',  set: 'AETHER PRIME', no: '189/189', release: '2025-09-14', rarity: 'Rainbow',     value: 9800.00, change: +480.00, trend30d: null, foil: true,  art: dragon, creature: '✶', types: ['dragon'], artist: 'M. Volkov' },
] as unknown as AppData['cards'];

export const MOCK_DATA: AppData = {
  cards,
  priceHistory: [3920, 3940, 3880, 3960, 4020, 4080, 4040, 4100, 4180, 4220, 4160, 4220, 4280, 4260, 4220, 4280, 4320, 4280],
  news: [
    { id: 'n1', tag: 'PACK DROP', when: '06.12 · TUE', title: 'Aether Prime II launches with 12 new chase cards',              art: fire,   minutes: 2 },
    { id: 'n2', tag: 'MARKET',    when: '01h ago',     title: 'Drakorvex Rainbow surges 8.4% on weekend tournament results',   art: dragon, minutes: 4 },
    { id: 'n3', tag: 'EVENT',     when: 'WEEKEND',     title: 'Live auction · Vintage Tideborn vault · 32 lots from $480',     art: water,  minutes: 5 },
    { id: 'n4', tag: 'LEAK',      when: '03h ago',     title: 'New Obsidian set teaser — first three card backs revealed',     art: dark,   minutes: 1 },
  ],
  friends: [
    { id: 'f1', name: 'Mira Halliwell', handle: '@mira_h',   avatar: ['#FF7AE0', '#C9A700'], value: 24800, binders: 6, online: true,  recent: 'Drakorvex EX ★' },
    { id: 'f2', name: 'Kenji Tanaka',   handle: '@kenji.t',  avatar: ['#5F9BFF', '#2EA15A'], value: 18420, binders: 4, online: true,  recent: 'Voltlynx ★' },
    { id: 'f3', name: 'Olu Adebayo',    handle: '@olu',      avatar: ['#9CFF6E', '#2A6BC9'], value: 11600, binders: 9, online: false, recent: 'Mossfen' },
    { id: 'f4', name: 'Sofía García',   handle: '@sof_g',    avatar: ['#FFE03A', '#FF7A3A'], value: 9240,  binders: 3, online: true,  recent: 'Pyralisk EX' },
    { id: 'f5', name: 'Theodore Lin',   handle: '@theo.lin', avatar: ['#7A6BFF', '#1F0E3A'], value: 7820,  binders: 2, online: false, recent: 'Aquadrake V-MAX' },
    { id: 'f6', name: 'Anika Patel',    handle: '@anika.p',  avatar: ['#5FD2FF', '#FFB8E0'], value: 6300,  binders: 5, online: true,  recent: 'Noxshade EX' },
  ],
  binders: [
    { id: 'b1', name: 'The Vault',          subtitle: 'Holos & Secrets',                     count: 48,  cover: cards[11], tone: ['#1F0E3A', '#7A6BFF'] },
    { id: 'b2', name: 'Aether Prime · Run', subtitle: 'Master set in progress · 142/189',    count: 142, cover: cards[0],  tone: ['#3A0E0E', '#FF7A3A'] },
    { id: 'b3', name: 'Tideborn Trades',    subtitle: 'For trade, not for sale',              count: 24,  cover: cards[2],  tone: ['#0E1F3A', '#5FD2FF'] },
    { id: 'b4', name: 'Childhood Pulls',    subtitle: 'Sentimental — do not sell',            count: 31,  cover: cards[7],  tone: ['#3A2A0E', '#FFE03A'] },
  ],
  listings: [
    { id: 'l1', card: cards[0],  price: 4280, condition: 'NM',    seller: 'goldspring', seller_score: 4.97, listed: '2h' },
    { id: 'l2', card: cards[5],  price: 5340, condition: 'PSA 9', seller: 'cardpriest', seller_score: 4.99, listed: '12m' },
    { id: 'l3', card: cards[2],  price: 940,  condition: 'NM',    seller: 'tideline',   seller_score: 4.92, listed: '4h' },
    { id: 'l4', card: cards[1],  price: 1580, condition: 'LP',    seller: 'sparkbox',   seller_score: 4.85, listed: '1d' },
    { id: 'l5', card: cards[7],  price: 1310, condition: 'NM',    seller: 'volkovshop', seller_score: 4.99, listed: '8h' },
  ],
};
