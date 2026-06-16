import { supabase } from '@/lib/supabase';

export interface PriceTrend {
  change: number | null;        // absolute USD change
  pct: number | null;           // percent change
}

export interface GradedOption {
  variant: string;              // Scrydex variant name — 'holofoil', 'reverseHolofoil', …
  grader: string;               // 'PSA' | 'CGC' | 'BGS' | 'TAG' | 'ACE'
  grade: string;                // '10' | '9.5' | '9' | …
  market: number | null;
  label: string;                // e.g. 'PSA 10'
  count: number;                // # of sold listings behind this tuple (sales volume)
}

// Canonical raw-condition display order (best → worst).
export const CONDITION_ORDER = ['NM', 'LP', 'MP', 'HP', 'DM'] as const;

export interface CardPricing {
  price_usd: number | null;
  price_avg_7d: number | null;
  price_avg_30d: number | null;
  price_avg_90d: number | null;
  // Scrydex ships trend columns for 7d/30d/90d; 1Y/ALL are computed from
  // history first/last on the client.
  pct_7d: number | null;
  pct_30d: number | null;
  pct_90d: number | null;
  pct_1y: number | null;
  pct_all: number | null;
  min_1y: number | null;
  max_1y: number | null;
  min_all_time: number | null;
  max_all_time: number | null;
  price_history: number[];          // ascending chronological market values for the selected condition
  price_history_dates: string[];    // matching ISO dates (YYYY-MM-DD)
  graded_options: GradedOption[];   // available graded prices for this card
  available_conditions: string[];   // raw conditions that have data for this variant (NM, LP, …)
  not_found: boolean;
}

const NULL_PRICING: CardPricing = {
  price_usd: null,
  price_avg_7d: null,
  price_avg_30d: null,
  price_avg_90d: null,
  pct_7d: null,
  pct_30d: null,
  pct_90d: null,
  pct_1y: null,
  pct_all: null,
  min_1y: null,
  max_1y: null,
  min_all_time: null,
  max_all_time: null,
  price_history: [],
  price_history_dates: [],
  graded_options: [],
  available_conditions: [],
  not_found: false,
};

export interface PricingQuery {
  type?: 'raw' | 'graded';
  grader?: string;
  grade?: string;
  condition?: string;   // raw condition to price — defaults to 'NM'
}

