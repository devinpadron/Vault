-- 008: Sold listings, RPC definitions, and cleanup of unused columns.
--
-- Rationale: Scrydex's `include=prices` payload doesn't carry grader/grade for
-- graded entries, and never carries `mid`/`high`. Graded data has to come from
-- /cards/{id}/listings (this migration), and `mid`/`high` were schema cruft
-- that the sync was silently nulling on every run.

-- ---------------------------------------------------------------------------
-- card_listings
-- Sold listings backfilled from /cards/{id}/listings. Append-mostly: we
-- dedupe by source listing id so re-syncs are idempotent.
-- ---------------------------------------------------------------------------
create table if not exists card_listings (
  id            text        primary key,                -- Scrydex listing id
  card_id       text        not null references cards (id) on delete cascade,
  source        text        not null,                   -- 'ebay' | …
  title         text,
  url           text,
  variant       text,                                   -- Scrydex variant key
  company       text,                                   -- 'PSA' | 'CGC' | 'BGS' | 'TAG' | 'ACE' | null
  grade         text,                                   -- '10' | '9.5' | … | null when raw
  is_perfect    boolean     not null default false,
  is_signed     boolean     not null default false,
  is_error      boolean     not null default false,
  price         numeric(12,2) not null,
  currency      text        not null default 'USD',
  sold_at       date,
  raw_payload   jsonb,
  synced_at     timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table card_listings is
  'TIER 2 — append-mostly. Sold-listing snapshots from Scrydex /cards/{id}/listings.';

create index if not exists card_listings_card_id_idx
  on card_listings (card_id);

create index if not exists card_listings_card_sold_idx
  on card_listings (card_id, sold_at desc);

create index if not exists card_listings_grade_idx
  on card_listings (card_id, company, grade)
  where company is not null and grade is not null;

create index if not exists card_listings_synced_at_idx
  on card_listings (synced_at);

create or replace trigger card_listings_set_updated_at
  before update on card_listings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- upsert_card_prices RPC
-- Bulk-upserts into card_prices_current via the expression unique index.
-- Declared with `create or replace` so applying this migration is safe even
-- if a manually-installed version already exists.
-- ---------------------------------------------------------------------------
create or replace function upsert_card_prices(rows jsonb)
returns integer
language plpgsql
security definer
as $$
declare
  affected integer;
begin
  with raw as (
    select * from jsonb_to_recordset(rows) as r(
      variant_id        uuid,
      type              text,
      condition         text,
      grader            text,
      grade             text,
      is_perfect        boolean,
      is_signed         boolean,
      is_error          boolean,
      low               numeric,
      market            numeric,
      currency          text,
      trend_1d_change   numeric,
      trend_1d_pct      numeric,
      trend_7d_change   numeric,
      trend_7d_pct      numeric,
      trend_30d_change  numeric,
      trend_30d_pct     numeric,
      trend_90d_change  numeric,
      trend_90d_pct     numeric,
      raw_payload       jsonb,
      synced_at         timestamptz
    )
  ),
  ins as (
    insert into card_prices_current (
      variant_id, type, condition, grader, grade,
      is_perfect, is_signed, is_error,
      low, market, currency,
      trend_1d_change, trend_1d_pct,
      trend_7d_change, trend_7d_pct,
      trend_30d_change, trend_30d_pct,
      trend_90d_change, trend_90d_pct,
      raw_payload, synced_at
    )
    select
      variant_id, type,
      coalesce(condition, ''), coalesce(grader, ''), coalesce(grade, ''),
      is_perfect, is_signed, is_error,
      low, market, coalesce(currency, 'USD'),
      trend_1d_change, trend_1d_pct,
      trend_7d_change, trend_7d_pct,
      trend_30d_change, trend_30d_pct,
      trend_90d_change, trend_90d_pct,
      raw_payload, synced_at
    from raw
    on conflict (
      variant_id, type,
      coalesce(condition, ''),
      coalesce(grader,    ''),
      coalesce(grade,     ''),
      is_perfect, is_signed, is_error
    )
    do update set
      low              = excluded.low,
      market           = excluded.market,
      currency         = excluded.currency,
      trend_1d_change  = excluded.trend_1d_change,
      trend_1d_pct     = excluded.trend_1d_pct,
      trend_7d_change  = excluded.trend_7d_change,
      trend_7d_pct     = excluded.trend_7d_pct,
      trend_30d_change = excluded.trend_30d_change,
      trend_30d_pct    = excluded.trend_30d_pct,
      trend_90d_change = excluded.trend_90d_change,
      trend_90d_pct    = excluded.trend_90d_pct,
      raw_payload      = excluded.raw_payload,
      synced_at        = excluded.synced_at
    returning 1
  )
  select count(*) into affected from ins;
  return affected;
end $$;

comment on function upsert_card_prices is
  'Bulk-upsert card_prices_current via expression unique index. Idempotent.';

-- ---------------------------------------------------------------------------
-- upsert_card_price_history RPC
-- Append-only insert that ignores duplicate (variant, date, type, condition,
-- grader, grade) rows.
-- ---------------------------------------------------------------------------
create or replace function upsert_card_price_history(rows jsonb)
returns integer
language plpgsql
security definer
as $$
declare
  affected integer;
begin
  with raw as (
    select * from jsonb_to_recordset(rows) as r(
      variant_id    uuid,
      snapshot_date date,
      type          text,
      condition     text,
      grader        text,
      grade         text,
      is_perfect    boolean,
      is_signed     boolean,
      is_error      boolean,
      low           numeric,
      market        numeric,
      currency      text
    )
  ),
  ins as (
    insert into card_price_history (
      variant_id, snapshot_date, type, condition, grader, grade,
      is_perfect, is_signed, is_error, low, market, currency
    )
    select
      variant_id, snapshot_date, type,
      coalesce(condition, ''), coalesce(grader, ''), coalesce(grade, ''),
      is_perfect, is_signed, is_error,
      low, market, coalesce(currency, 'USD')
    from raw
    on conflict (
      variant_id, snapshot_date, type,
      coalesce(condition, ''),
      coalesce(grader,    ''),
      coalesce(grade,     '')
    )
    do nothing
    returning 1
  )
  select count(*) into affected from ins;
  return affected;
end $$;

comment on function upsert_card_price_history is
  'Append-only insert into card_price_history. Duplicate dates are ignored.';

-- ---------------------------------------------------------------------------
-- Drop never-populated columns on card_prices_current.
-- Scrydex doesn't ship `mid` or `high` in the price include — they were
-- aspirational. Drop to keep the schema honest.
-- ---------------------------------------------------------------------------
alter table card_prices_current drop column if exists mid;
alter table card_prices_current drop column if exists high;

-- ---------------------------------------------------------------------------
-- Clean up rows the sync wrote with empty/null grader/grade for type='graded'.
-- These cannot be made useful — the price include doesn't break out grades.
-- Future graded data lands via card_listings instead.
-- ---------------------------------------------------------------------------
delete from card_prices_current
  where type = 'graded'
    and (grader is null or grader = '' or grade is null or grade = '');

delete from card_price_history
  where type = 'graded'
    and (grader is null or grader = '' or grade is null or grade = '');
