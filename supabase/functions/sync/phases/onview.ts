// Phase: card-on-view (lazy refresh — called when a user opens a card)
// Refreshes one card's current prices and appends any missing price-history
// snapshots. Idempotent and safe to call concurrently — the unique indexes
// on card_prices_current and card_price_history make duplicate inserts a
// no-op.
//
// Returns immediately with refreshed=false when the card's prices_synced_at
// is within the TTL and history_synced_through is today's date — i.e. nothing
// to do.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  ScrydexClient,
  ScrydexCardFull,
  ScrydexPriceHistoryEntry,
  ScrydexVariant,
} from '../scrydex.ts';
import { mapListingRow } from './listings.ts';

export interface OnViewOpts {
  cardId: string;
  force?: boolean;       // ignore TTL — always refresh
}

export interface OnViewResult {
  cardId: string;
  refreshedPrices: boolean;
  appendedHistoryDays: number;
  refreshedListings: boolean;   // graded data (card_listings) refreshed this call
  listingCount: number;         // listings upserted this call
  syncedAt: string;
  historySyncedThrough: string | null;
}

// Default fallback when no policy row exists (matches cache_refresh_policy seed).
const DEFAULT_PRICES_TTL_SECONDS   = 86_400;          // 1 day
const DEFAULT_LISTINGS_TTL_SECONDS = 86_400;          // 1 day — graded sold-listing cadence
const LISTINGS_SOLD_WINDOW_DAYS    = 90;              // days of sold history to pull per card
const FULL_HISTORY_START_DATE      = '2010-01-01';    // earliest modern TCG print

