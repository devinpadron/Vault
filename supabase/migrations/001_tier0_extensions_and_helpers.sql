-- TIER 0: Extensions, helpers, and sync infrastructure
-- Refresh cadence: permanent — these objects never need refreshing.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;    -- gen_random_uuid()
create extension if not exists pg_trgm;     -- fuzzy text search (GIN indexes on name columns)
create extension if not exists btree_gin;   -- composite GIN indexes

-- ---------------------------------------------------------------------------
-- Shared trigger function
-- Attach BEFORE UPDATE on every table that has an updated_at column.
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- sync_log
-- One row per Scrydex API call. Used to budget credits and debug sync runs.
-- Tier 0 | permanent
-- ---------------------------------------------------------------------------
create table if not exists sync_log (
  id             bigserial     primary key,
  endpoint       text          not null,                     -- e.g. /pokemon/v1/cards
  query_params   jsonb,
  status         text          not null                      -- success | error | partial
                   check (status in ('success', 'error', 'partial')),
  credits_used   integer,                                    -- from response headers if available
  rows_affected  integer,
  http_status    integer,
  error_message  text,
  started_at     timestamptz   not null default now(),
  finished_at    timestamptz
);

comment on table sync_log is
  'TIER 0 — permanent. Tracks every Scrydex API call for credit budgeting and audit.';

create index if not exists sync_log_endpoint_started_at_idx
  on sync_log (endpoint, started_at desc);

create index if not exists sync_log_status_started_at_idx
  on sync_log (status, started_at desc);

-- ---------------------------------------------------------------------------
-- cache_refresh_policy
-- Tunable staleness thresholds per resource — no redeploy needed to adjust cadence.
-- Tier 0 | permanent
-- ---------------------------------------------------------------------------
create table if not exists cache_refresh_policy (
  resource           text        primary key,
  max_age_seconds    integer     not null,
  priority           integer     not null default 0,   -- higher = sync sooner in queue
  enabled            boolean     not null default true,
  updated_at         timestamptz
);

comment on table cache_refresh_policy is
  'TIER 0 — permanent. Configures staleness thresholds for each synced resource.';
