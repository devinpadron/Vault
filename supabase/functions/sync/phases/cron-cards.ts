// Phase: cron-cards-refresh — weekly orchestrator for the static cards table.
// Invoked by pg_cron via kick_cards_refresh(). Walks every expansion and
// re-runs the metadata phase for any whose `synced_at` is older than the
// cache_refresh_policy TTL.
//
// Each expansion is fetched page-by-page until exhausted. Stays within the
// edge function wall-time budget by giving up when WALL_TIME_BUDGET_MS is
// hit — pg_cron will pick up where we left off on the next invocation (TTL
// gating in syncMetadata makes already-fresh expansions free to re-visit).

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { ScrydexClient } from '../scrydex.ts';
import { syncMetadata } from './metadata.ts';

export interface CronCardsResult {
  expansionsConsidered: number;
  expansionsSynced: number;
  cardsUpserted: number;
  hitTimeBudget: boolean;
}

// Edge functions have a ~150s wall-time ceiling; leave headroom for response.
const WALL_TIME_BUDGET_MS = 120_000;
const DEFAULT_TTL_SECONDS = 604_800; // 1 week — matches cache_refresh_policy seed

export async function cronRefreshStaleCards(
  supabase: SupabaseClient,
  scrydex: ScrydexClient,
): Promise<CronCardsResult> {
  const startedAt = Date.now();

  const ttl = await readCardsTtl(supabase);
  const cutoff = new Date(Date.now() - ttl * 1000).toISOString();

  const { data: stale, error } = await supabase
    .from('expansions')
    .select('id, synced_at')
    .or(`synced_at.is.null,synced_at.lt.${cutoff}`)
    .order('synced_at', { ascending: true, nullsFirst: true });
  if (error) throw new Error(`list stale expansions: ${error.message}`);

  const expansions = (stale ?? []) as { id: string; synced_at: string | null }[];

  let expansionsSynced = 0;
  let cardsUpserted    = 0;
  let hitTimeBudget    = false;

  for (const exp of expansions) {
    if (Date.now() - startedAt > WALL_TIME_BUDGET_MS) {
      hitTimeBudget = true;
      break;
    }

    let cardPage = 1;
    while (true) {
      if (Date.now() - startedAt > WALL_TIME_BUDGET_MS) {
        hitTimeBudget = true;
        break;
      }
      const r = await syncMetadata(supabase, scrydex, { expansionId: exp.id, cardPage });
      cardsUpserted += r.cardCount;
      if (r.nextCardPage == null) break;
      cardPage = r.nextCardPage;
    }
    expansionsSynced++;
  }

  return {
    expansionsConsidered: expansions.length,
    expansionsSynced,
    cardsUpserted,
    hitTimeBudget,
  };
}

async function readCardsTtl(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase
    .from('cache_refresh_policy')
    .select('max_age_seconds, enabled')
    .eq('resource', 'cards')
    .maybeSingle();
  const row = data as { max_age_seconds: number; enabled: boolean } | null;
  if (!row || !row.enabled) return DEFAULT_TTL_SECONDS;
  return row.max_age_seconds;
}
