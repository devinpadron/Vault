// Sync Edge Function
//
// Phases:
//   list-expansions  — returns all expansion IDs (for orchestrating metadata phase)
//   metadata         — upserts one expansion's cards, images, variants, initial prices
//   prices           — re-syncs card_prices_current for one page of cards
//   history          — appends daily price snapshots for one page of card variants
//
// Every invocation logs a row to sync_log. Chain calls using the returned
// nextPage / nextCardPage cursor until it is null.
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
    await supabase.from('sync_log').update({
      status,
      rows_affected:  rows ?? null,
      error_message:  err ?? null,
      finished_at:    new Date().toISOString(),
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