export async function getCardPricing(
  cardId: string,
  variantId?: string,
  query: PricingQuery = {},
): Promise<CardPricing> {
  const type = query.type ?? 'raw';
  const condition = query.condition ?? 'NM';

  // Graded path lives in card_listings — Scrydex doesn't expose grader/grade
  // through the prices include, only through /cards/{id}/listings. Hand off.
  if (type === 'graded') {
    return getGradedPricing(cardId, query.grader ?? 'PSA', query.grade ?? '10');
  }

  // ── Resolve variant (raw path only) ────────────────────────────────────────
  let resolvedVariantId: string;

  if (variantId) {
    resolvedVariantId = variantId;
  } else {
    const { data: variants, error: variantErr } = await supabase
      .from('card_variants')
      .select('id')
      .eq('card_id', cardId);

    if (variantErr || !variants || variants.length === 0) return NULL_PRICING;

    const variantIds = (variants as { id: string }[]).map(v => v.id);
    const { data: firstPrice } = await supabase
      .from('card_prices_current')
      .select('variant_id')
      .in('variant_id', variantIds)
      .eq('type', 'raw')
      .eq('condition', 'NM')
      .limit(1)
      .maybeSingle();

    if (!firstPrice) return { ...NULL_PRICING, graded_options: await listGradedOptions(cardId) };
    resolvedVariantId = (firstPrice as { variant_id: string }).variant_id;
  }

  // ── Available conditions ───────────────────────────────────────────────────
  // Which raw conditions have a current price for this variant, so the UI can
  // offer a condition switcher (NM default) only when alternatives exist.
  const { data: condRows } = await supabase
    .from('card_prices_current')
    .select('condition')
    .eq('variant_id', resolvedVariantId)
    .eq('type', 'raw');

  const presentConditions = new Set(
    ((condRows ?? []) as { condition: string | null }[])
      .map(r => r.condition)
      .filter((c): c is string => !!c),
  );
  const availableConditions = CONDITION_ORDER.filter(c => presentConditions.has(c));

  // ── Current price ──────────────────────────────────────────────────────────
  const { data: prices } = await supabase
    .from('card_prices_current')
    .select('market, trend_7d_pct, trend_30d_pct, trend_90d_pct')
    .eq('variant_id', resolvedVariantId)
    .eq('type', 'raw')
    .eq('condition', condition)
    .maybeSingle();

  if (!prices) {
    return {
      ...NULL_PRICING,
      available_conditions: availableConditions,
      graded_options: await listGradedOptions(cardId),
    };
  }

  const p = prices as {
    market: number | null;
    trend_7d_pct: number | null;
    trend_30d_pct: number | null;
    trend_90d_pct: number | null;
  };

  // ── Price history (all stored snapshots) ──────────────────────────────────
  const { data: history } = await supabase
    .from('card_price_history')
    .select('market, snapshot_date')
    .eq('variant_id', resolvedVariantId)
    .eq('type', 'raw')
    .eq('condition', condition)
    .order('snapshot_date', { ascending: true });

  const validHistory = (history ?? [])
    .filter((h: { market: number | null }) => h.market != null) as { market: number; snapshot_date: string }[];

  const priceHistory = validHistory.map(h => h.market);
  const priceHistoryDates = validHistory.map(h => h.snapshot_date);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
  const oneYearSlice = validHistory.filter(h => new Date(h.snapshot_date).getTime() >= oneYearAgo);
  const min1y = oneYearSlice.length ? Math.min(...oneYearSlice.map(h => h.market)) : null;
  const max1y = oneYearSlice.length ? Math.max(...oneYearSlice.map(h => h.market)) : null;
  const minAll = priceHistory.length ? Math.min(...priceHistory) : null;
  const maxAll = priceHistory.length ? Math.max(...priceHistory) : null;

  // 1Y / ALL percent change computed from history first/last in the window —
  // Scrydex only ships trend columns for 1/7/30/90 days.
  const pctFromSlice = (slice: number[]): number | null => {
    if (slice.length < 2) return null;
    const first = slice[0];
    if (first === 0) return null;
    return ((slice[slice.length - 1] - first) / first) * 100;
  };

  return {
    price_usd:           p.market,
    price_avg_7d:        rollingAvg(priceHistory, 7),
    price_avg_30d:       rollingAvg(priceHistory, 30),
    price_avg_90d:       rollingAvg(priceHistory, 90),
    pct_7d:              p.trend_7d_pct,
    pct_30d:             p.trend_30d_pct,
    pct_90d:             p.trend_90d_pct,
    pct_1y:              pctFromSlice(oneYearSlice.map(h => h.market)),
    pct_all:             pctFromSlice(priceHistory),
    min_1y:              min1y,
    max_1y:              max1y,
    min_all_time:        minAll,
    max_all_time:        maxAll,
    price_history:       priceHistory,
    price_history_dates: priceHistoryDates,
    graded_options:      await listGradedOptions(cardId),
    available_conditions: availableConditions,
    not_found:           false,
  };
}

