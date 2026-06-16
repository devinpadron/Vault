-- 019: Lazy refresh for graded sold listings (card_listings).
--
-- Graded prices come from card_listings, which until now was only populated by
-- the manual page-based `listings` bulk phase — never on cron and never from
-- card-on-view. So opening a card with no prior listings backfill showed an
-- empty graded matrix forever. This adds a per-card freshness watermark so the
-- card-on-view edge phase can lazily refresh listings the same way it refreshes
-- prices + history.

set search_path = public, pg_temp;

-- Per-card watermark: most recent successful card_listings refresh.
-- NULL means listings have never been fetched for this card.
alter table cards
  add column if not exists listings_synced_at timestamptz;

comment on column cards.listings_synced_at is
  'Most recent successful card_listings (graded sold-listing) refresh for this '
  'card. NULL means never fetched — card-on-view will pull on next view.';

-- Backfill from existing listings so already-loaded cards aren't re-fetched
-- on first view.
update cards c
   set listings_synced_at = sub.max_synced
  from (
    select card_id, max(synced_at) as max_synced
      from card_listings
     group by card_id
  ) sub
 where sub.card_id = c.id
   and c.listings_synced_at is null;

-- Staleness threshold for graded listings — mirrors the prices cadence (1 day).
-- Tunable at runtime without a redeploy, same as the other resources.
insert into cache_refresh_policy (resource, max_age_seconds, priority, enabled, updated_at)
values ('card_listings', 86400, 5, true, now())
on conflict (resource) do nothing;
