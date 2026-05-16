import { supabase } from '@/lib/supabase';

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

export async function getCardPricing(cardId: string): Promise<CardPricing> {
  // Resolve variant IDs for this card
  const { data: variants, error: variantErr } = await supabase
    .from('card_variants')
    .select('id')
    .eq('card_id', cardId);

  if (variantErr || !variants || variants.length === 0) return NULL_PRICING;

  const variantIds = (variants as { id: string }[]).map(v => v.id);

  // Current prices — prefer NM raw
  const { data: prices } = await supabase
    .from('card_prices_current')
    .select('market, low, high, trend_7d_change, trend_30d_change, trend_90d_change, trend_7d_pct, trend_30d_pct, trend_90d_pct')
    .in('variant_id', variantIds)
    .eq('type', 'raw')
    .eq('condition', 'NM')
    .limit(1)
    .maybeSingle();

  if (!prices) return NULL_PRICING;

  const p = prices as {
    market: number | null;
    low: number | null;
    high: number | null;
    trend_7d_change: number | null;
    trend_30d_change: number | null;
    trend_90d_change: number | null;
    trend_7d_pct: number | null;
    trend_30d_pct: number | null;
    trend_90d_pct: number | null;
  };

  // Price history — last 90 daily NM raw snapshots
  const { data: history } = await supabase
    .from('card_price_history')
    .select('market')
    .in('variant_id', variantIds)
    .eq('type', 'raw')
    .eq('condition', 'NM')
    .order('snapshot_date', { ascending: true })
    .limit(90);

  const priceHistory = (history ?? [])
    .map((h: { market: number | null }) => h.market)
    .filter((m): m is number => m != null);

  // Derive min/max from the history window
  const min_1y    = priceHistory.length > 0 ? Math.min(...priceHistory) : null;
  const max_1y    = priceHistory.length > 0 ? Math.max(...priceHistory) : null;

  return {
    price_usd:       p.market,
    price_avg_7d:    null,
    price_avg_30d:   null,
    price_avg_90d:   null,
    price_change_7d:  p.trend_7d_change,
    price_change_30d: p.trend_30d_change,
    price_change_90d: p.trend_90d_change,
    min_1y,
    max_1y,
    min_all_time:    null,
    max_all_time:    null,
    price_history:   priceHistory,
    not_found:       false,
  };
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
