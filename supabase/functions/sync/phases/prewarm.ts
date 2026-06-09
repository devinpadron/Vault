// Phase: prewarm — refresh prices+history for many cards at once.
// Called by the app on sign-in / cold-launch with the user's collection +
// wishlist card ids. Reuses refreshCardOnView with bounded concurrency so we
// don't blow through the Scrydex rate limit when warming a large collection.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { ScrydexClient } from '../scrydex.ts';
import { refreshCardOnView } from './onview.ts';

export interface PrewarmOpts {
  cardIds: string[];
  concurrency?: number;
  force?: boolean;
}

export interface PrewarmResult {
  requested: number;
  refreshed: number;     // # of cards that had prices refreshed
  appended: number;      // # of cards that had history appended
  skipped: number;       // # of cards that were already fresh
  errors: number;
}

const DEFAULT_CONCURRENCY = 4;

export async function prewarmCards(
  supabase: SupabaseClient,
  scrydex: ScrydexClient,
  opts: PrewarmOpts,
): Promise<PrewarmResult> {
  const ids = Array.from(new Set(opts.cardIds)).filter(Boolean);
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? DEFAULT_CONCURRENCY, 8));

  let refreshed = 0;
  let appended  = 0;
  let skipped   = 0;
  let errors    = 0;

  // Simple worker-pool: N workers pull off a shared cursor.
  let cursor = 0;
  await Promise.all(
    Array.from({ length: concurrency }).map(async () => {
      while (cursor < ids.length) {
        const i = cursor++;
        const id = ids[i];
        try {
          const r = await refreshCardOnView(supabase, scrydex, { cardId: id, force: opts.force });
          if (r.refreshedPrices) refreshed++;
          if (r.appendedHistoryDays > 0) appended++;
          if (!r.refreshedPrices && r.appendedHistoryDays === 0) skipped++;
        } catch {
          errors++;
        }
      }
    }),
  );

  return { requested: ids.length, refreshed, appended, skipped, errors };
}
