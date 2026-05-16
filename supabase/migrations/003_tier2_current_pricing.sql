-- TIER 2: Current market pricing
-- Refresh cadence: daily cron (04:00 ET) for full catalog.
-- On-read lazy refresh if synced_at older than cache_refresh_policy.max_age_seconds.
-- Hot cards (in any user collection/wishlist) refreshed hourly.

-- ---------------------------------------------------------------------------
-- card_prices_current
-- One row per (variant, type, condition/grader/grade, modifier flags).
-- Source: GET /pokemon/v1/cards?include=prices
-- Tier 2 | refresh daily (hourly for hot cards)
-- ---------------------------------------------------------------------------
create table if not exists card_prices_current (
  id               uuid        primary key default gen_random_uuid(),
  variant_id       uuid        not null references card_variants (id) on delete cascade,
  type             text        not null check (type in ('raw', 'graded')),
  condition        text,                                     -- NM | LP | MP | HP | DM; raw only
  grader           text,                                     -- PSA | CGC | BGS | TAG | ACE; graded only
  grade            text,                                     -- 10 | 9.5 | 9 | …; graded only
  is_perfect       boolean     not null default false,
  is_signed        boolean     not null default false,
  is_error         boolean     not null default false,
  low              numeric(12,2),
  market           numeric(12,2),
  mid              numeric(12,2),
  high             numeric(12,2),
  currency         text        not null default 'USD',
  trend_1d_change  numeric(12,2),                           -- trends.days_1.price_change
  trend_1d_pct     numeric(8,4),                            -- trends.days_1.percent_change
  trend_7d_change  numeric(12,2),
  trend_7d_pct     numeric(8,4),
  trend_30d_change numeric(12,2),
  trend_30d_pct    numeric(8,4),
  trend_90d_change numeric(12,2),
  trend_90d_pct    numeric(8,4),
  raw_payload      jsonb,                                    -- full original price entry for forward-compat
  synced_at        timestamptz not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table card_prices_current is
  'TIER 2 — daily (hourly for hot cards). Current market prices per variant. '
  'Upsert on the expression unique index below; never store history here.';

-- Nullable columns require coalesce in the unique expression to avoid
-- multiple NULLs bypassing the constraint.
create unique index if not exists card_prices_current_uniq
  on card_prices_current (
    variant_id,
    type,
    coalesce(condition, ''),
    coalesce(grader,    ''),
    coalesce(grade,     ''),
    is_perfect,
    is_signed,
    is_error
  );

create index if not exists card_prices_current_variant_id_idx
  on card_prices_current (variant_id);

create index if not exists card_prices_current_synced_at_idx
  on card_prices_current (synced_at);                       -- find stale rows for refresh

-- Top raw NM movers by market price.
create index if not exists card_prices_current_raw_nm_market_idx
  on card_prices_current (market desc)
  where type = 'raw' and condition = 'NM';

-- Trending raw NM cards by 7-day percent change.
create index if not exists card_prices_current_raw_nm_trend7d_idx
  on card_prices_current (trend_7d_pct desc)
  where type = 'raw' and condition = 'NM';

-- Graded lookups by grader + grade.
create index if not exists card_prices_current_grader_grade_idx
  on card_prices_current (grader, grade)
  where type = 'graded';

create or replace trigger card_prices_current_set_updated_at
  before update on card_prices_current
  for each row execute function set_updated_at();
