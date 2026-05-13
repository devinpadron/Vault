import { supabase } from '@/lib/supabase';

const BASE = 'https://api.justtcg.com/v1';
const PRICE_TTL_MS = 24 * 60 * 60 * 1000;
const NOT_FOUND_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface CardPricing {
  price_usd: number | null;
  price_avg_7d: number | null;
  price_avg_30d: number | null;
  price_avg_90d: number | null;
  price_change_7d: number | null;
  price_change_30d: number | null;
  price_change_90d: number | null;
  min_1y: number | null;
  max_1y: number | null;
  min_all_time: number | null;
  max_all_time: number | null;
  price_history: number[];
  not_found: boolean;
}

const NULL_PRICING: CardPricing = {
  price_usd: null,
  price_avg_7d: null,
  price_avg_30d: null,
  price_avg_90d: null,
  price_change_7d: null,
  price_change_30d: null,
  price_change_90d: null,
  min_1y: null,
  max_1y: null,
  min_all_time: null,
  max_all_time: null,
  price_history: [],
  not_found: false,
};

function apiKey(): string {
  return (process.env.EXPO_PUBLIC_JUSTTCG_API_KEY ?? '').trim();
}

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-');
}

function parseCardNum(no: string): string {
  // "206/193" → "206-193", "001" → "1", "TG15/TG30" → "tg15-tg30"
  return no
    .split('/')
    .map(part => {
      const trimmed = part.trim();
      const n = parseInt(trimmed, 10);
      return isNaN(n) ? toSlug(trimmed) : String(n);
    })
    .join('-');
}

function extractPrices(raw: unknown): number[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw
    .map((entry: unknown) => {
      if (!entry || typeof entry !== 'object') return 0;
      const e = entry as Record<string, unknown>;
      // JustTCG uses { p, t } shorthand in priceHistory
      return Number(e.p ?? e.price ?? 0);
    })
    .filter(p => p > 0);
}

async function getJustTcgSetId(setName: string): Promise<string | null> {
  const { data: cached } = await supabase
    .from('justtcg_set_map')
    .select('justtcg_set_id')
    .eq('set_name', setName)
    .maybeSingle();

  if (cached !== null) {
    return (cached as unknown as { justtcg_set_id: string | null }).justtcg_set_id;
  }

  const key = apiKey();
  if (!key) return null;

  try {
    const res = await fetch(
      `${BASE}/sets?game=pokemon&q=${encodeURIComponent(setName)}`,
      { headers: { 'x-api-key': key } },
    );
    const setId = res.ok
      ? ((await res.json()) as { data?: Array<{ id: string }> }).data?.[0]?.id ?? null
      : null;

    await supabase.from('justtcg_set_map').upsert({
      set_name: setName,
      justtcg_set_id: setId,
      cached_at: new Date().toISOString(),
    });

    return setId;
  } catch {
    return null;
  }
}

async function fetchVariantFromApi(cardId: string): Promise<CardPricing> {
  const key = apiKey();
  if (!key) return NULL_PRICING;

  const url = `${BASE}/cards?cardId=${encodeURIComponent(cardId)}&priceHistoryDuration=90d`;
  const res = await fetch(url, { headers: { 'x-api-key': key } });

  if (res.status === 404 || res.status === 422) {
    return { ...NULL_PRICING, not_found: true };
  }

  if (!res.ok) throw new Error(`JustTCG ${res.status}`);

  const json = await res.json() as { data?: Array<{ variants?: Array<Record<string, unknown>> }> };
  const variants = json.data?.[0]?.variants ?? [];

  // Prefer Near Mint with a real price; fall back to first variant with a price
  const nmVariant = variants.find(v => v.condition === 'Near Mint' && v.price != null);
  const variant = nmVariant ?? variants.find(v => v.price != null);

  if (!variant) return NULL_PRICING;

  return {
    price_usd: (variant.price as number | null) ?? null,
    price_avg_7d: (variant.avgPrice as number | null) ?? null,
    price_avg_30d: (variant.avgPrice30d as number | null) ?? null,
    price_avg_90d: (variant.avgPrice90d as number | null) ?? null,
    price_change_7d: (variant.priceChange7d as number | null) ?? null,
    price_change_30d: (variant.priceChange30d as number | null) ?? null,
    price_change_90d: (variant.priceChange90d as number | null) ?? null,
    min_1y: (variant.minPrice1y as number | null) ?? null,
    max_1y: (variant.maxPrice1y as number | null) ?? null,
    min_all_time: (variant.minPriceAllTime as number | null) ?? null,
    max_all_time: (variant.maxPriceAllTime as number | null) ?? null,
    price_history: extractPrices(variant.priceHistory),
    not_found: false,
  };
}