// List all (variant, company, grade) options that have at least one sold
// listing for this card. Sourced from card_listings. Representative price =
// most-recent sold price per (variant, company, grade) tuple. The caller
// groups by variant for display so the user can see, e.g., Holofoil PSA 10
// separately from Reverse Holo PSA 10.
export async function listGradedOptions(cardId: string): Promise<GradedOption[]> {
  const { data } = await supabase
    .from('card_listings')
    .select('id, variant, company, grade, price, sold_at')
    .eq('card_id', cardId)
    .not('variant', 'is', null)
    .not('company', 'is', null)
    .not('grade', 'is', null)
    .order('sold_at', { ascending: false })
    .limit(500);

  if (!data || data.length === 0) return [];

  type Row = {
    id: string;
    variant: string;
    company: string;
    grade: string;
    price: number;
    sold_at: string;
  };
  const byKey = new Map<string, GradedOption>();
  for (const r of data as Row[]) {
    const key = `${r.variant}|${r.company}|${r.grade}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;              // rows are sold_at desc; market already set to latest
      continue;
    }
    byKey.set(key, {
      variant: r.variant,
      grader:  r.company,
      grade:   r.grade,
      market:  r.price,
      label:   `${r.company} ${r.grade}`,
      count:   1,
    });
  }

  // Sort: variant first (stable grouping), then PSA-first grader order, then grade desc.
  const graderOrder: Record<string, number> = { PSA: 0, CGC: 1, BGS: 2, TAG: 3, ACE: 4 };
  return Array.from(byKey.values()).sort((a, b) => {
    if (a.variant !== b.variant) return a.variant.localeCompare(b.variant);
    const orderA = graderOrder[a.grader] ?? 99;
    const orderB = graderOrder[b.grader] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return parseFloat(b.grade) - parseFloat(a.grade);
  });
}

// Build a CardPricing for a single graded tuple by aggregating the sold-listing
// time series for that (company, grade) on this card. Each sold listing is one
// data point — sparser than raw price history but real market data.
async function getGradedPricing(
  cardId: string,
  grader: string,
  grade: string,
): Promise<CardPricing> {
  const { data } = await supabase
    .from('card_listings')
    .select('price, sold_at')
    .eq('card_id', cardId)
    .eq('company', grader)
    .eq('grade', grade)
    .order('sold_at', { ascending: true });

  type Row = { price: number; sold_at: string };
  const rows = ((data ?? []) as Row[]).filter(r => r.price != null && r.sold_at);

  if (rows.length === 0) {
    return { ...NULL_PRICING, graded_options: await listGradedOptions(cardId) };
  }

  const prices = rows.map(r => r.price);
  const dates = rows.map(r => r.sold_at);

  const last = prices[prices.length - 1];
  const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
  const oneYearSlice = rows.filter(r => new Date(r.sold_at).getTime() >= oneYearAgo);

  const pctFromSlice = (slice: number[]): number | null => {
    if (slice.length < 2) return null;
    const first = slice[0];
    if (first === 0) return null;
    return ((slice[slice.length - 1] - first) / first) * 100;
  };

  const sliceByDays = (days: number): number[] => {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return rows.filter(r => new Date(r.sold_at).getTime() >= cutoff).map(r => r.price);
  };

  return {
    price_usd:           last,
    price_avg_7d:        avg(sliceByDays(7)),
    price_avg_30d:       avg(sliceByDays(30)),
    price_avg_90d:       avg(sliceByDays(90)),
    pct_7d:              pctFromSlice(sliceByDays(7)),
    pct_30d:             pctFromSlice(sliceByDays(30)),
    pct_90d:             pctFromSlice(sliceByDays(90)),
    pct_1y:              pctFromSlice(oneYearSlice.map(r => r.price)),
    pct_all:             pctFromSlice(prices),
    min_1y:              oneYearSlice.length ? Math.min(...oneYearSlice.map(r => r.price)) : null,
    max_1y:              oneYearSlice.length ? Math.max(...oneYearSlice.map(r => r.price)) : null,
    min_all_time:        Math.min(...prices),
    max_all_time:        Math.max(...prices),
    price_history:       prices,
    price_history_dates: dates,
    graded_options:      await listGradedOptions(cardId),
    available_conditions: [],
    not_found:           false,
  };
}

function avg(slice: number[]): number | null {
  if (slice.length === 0) return null;
  const sum = slice.reduce((s, v) => s + v, 0);
  return Math.round((sum / slice.length) * 100) / 100;
}

function rollingAvg(history: number[], days: number): number | null {
  const slice = history.slice(-days);
  if (slice.length === 0) return null;
  const sum = slice.reduce((s, v) => s + v, 0);
  return Math.round((sum / slice.length) * 100) / 100;
}

const RANGE_DAYS: Record<string, number> = {
  '7D':  7,
  '30D': 30,
  '90D': 90,
  '1Y':  365,
  'ALL': Infinity,
};

export function sliceHistoryForRange(history: number[], range: string): number[] {
  if (history.length < 2) return [];
  const days = RANGE_DAYS[range] ?? history.length;
  const n = days === Infinity ? history.length : Math.min(days, history.length);
  return history.slice(-n);
}

// Slice value + date series together so the scrubbable chart can show the price
// and the date it was recorded. Arrays stay index-aligned.
export function sliceSeriesForRange(
  history: number[],
  dates: string[],
  range: string,
): { values: number[]; dates: string[] } {
  if (history.length < 2) return { values: [], dates: [] };
  const days = RANGE_DAYS[range] ?? history.length;
  const n = days === Infinity ? history.length : Math.min(days, history.length);
  return { values: history.slice(-n), dates: dates.slice(-n) };
}

export function changForRange(
  pricing: CardPricing | null | undefined,
  range: string,
): { value: number | null; label: string } {
  if (!pricing) return { value: null, label: '' };
  const map: Record<string, { value: number | null; label: string }> = {
    '7D':  { value: pricing.pct_7d,  label: '7D' },
    '30D': { value: pricing.pct_30d, label: '30D' },
    '90D': { value: pricing.pct_90d, label: '90D' },
    '1Y':  { value: pricing.pct_1y,  label: '1Y' },
    'ALL': { value: pricing.pct_all, label: 'ALL' },
  };
  return map[range] ?? { value: null, label: '' };
}

export function avgForRange(
  pricing: CardPricing | null | undefined,
  range: string,
): { value: number | null; label: string } {
  if (!pricing) return { value: null, label: '' };
  const map: Record<string, { value: number | null; label: string }> = {
    '7D':  { value: pricing.price_avg_7d,  label: '7D AVG' },
    '30D': { value: pricing.price_avg_30d, label: '30D AVG' },
    '90D': { value: pricing.price_avg_90d, label: '90D AVG' },
    '1Y':  { value: null, label: '' },
    'ALL': { value: null, label: '' },
  };
  return map[range] ?? { value: null, label: '' };
}
