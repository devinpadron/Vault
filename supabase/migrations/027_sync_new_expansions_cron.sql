-- Weekly discovery of newly-released expansions.
--
-- cron-cards-refresh only re-syncs expansions ALREADY in our table, so brand-new
-- sets were never picked up automatically. This adds a kick wrapper + weekly
-- cron for the `cron-sync-new-expansions` edge phase, which lists every Scrydex
-- expansion, keeps only carried-language sets we don't have yet, and runs the
-- metadata phase for each (expansion + cards + variants + initial prices).
--
-- Requires the `edge_service_role_key` vault secret (migration 011) — same as
-- every other kick_*; without it the job errors until the secret is set.

set search_path = public, pg_temp;

-- Convenience wrapper for the weekly cron, mirroring kick_cards_refresh.
create or replace function kick_sync_new_expansions()
returns bigint
language sql
security definer
set search_path = public, pg_temp
as $$
  select kick_sync_phase(jsonb_build_object('phase', 'cron-sync-new-expansions'));
$$;

-- Mondays 05:00 UTC — after news (hourly) and clear of any ad-hoc maintenance.
-- cron.schedule upserts by job name, so re-running this migration is safe.
select cron.schedule(
  'sync-new-expansions-weekly',
  '0 5 * * 1',
  $$select kick_sync_new_expansions();$$
);
