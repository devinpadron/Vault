// Sync Edge Function
//
// Phases:
//   list-expansions      — returns all expansion IDs (for orchestrating metadata phase)
//   metadata             — upserts one expansion's cards, images, variants, initial prices
//   prices               — re-syncs card_prices_current for one page of cards
//   history              — appends daily price snapshots for one page of card variants
//   listings             — backfills card_listings from /cards/{id}/listings
//   card-on-view         — lazy refresh: prices + history append for ONE card
//   prewarm              — same as card-on-view, fanned out over many card ids
//   cron-cards-refresh   — weekly orchestrator: re-syncs every stale expansion
//   cron-news-refresh    — hourly: pulls all 5 news feeds, upserts news_items
//
// Every invocation logs a row to sync_log. Chain page-based phases by
// incrementing nextPage / nextCardPage until null.
//
// Environment variables (set via `supabase secrets set`):
//   SCRYDEX_API_KEY      — Scrydex X-Api-Key
//   SCRYDEX_TEAM_ID      — Scrydex X-Team-ID
//   SUPABASE_URL         — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected

import { createClient } from 'npm:@supabase/supabase-js@2';
import { ScrydexClient } from './scrydex.ts';
import { syncMetadata, listExpansionIds } from './phases/metadata.ts';
import { syncPrices } from './phases/prices.ts';
import { syncHistory } from './phases/history.ts';
import { syncListings } from './phases/listings.ts';
import { refreshCardOnView } from './phases/onview.ts';
import { prewarmCards } from './phases/prewarm.ts';
import { cronRefreshStaleCards } from './phases/cron-cards.ts';
import { refreshNews } from './phases/news.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  const apiKey  = Deno.env.get('SCRYDEX_API_KEY')  ?? '';
  const teamId  = Deno.env.get('SCRYDEX_TEAM_ID')  ?? '';
  const sbUrl   = Deno.env.get('SUPABASE_URL')      ?? '';
  const sbKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!apiKey || !teamId) {
    return json({ error: 'SCRYDEX_API_KEY and SCRYDEX_TEAM_ID must be set' }, 500);
  }

  const scrydex = new ScrydexClient(apiKey, teamId);
  const supabase = createClient(sbUrl, sbKey);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const phase = body.phase as string;
  if (!phase) return json({ error: 'Missing required field: phase' }, 400);

  // ── Start sync_log row ───────────────────────────────────────────────────
  const { data: logRow } = await supabase
    .from('sync_log')
    .insert({
      endpoint:    `/sync/${phase}`,
      query_params: body,
      status:      'partial',
      started_at:  new Date().toISOString(),
    })
    .select('id')
    .single();

  const logId: number | null = (logRow as { id: number } | null)?.id ?? null;

  const finishLog = async (status: 'success' | 'error', rows?: number, err?: string) => {
    if (!logId) return;
    // Pull the last response metadata captured by ScrydexClient — gives us
    // HTTP status and credits-used for observability and rate-limit budgeting.
    const meta = scrydex.lastMeta;
    await supabase.from('sync_log').update({
      status,
      rows_affected: rows ?? null,
      error_message: err ?? null,
      http_status:   meta.http_status,
      credits_used:  meta.credits_used,
      finished_at:   new Date().toISOString(),
    }).eq('id', logId);
  };

  // ── Route to phase ────────────────────────────────────────────────────────
  try {
    // deno-lint-ignore no-explicit-any
    let result: any;

    if (phase === 'list-expansions') {
      const page     = Number(body.page     ?? 1);
      const pageSize = Number(body.pageSize ?? 100);
      result = await listExpansionIds(scrydex, page, pageSize);
      await finishLog('success', (result.ids as string[]).length);

    } else if (phase === 'metadata') {
      if (!body.expansionId) return json({ error: 'metadata phase requires expansionId' }, 400);
      result = await syncMetadata(supabase, scrydex, {
        expansionId: body.expansionId as string,
        cardPage:    Number(body.cardPage    ?? 1),
        cardPageSize: Number(body.cardPageSize ?? 100),
        force:       Boolean(body.force ?? false),
      });
      await finishLog('success', (result as { cardCount: number }).cardCount);

    } else if (phase === 'prices') {
      result = await syncPrices(supabase, scrydex, {
        page:     Number(body.page     ?? 1),
        pageSize: Number(body.pageSize ?? 100),
        force:    Boolean(body.force   ?? false),
      });
      await finishLog('success', (result as { priceCount: number }).priceCount);

    } else if (phase === 'history') {
      result = await syncHistory(supabase, scrydex, {
        page:     Number(body.page     ?? 1),
        pageSize: Number(body.pageSize ?? 50),
        days:     Number(body.days     ?? 2),
      });
      await finishLog('success', (result as { snapshotCount: number }).snapshotCount);

    } else if (phase === 'listings') {
      result = await syncListings(supabase, scrydex, {
        page:     Number(body.page     ?? 1),
        pageSize: Number(body.pageSize ?? 25),
        days:     Number(body.days     ?? 90),
      });
      await finishLog('success', (result as { listingCount: number }).listingCount);

    } else if (phase === 'card-on-view') {
      if (!body.cardId) return json({ error: 'card-on-view requires cardId' }, 400);
      result = await refreshCardOnView(supabase, scrydex, {
        cardId: body.cardId as string,
        force:  Boolean(body.force ?? false),
      });
      const r = result as { refreshedPrices: boolean; appendedHistoryDays: number; listingCount: number };
      await finishLog('success', (r.refreshedPrices ? 1 : 0) + r.appendedHistoryDays + r.listingCount);

    } else if (phase === 'prewarm') {
      if (!Array.isArray(body.cardIds)) {
        return json({ error: 'prewarm requires cardIds array' }, 400);
      }
      result = await prewarmCards(supabase, scrydex, {
        cardIds:     body.cardIds as string[],
        concurrency: Number(body.concurrency ?? 4),
        force:       Boolean(body.force ?? false),
      });
      await finishLog('success', (result as { refreshed: number }).refreshed);

    } else if (phase === 'cron-cards-refresh') {
      result = await cronRefreshStaleCards(supabase, scrydex);
      await finishLog('success', (result as { cardsUpserted: number }).cardsUpserted);

    } else if (phase === 'cron-news-refresh') {
      result = await refreshNews(supabase);
      await finishLog('success', (result as { totalInserted: number }).totalInserted);

    } else {
      return json({ error: `Unknown phase: ${phase}` }, 400);
    }

    return json({ status: 'ok', phase, sync_log_id: logId, ...result });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finishLog('error', undefined, msg);
    return json({ status: 'error', phase, error: msg }, 500);
  }
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
