-- 006: Bulk-upsert RPCs used by the sync edge function.
--
-- NOTE: this file was recovered from the live database on 2026-06-12 — it was
-- applied remotely (version 20260515190521) but the file was never committed.
-- Definitions below reflect the live functions verbatim (including the
-- search_path pin later added by migration 023). Do not re-apply by hand;
-- it is already live.
--
-- Both functions are SECURITY DEFINER so the edge function can write the
-- catalog tables through a single RPC round trip per batch. EXECUTE is
-- restricted to service_role (see 023).

create or replace function public.upsert_card_prices(rows jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
end $function$;

create or replace function public.upsert_card_price_history(rows jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
      coalesce(grade,     ''),
      is_perfect, is_signed, is_error
    )
    do nothing
    returning 1
  )
  select count(*) into affected from ins;
  return affected;
end $function$;
