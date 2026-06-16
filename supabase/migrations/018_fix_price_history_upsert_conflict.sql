-- 018: Fix upsert_card_price_history ON CONFLICT mismatch.
--
-- The function (migration 008) declared its ON CONFLICT target as
--   (variant_id, snapshot_date, type,
--    coalesce(condition,''), coalesce(grader,''), coalesce(grade,''))
-- but the unique index it relies on, card_price_history_uniq (migration 004),
-- ALSO includes is_perfect, is_signed, is_error:
--   (variant_id, snapshot_date, type,
--    coalesce(condition,''), coalesce(grader,''), coalesce(grade,''),
--    is_perfect, is_signed, is_error)
--
-- Postgres requires the ON CONFLICT inference columns to exactly match a unique
-- index, so every insert raised:
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification"
-- This broke ALL price-history appends — including the lazy card-on-view path,
-- which threw before bumping the freshness watermarks. The result: prices never
-- cached, and every card view re-fetched from Scrydex (burning credits).
--
-- Fix: add the three boolean flags to the ON CONFLICT target so it matches the
-- index. Append-only semantics are unchanged (do nothing on conflict).

set search_path = public, pg_temp;

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
      coalesce(grade,     ''),
      is_perfect, is_signed, is_error
    )
    do nothing
    returning 1
  )
  select count(*) into affected from ins;
  return affected;
end $$;

comment on function upsert_card_price_history is
  'Append-only insert into card_price_history. Duplicate (variant, date, type, '
  'condition, grader, grade, flags) rows are ignored. ON CONFLICT matches '
  'card_price_history_uniq.';
