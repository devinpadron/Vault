// Phase: cron-sync-new-expansions — weekly discovery of newly-released sets.
//
// Lists every expansion from Scrydex, keeps only those whose language we already
// carry AND that aren't yet in our `expansions` table, then runs the metadata
// phase (all card pages) for each — inserting the expansion, its cards, variants,
// and initial prices. This is the ONLY path that picks up brand-new sets:
// cron-cards-refresh only re-syncs expansions already known locally.
//
// Cheap in a normal week (≈5 list calls, zero new sets). Honors a wall-time
// budget so a backlog of new sets spills into the next run instead of being
// hard-killed by the edge runtime mid-write.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { ScrydexClient } from '../scrydex.ts';
import { syncMetadata } from './metadata.ts';

export interface CronNewExpansionsResult {
  scrydexExpansions: number;   // total expansions Scrydex reports
  newExpansions: string[];     // ids actually synced this run
  cardsUpserted: number;
  hitTimeBudget: boolean;      // true if we stopped early (more remain for next run)
}

// Edge functions are hard-killed ~150s; stop at 120s to flush + respond cleanly.
const WALL_TIME_BUDGET_MS = 120_000;
const LIST_PAGE_SIZE = 100;

export async function cronSyncNewExpansions(
  supabase: SupabaseClient,
  scrydex: ScrydexClient,
): Promise<CronNewExpansionsResult> {
  const startedAt = Date.now();

  // 1. Languages we carry — derived from existing data, not hardcoded, so the
  //    policy follows whatever the catalog already holds. Empty DB → English.
  const { data: langRows } = await supabase.from('expansions').select('language_code');
  const carried = new Set(
    ((langRows ?? []) as { language_code: string | null }[])
      .map(r => (r.language_code ?? '').toLowerCase())
      .filter(Boolean),
  );
  if (carried.size === 0) carried.add('en');

  // 2. Ids we already have, so we only sync genuinely new sets.
  const { data: existingRows } = await supabase.from('expansions').select('id');
  const existing = new Set(((existingRows ?? []) as { id: string }[]).map(r => r.id));

  // 3. Walk every Scrydex expansion page; collect new ids in a carried language.
  const newIds: string[] = [];
  let scrydexExpansions = 0;
  let page = 1;
  while (true) {
    const resp = await scrydex.listExpansions(page, LIST_PAGE_SIZE);
    scrydexExpansions += resp.data.length;
    for (const e of resp.data) {
      if (existing.has(e.id)) continue;
      if (!carried.has((e.language_code ?? '').toLowerCase())) continue;
      newIds.push(e.id);
    }
    const totalPages = Math.ceil(resp.total_count / LIST_PAGE_SIZE);
    if (page >= totalPages || resp.data.length === 0) break;
    page++;
  }

  // 4. Fully sync each new expansion (all card pages) within the time budget.
  //    force:true bypasses the per-expansion TTL gate so pages 2..n aren't
  //    skipped after page 1 stamps synced_at.
  const synced: string[] = [];
  let cardsUpserted = 0;
  let hitTimeBudget = false;
  for (const expansionId of newIds) {
    if (Date.now() - startedAt > WALL_TIME_BUDGET_MS) { hitTimeBudget = true; break; }
    let cardPage = 1;
    while (true) {
      if (Date.now() - startedAt > WALL_TIME_BUDGET_MS) { hitTimeBudget = true; break; }
      const r = await syncMetadata(supabase, scrydex, { expansionId, cardPage, force: true });
      cardsUpserted += r.cardCount;
      if (r.nextCardPage == null) break;
      cardPage = r.nextCardPage;
    }
    synced.push(expansionId);
  }

  return { scrydexExpansions, newExpansions: synced, cardsUpserted, hitTimeBudget };
}