// Refresh one card. Used by both `card-on-view` and `prewarm`.
export async function refreshCardOnView(
  supabase: SupabaseClient,
  scrydex: ScrydexClient,
  opts: OnViewOpts,
): Promise<OnViewResult> {
  const { cardId, force = false } = opts;

  // ── Read freshness state ──────────────────────────────────────────────────
  const { data: card } = await supabase
    .from('cards')
    .select('id, prices_synced_at, history_synced_through, listings_synced_at')
    .eq('id', cardId)
    .maybeSingle();

  if (!card) {
    throw new Error(`Card not found: ${cardId}`);
  }

  const c = card as {
    id: string;
    prices_synced_at: string | null;
    history_synced_through: string | null;
    listings_synced_at: string | null;
  };

  const [pricesTtl, listingsTtl] = await Promise.all([
    readPricesTtl(supabase),
    readListingsTtl(supabase),
  ]);
  const now        = Date.now();
  const todayIso   = new Date().toISOString().slice(0, 10);

  const pricesAgeSec = c.prices_synced_at
    ? (now - new Date(c.prices_synced_at).getTime()) / 1000
    : Number.POSITIVE_INFINITY;
  const pricesStale = force || pricesAgeSec >= pricesTtl;

  // History is "stale" if we don't have today's snapshot yet. The append-only
  // model means we only need to fetch days strictly after history_synced_through.
  const historyStale = force || c.history_synced_through !== todayIso;

  // Graded data lives in card_listings, refreshed on its own TTL. NULL means
  // we've never fetched listings for this card.
  const listingsAgeSec = c.listings_synced_at
    ? (now - new Date(c.listings_synced_at).getTime()) / 1000
    : Number.POSITIVE_INFINITY;
  const listingsStale = force || listingsAgeSec >= listingsTtl;

  if (!pricesStale && !historyStale && !listingsStale) {
    return {
      cardId,
      refreshedPrices: false,
      appendedHistoryDays: 0,
      refreshedListings: false,
      listingCount: 0,
      syncedAt: c.prices_synced_at ?? new Date().toISOString(),
      historySyncedThrough: c.history_synced_through,
    };
  }

  // ── Look up this card's variant rows ──────────────────────────────────────
  const { data: variantRows } = await supabase
    .from('card_variants')
    .select('id, name')
    .eq('card_id', cardId);

  type VariantRow = { id: string; name: string };
  const variants = (variantRows ?? []) as VariantRow[];

  // Fast-path: card has no variants yet (metadata not synced). Skip — the
  // weekly metadata cron will pick it up.
  if (variants.length === 0) {
    return {
      cardId,
      refreshedPrices: false,
      appendedHistoryDays: 0,
      refreshedListings: false,
      listingCount: 0,
      syncedAt: c.prices_synced_at ?? new Date().toISOString(),
      historySyncedThrough: c.history_synced_through,
    };
  }

  const variantByName = new Map<string, string>(variants.map(v => [v.name, v.id]));

  // ── Refresh current prices ────────────────────────────────────────────────
  let refreshedPrices = false;
  const syncedAt = new Date().toISOString();
  if (pricesStale) {
    // One getCard call carries both current prices and population reports.
    const full = await scrydex.getCard(cardId, true, true);
    const priceRows = buildPriceRows(full, variantByName, syncedAt);
    if (priceRows.length > 0) {
      const { error: pErr } = await supabase.rpc('upsert_card_prices', { rows: priceRows });
      if (pErr) throw new Error(`upsert_card_prices: ${pErr.message}`);
    }

    // Population reports (Tier 3, append-only daily). Replace today's snapshot
    // for this card so a same-day re-view corrects counts without duplicating.
    const popRows = buildPopRows(full, cardId, todayIso);
    if (popRows.length > 0) {
      const { error: delErr } = await supabase
        .from('card_pop_reports')
        .delete()
        .eq('card_id', cardId)
        .eq('snapshot_date', todayIso);
      if (delErr) throw new Error(`clear card_pop_reports: ${delErr.message}`);

      const { error: popErr } = await supabase.from('card_pop_reports').insert(popRows);
      if (popErr) throw new Error(`insert card_pop_reports: ${popErr.message}`);
    }

    refreshedPrices = true;
  }

  // ── Append missing history days ───────────────────────────────────────────
  let appendedHistoryDays = 0;
  let newHistoryThrough = c.history_synced_through;

  if (historyStale) {
    // First time: pull the *full* history. Otherwise: only days strictly
    // newer than what we already have.
    const startDate = c.history_synced_through
      ? nextDayIso(c.history_synced_through)
      : FULL_HISTORY_START_DATE;

    const histResp = await scrydex.getCardPriceHistory(cardId, { startDate });
    const entries: ScrydexPriceHistoryEntry[] = histResp.data ?? [];

    const histRows: Record<string, unknown>[] = [];
    let latestDate: string | null = c.history_synced_through;

    for (const entry of entries) {
      if (!latestDate || entry.date > latestDate) latestDate = entry.date;
      for (const p of entry.prices) {
        if (p.type === 'graded') continue; // graded path lives in card_listings
        const variantId = variantByName.get(p.variant);
        if (!variantId) continue;
        histRows.push({
          variant_id:    variantId,
          snapshot_date: entry.date,
          type:          p.type,
          condition:     p.condition || '',
          grader:        '',
          grade:         '',
          is_perfect:    p.is_perfect,
          is_signed:     p.is_signed,
          is_error:      p.is_error,
          low:           p.low ?? null,
          market:        p.market ?? null,
          currency:      p.currency ?? 'USD',
        });
      }
    }

    if (histRows.length > 0) {
      const { error: hErr } = await supabase.rpc('upsert_card_price_history', {
        rows: histRows,
      });
      if (hErr) throw new Error(`upsert_card_price_history: ${hErr.message}`);
      appendedHistoryDays = entries.length;
    }

    // Bump the watermark even if histRows was empty — Scrydex returned no
    // snapshots after our last known date, so we *are* fully caught up
    // through today. Avoid re-fetching tomorrow.
    newHistoryThrough = latestDate ?? todayIso;
  }

  // ── Refresh graded sold listings (card_listings) ──────────────────────────
  // This is the only Scrydex endpoint that carries company + grade, so it's the
  // canonical source for the graded price matrix. Keyed by card_id (not variant),
  // deduped by listing id, so re-syncs are idempotent.
  let refreshedListings = false;
  let listingCount = 0;
  let newListingsSyncedAt = c.listings_synced_at;
  if (listingsStale) {
    const resp = await scrydex.getCardListings(cardId, {
      days: LISTINGS_SOLD_WINDOW_DAYS,
      pageSize: 100,
    });
    const listingRows = (resp.data ?? []).map(l => mapListingRow(cardId, l));
    if (listingRows.length > 0) {
      const { error: lErr } = await supabase
        .from('card_listings')
        .upsert(listingRows, { onConflict: 'id' });
      if (lErr) throw new Error(`upsert card_listings: ${lErr.message}`);
      listingCount = listingRows.length;
    }
    refreshedListings = true;
    newListingsSyncedAt = syncedAt;
  }

  // ── Bump freshness watermarks ────────────────────────────────────────────
  await supabase
    .from('cards')
    .update({
      prices_synced_at:       refreshedPrices ? syncedAt : c.prices_synced_at,
      history_synced_through: newHistoryThrough,
      listings_synced_at:     newListingsSyncedAt,
    })
    .eq('id', cardId);

  return {
    cardId,
    refreshedPrices,
    appendedHistoryDays,
    refreshedListings,
    listingCount,
    syncedAt,
    historySyncedThrough: newHistoryThrough,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function readPricesTtl(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase
    .from('cache_refresh_policy')
    .select('max_age_seconds, enabled')
    .eq('resource', 'card_prices_current')
    .maybeSingle();
  const row = data as { max_age_seconds: number; enabled: boolean } | null;
  if (!row || !row.enabled) return DEFAULT_PRICES_TTL_SECONDS;
  return row.max_age_seconds;
}

async function readListingsTtl(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase
    .from('cache_refresh_policy')
    .select('max_age_seconds, enabled')
    .eq('resource', 'card_listings')
    .maybeSingle();
  const row = data as { max_age_seconds: number; enabled: boolean } | null;
  if (!row || !row.enabled) return DEFAULT_LISTINGS_TTL_SECONDS;
  return row.max_age_seconds;
}

function nextDayIso(date: string): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Build card_prices_current rows from a single ScrydexCardFull payload.
function buildPriceRows(
  card: ScrydexCardFull,
  variantByName: Map<string, string>,
  syncedAt: string,
): Record<string, unknown>[] {
  const variants = (card.variants ?? []) as ScrydexVariant[];
  return variants.flatMap(v => {
    const variantId = variantByName.get(v.name);
    if (!variantId) return [];
    return (v.prices ?? [])
      .filter(p => p.type !== 'graded')
      .map(p => ({
        variant_id:       variantId,
        type:             p.type,
        condition:        p.condition || '',
        grader:           '',
        grade:            '',
        is_perfect:       p.is_perfect,
        is_signed:        p.is_signed,
        is_error:         p.is_error,
        low:              p.low ?? null,
        market:           p.market ?? null,
        currency:         p.currency ?? 'USD',
        trend_1d_change:  p.trends?.days_1?.price_change ?? null,
        trend_1d_pct:     p.trends?.days_1?.percent_change ?? null,
        trend_7d_change:  p.trends?.days_7?.price_change ?? null,
        trend_7d_pct:     p.trends?.days_7?.percent_change ?? null,
        trend_30d_change: p.trends?.days_30?.price_change ?? null,
        trend_30d_pct:    p.trends?.days_30?.percent_change ?? null,
        trend_90d_change: p.trends?.days_90?.price_change ?? null,
        trend_90d_pct:    p.trends?.days_90?.percent_change ?? null,
        raw_payload:      p,
        synced_at:        syncedAt,
      }));
  });
}

// Build card_pop_reports rows from a ScrydexCardFull fetched with
// include=pop_reports. One row per (variant, company, grade). population_higher
// is the cumulative count at that numeric grade or better, computed per company.
function buildPopRows(
  card: ScrydexCardFull,
  cardId: string,
  snapshotDate: string,
): Record<string, unknown>[] {
  const variants = (card.variants ?? []) as ScrydexVariant[];
  const rows: Record<string, unknown>[] = [];

  for (const v of variants) {
    for (const report of v.pop_reports ?? []) {
      // Cumulative "this grade or higher" — only meaningful for numeric grades.
      const numeric = report.grades
        .filter(g => !Number.isNaN(parseFloat(g.grade)))
        .sort((a, b) => parseFloat(b.grade) - parseFloat(a.grade));
      const higherByGrade = new Map<string, number>();
      let running = 0;
      for (const g of numeric) {
        running += g.count;
        higherByGrade.set(g.grade, running);
      }

      for (const g of report.grades) {
        rows.push({
          card_id:           cardId,
          variant_name:      v.name,
          snapshot_date:     snapshotDate,
          grader:            report.company,
          grade:             g.grade,
          population:        g.count,
          population_higher: higherByGrade.get(g.grade) ?? null,
          total_graded:      report.total ?? report.grade_total ?? null,
          raw_payload:       report,
        });
      }
    }
  }

  return rows;
}
