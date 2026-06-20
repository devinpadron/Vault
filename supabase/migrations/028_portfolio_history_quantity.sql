-- 028: weight portfolio_history() by quantity.
--
-- 024 summed one representative NM price per card_id, treating every card as a
-- single copy. Now the collection tracks quantity per copy, so the chart must
-- weight each card's price by how many are held. A parallel `qtys` array (same
-- order/length as `card_ids`) carries the per-card total quantity; missing/NULL
-- weights default to 1, so the old two-arg call still works.

set search_path = public, pg_temp;

-- Drop the 024 two-arg version: adding the qtys param creates a new overload
-- rather than replacing it, leaving the no-qtys call ambiguous. One signature.
drop function if exists portfolio_history(text[], date);

create or replace function portfolio_history(
  card_ids text[],
  cutoff date default null,
  qtys integer[] default null
)
returns table (snapshot_date date, total numeric)
language sql
stable
set search_path = public, pg_temp
as $$
  with qty_map as (
    select t.card_id, coalesce(t.qty, 1) as qty
      from unnest(
             card_ids,
             coalesce(qtys, array_fill(1, array[coalesce(array_length(card_ids, 1), 0)]))
           ) as t(card_id, qty)
  ),
  chosen as (
    select distinct on (v.card_id) v.card_id, v.id as variant_id
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
  grid as (
    select d.snapshot_date, c.variant_id, c.card_id, h.market,
           count(h.market) over (partition by c.variant_id order by d.snapshot_date) as fill_grp
      from dates d
      cross join chosen c
      left join hist h
        on h.variant_id = c.variant_id and h.snapshot_date = d.snapshot_date
  ),
  filled as (
    select g.snapshot_date, g.variant_id, g.card_id,
           first_value(g.market) over (
             partition by g.variant_id, g.fill_grp order by g.snapshot_date
           ) as market
      from grid g
  )
  select f.snapshot_date,
         sum(f.market * coalesce(q.qty, 1))::numeric as total
    from filled f
    left join qty_map q on q.card_id = f.card_id
   where f.market is not null
   group by f.snapshot_date
  having sum(f.market * coalesce(q.qty, 1)) > 0
   order by f.snapshot_date;
$$;

revoke execute on function portfolio_history(text[], date, integer[]) from public, anon;
grant execute on function portfolio_history(text[], date, integer[]) to authenticated;
