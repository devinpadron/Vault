-- 024: portfolio_history() — collapse the Home-chart waterfall to one RPC.
--
-- The client used to make three serial PostgREST round trips per chart render
-- (card_variants → card_prices_current → card_price_history) and forward-fill
-- in JS. This function does the same work in one round trip:
--   1. Pick one representative variant per card: the oldest variant that has
--      a current raw NM price (deterministic, matches what the chart tracked).
--   2. Pull that variant's raw NM history over the cutoff window, preferring
--      the plain copy when signed/error/perfect rows share a snapshot date.
--   3. Forward-fill each variant's last-known price across all snapshot dates
--      and sum per date.
-- Returns one row per snapshot date with the portfolio total, ascending.

set search_path = public, pg_temp;

create or replace function portfolio_history(card_ids text[], cutoff date default null)
returns table (snapshot_date date, total numeric)
language sql
stable
set search_path = public, pg_temp
as $$
  with chosen as (
    select distinct on (v.card_id) v.id as variant_id
      from card_variants v
      join card_prices_current p
        on p.variant_id = v.id and p.type = 'raw' and p.condition = 'NM'
     where v.card_id = any(card_ids)
     order by v.card_id, v.created_at, v.id
  ),
  hist as (
    select distinct on (h.variant_id, h.snapshot_date)
           h.variant_id, h.snapshot_date, h.market
      from card_price_history h
      join chosen c on c.variant_id = h.variant_id
     where h.type = 'raw' and h.condition = 'NM' and h.market is not null
       and (cutoff is null or h.snapshot_date >= cutoff)
     order by h.variant_id, h.snapshot_date, h.is_signed, h.is_error, h.is_perfect
  ),
  dates as (
    select distinct h.snapshot_date from hist h
  ),
  -- Forward-fill via window functions: fill_grp increments on every non-null
  -- observation, so all rows in a group share the value observed at its start.
  grid as (
    select d.snapshot_date, c.variant_id, h.market,
           count(h.market) over (partition by c.variant_id order by d.snapshot_date) as fill_grp
      from dates d
      cross join chosen c
      left join hist h
        on h.variant_id = c.variant_id and h.snapshot_date = d.snapshot_date
  ),
  filled as (
    select g.snapshot_date, g.variant_id,
           first_value(g.market) over (
             partition by g.variant_id, g.fill_grp order by g.snapshot_date
           ) as market
      from grid g
  )
  select f.snapshot_date, sum(f.market)::numeric as total
    from filled f
   where f.market is not null
   group by f.snapshot_date
  having sum(f.market) > 0
   order by f.snapshot_date;
$$;

-- Callable by signed-in users only (it reads world-readable catalog data, but
-- there's no reason to expose it anonymously).
revoke execute on function portfolio_history(text[], date) from public, anon;
grant execute on function portfolio_history(text[], date) to authenticated;