export async function getCardPricing(
  cardId: string,
  setName: string,
  cardName: string,
  cardNumber: string,
  rarity: string,
): Promise<CardPricing> {
  // Check Supabase cache
  const { data: row } = await supabase
    .from('card_prices')
    .select('*')
    .eq('card_id', cardId)
    .maybeSingle();

  if (row) {
    const r = row as {
      price_usd: number | null;
      price_avg_7d: number | null;
      price_avg_30d: number | null;
      price_avg_90d: number | null;
      price_change_7d: number | null;
      price_change_30d: number | null;
      price_change_90d: number | null;
      min_1y: number | null;
      max_1y: number | null;
      min_all_time: number | null;
      max_all_time: number | null;
      price_history: unknown;
      not_found: boolean;
      cached_at: string;
    };
    const age = Date.now() - new Date(r.cached_at).getTime();
    const ttl = r.not_found ? NOT_FOUND_TTL_MS : PRICE_TTL_MS;
    if (age < ttl) {
      return {
        price_usd: r.price_usd,
        price_avg_7d: r.price_avg_7d,
        price_avg_30d: r.price_avg_30d,
        price_avg_90d: r.price_avg_90d,
        price_change_7d: r.price_change_7d,
        price_change_30d: r.price_change_30d,
        price_change_90d: r.price_change_90d,
        min_1y: r.min_1y,
        max_1y: r.max_1y,
        min_all_time: r.min_all_time,
        max_all_time: r.max_all_time,
        price_history: extractPrices(r.price_history),
        not_found: r.not_found,
      };
    }
  }

  // Construct JustTCG card ID
  const setId = await getJustTcgSetId(setName);
  const setSlug = setId ? setId.replace(/-pokemon$/, '') : toSlug(setName);
  const jtcgCardId = `pokemon-${setSlug}-${toSlug(cardName)}-${parseCardNum(cardNumber)}-${toSlug(rarity)}`;

  let pricing: CardPricing;
  try {
    pricing = await fetchVariantFromApi(jtcgCardId);
  } catch {
    return NULL_PRICING;
  }

  // Store in Supabase cache
  await supabase.from('card_prices').upsert({
    card_id: cardId,
    justtcg_card_id: jtcgCardId,
    price_usd: pricing.price_usd,
    price_avg_7d: pricing.price_avg_7d,
    price_avg_30d: pricing.price_avg_30d,
    price_avg_90d: pricing.price_avg_90d,
    price_change_7d: pricing.price_change_7d,
    price_change_30d: pricing.price_change_30d,
    price_change_90d: pricing.price_change_90d,
    min_1y: pricing.min_1y,
    max_1y: pricing.max_1y,
    min_all_time: pricing.min_all_time,
    max_all_time: pricing.max_all_time,
    price_history: pricing.price_history,
    not_found: pricing.not_found,
    cached_at: new Date().toISOString(),
  });

  return pricing;
}

export function sliceHistoryForRange(history: number[], range: string): number[] {
  if (history.length < 2) return [];
  const sliceTo: Record<string, number> = {
    '1W': 7,
    '1M': 30,
    '6M': 90,
    '1Y': 90,
    'ALL': history.length,
  };
  const n = Math.min(sliceTo[range] ?? 30, history.length);
  return history.slice(-n);
}

// Maps the active range button to the corresponding price change field and display label
export function changForRange(
  pricing: CardPricing | null | undefined,
  range: string,
): { value: number | null; label: string } {
  if (!pricing) return { value: null, label: '' };
  const map: Record<string, { value: number | null; label: string }> = {
    '1W':  { value: pricing.price_change_7d,  label: '7D' },
    '1M':  { value: pricing.price_change_30d, label: '30D' },
    '6M':  { value: pricing.price_change_90d, label: '90D' },
    '1Y':  { value: pricing.price_change_90d, label: '90D' },
    'ALL': { value: pricing.price_change_90d, label: '90D' },
  };
  return map[range] ?? { value: null, label: '' };
}

// Maps the active range button to the corresponding average price field and display label
export function avgForRange(
  pricing: CardPricing | null | undefined,
  range: string,
): { value: number | null; label: string } {
  if (!pricing) return { value: null, label: '' };
  const map: Record<string, { value: number | null; label: string }> = {
    '1W':  { value: pricing.price_avg_7d,  label: '7D AVG' },
    '1M':  { value: pricing.price_avg_30d, label: '30D AVG' },
    '6M':  { value: pricing.price_avg_90d, label: '90D AVG' },
    '1Y':  { value: pricing.price_avg_90d, label: '90D AVG' },
    'ALL': { value: pricing.price_avg_90d, label: '90D AVG' },
  };
  return map[range] ?? { value: null, label: '' };
}
