-- Lazy-on-view pricing & weekly cards CRON.
--
-- Adds per-card freshness columns so the edge function can decide whether
-- a card needs a price refresh / history append on view, and registers the
-- pg_cron / pg_net extensions so the weekly cards refresh can fire from
-- inside Postgres.
--
-- After this migration runs, the operator must run:
--
--   -- 1) Stash the service-role key in vault (one-time)
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'edge_service_role_key');
--
--   -- 2) Schedule the weekly cards refresh
--   select cron.schedule(
--     'cards-refresh-weekly',
--     '0 4 * * 1',                       -- Mondays 04:00 UTC
--     $$select kick_cards_refresh();$$
--   );
--
-- Pricing data is intentionally NOT on cron — it's refreshed lazily by the
-- edge function whenever a user views a card or the app prewarms their
-- collection.

set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- Freshness columns on cards
-- ---------------------------------------------------------------------------

alter table cards
  add column if not exists prices_synced_at      timestamptz,
  add column if not exists history_synced_through date;

comment on column cards.prices_synced_at is
  'Most recent successful price refresh for this card. NULL means never fetched.';

comment on column cards.history_synced_through is
  'Latest snapshot_date present in card_price_history for any of this card''s '
  'variants. NULL means history has never been fetched — incremental fetches '
  'should pull from start_date = 2010-01-01.';

-- Backfill prices_synced_at from the existing card_prices_current data so
-- already-fetched cards don't get re-fetched on first view.
update cards c
   set prices_synced_at = sub.max_synced
  from (
    select v.card_id, max(p.synced_at) as max_synced
      from card_prices_current p
      join card_variants v on v.id = p.variant_id
     group by v.card_id
  ) sub
 where sub.card_id = c.id
   and c.prices_synced_at is null;

-- Same for history.
update cards c
   set history_synced_through = sub.max_date
  from (
    select v.card_id, max(h.snapshot_date) as max_date
      from card_price_history h
      join card_variants v on v.id = h.variant_id
     group by v.card_id
  ) sub
 where sub.card_id = c.id
   and c.history_synced_through is null;

-- Stale-card lookup: "which cards in this set are out-of-date?".
create index if not exists cards_prices_synced_at_idx
  on cards (prices_synced_at nulls first);

-- ---------------------------------------------------------------------------
-- Extensions for cron + http
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- The edge function URL is stable for the lifetime of the project — derived
-- from the project ref. We bake it into a SQL function so cron jobs (and
-- ad-hoc admin queries) don't have to repeat it.
create or replace function edge_function_url(fn text)
returns text
language sql
immutable
as $$
  select format('https://%s.supabase.co/functions/v1/%s', 'eibnjwxcmgrtvhcmyhef', fn);
$$;

-- Reads the vault secret that holds the service-role key for cron-driven
-- edge-function calls. The operator creates this secret once with:
--   select vault.create_secret('<key>', 'edge_service_role_key');
create or replace function edge_service_key()
returns text
language sql
security definer
set search_path = public, vault, pg_temp
as $$
  select decrypted_secret
    from vault.decrypted_secrets
   where name = 'edge_service_role_key'
   limit 1;
$$;

-- Fire-and-forget HTTP POST to the sync edge function. Used by cron and
-- ad-hoc admin tooling. Returns the pg_net request_id (use net._http_response
-- to look up the response if you need it).
create or replace function kick_sync_phase(payload jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  req_id bigint;
  key    text := edge_service_key();
begin
  if key is null then
    raise exception 'edge_service_role_key vault secret is not set — see migration 011 comments';
  end if;

  select net.http_post(
    url     := edge_function_url('sync'),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || key
    ),
    body    := payload
  ) into req_id;

  return req_id;
end;
$$;

-- Convenience wrapper for the weekly cron. Calls the orchestrator phase that
-- walks all expansions and refreshes any whose metadata is past its TTL.
create or replace function kick_cards_refresh()
returns bigint
language sql
security definer
set search_path = public, pg_temp
as $$
  select kick_sync_phase(jsonb_build_object('phase', 'cron-cards-refresh'));
$$;
