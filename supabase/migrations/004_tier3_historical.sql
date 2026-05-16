-- TIER 3: Historical time-series — price history and pop reports
-- Refresh cadence: daily append (05:00 ET). NEVER UPDATE existing rows.
-- These tables grow into the tens of millions of rows; BRIN indexes on snapshot_date.
-- No updated_at column — append-only by design.

-- ---------------------------------------------------------------------------
-- card_price_history
-- One row per (variant, snapshot_date, type, condition/grader/grade, modifier flags).
-- Source: Scrydex price-history endpoint (mirrors Riftbound /price-history shape).
-- Tier 3 | append-only daily
-- ---------------------------------------------------------------------------
create table if not exists card_price_history (
  id            bigserial   primary key,
  variant_id    uuid        not null references card_variants (id) on delete cascade,
  snapshot_date date        not null,
  type          text        not null check (type in ('raw', 'graded')),
  condition     text,                                        -- NM | LP | MP | HP | DM; raw only
  grader        text,                                        -- PSA | CGC | BGS | TAG | ACE; graded only
  grade         text,                                        -- 10 | 9.5 | 9 | …; graded only
  is_perfect    boolean     not null default false,
  is_signed     boolean     not null default false,
  is_error      boolean     not null default false,
  low           numeric(12,2),
  market        numeric(12,2),
  currency      text        not null default 'USD',
  created_at    timestamptz not null default now()
);

comment on table card_price_history is
  'TIER 3 — append-only daily. Price snapshots per variant. Never UPDATE rows.';

-- Expression-based unique to handle nullable condition/grader/grade correctly.
create unique index if not exists card_price_history_uniq
  on card_price_history (
    variant_id,
    snapshot_date,
    type,
    coalesce(condition, ''),
    coalesce(grader,    ''),
    coalesce(grade,     ''),
    is_perfect,
    is_signed,
    is_error
  );

-- Primary chart query: variant price over time.
create index if not exists card_price_history_variant_date_idx
  on card_price_history (variant_id, snapshot_date desc);

-- BRIN is ideal for monotonically growing append-only tables.
create index if not exists card_price_history_snapshot_date_brin
  on card_price_history using brin (snapshot_date);

-- TODO: partition by month on snapshot_date once row count exceeds 50M.

-- ---------------------------------------------------------------------------
-- card_pop_reports
-- Graded population snapshots from PSA / CGC / BGS / TAG / ACE.
-- Source: Scrydex pop-report endpoint (may still be on roadmap; build now for backfill).
-- Tier 3 | append-only daily
-- ---------------------------------------------------------------------------
create table if not exists card_pop_reports (
  id                 bigserial   primary key,
  card_id            text        not null references cards (id) on delete cascade,
  variant_name       text,                                   -- null if pop is card-level, not variant-specific
  snapshot_date      date        not null,
  grader             text        not null,                   -- PSA | CGC | BGS | TAG | ACE
  grade              text        not null,                   -- 10 | 9 | Authentic | Qualifier | …
  population         integer     not null,
  population_higher  integer,                                -- cumulative count at this grade or higher
  total_graded       integer,                                -- grand total at this grader across all grades
  raw_payload        jsonb,                                  -- full original pop entry for forward-compat
  created_at         timestamptz not null default now()
);

comment on table card_pop_reports is
  'TIER 3 — append-only daily. Graded population snapshots. Never UPDATE rows. '
  'Dedicated Scrydex endpoint may still be on roadmap; table is ready for backfill.';

create unique index if not exists card_pop_reports_uniq
  on card_pop_reports (
    card_id,
    snapshot_date,
    grader,
    grade,
    coalesce(variant_name, '')
  );

create index if not exists card_pop_reports_card_date_idx
  on card_pop_reports (card_id, snapshot_date desc);

create index if not exists card_pop_reports_grader_grade_idx
  on card_pop_reports (grader, grade);

create index if not exists card_pop_reports_snapshot_date_brin
  on card_pop_reports using brin (snapshot_date);
