-- Pokemon TCG news aggregation.
-- Populated by the cron-news-refresh edge phase from 5 sources:
--   pokebeach, pokemon_official, bulbanews, reddit_tcg, tcgplayer_infinite
-- Anyone with the anon key can read; only the service role can write.

create table if not exists news_items (
  id            uuid        primary key default gen_random_uuid(),
  source        text        not null,
  external_id   text        not null,
  title         text        not null,
  summary       text,
  url           text        not null,
  image_url     text,                                  -- null → client renders the gradient fallback
  tag           text        not null,                  -- 'OFFICIAL' | 'TCG' | 'COMMUNITY' | 'MARKET'
  published_at  timestamptz not null,
  fetched_at    timestamptz not null default now(),
  raw_payload   jsonb,

  unique (source, external_id)
);

comment on table news_items is
  'Aggregated Pokemon / TCG news. One row per article per source. Populated by the cron-news-refresh edge phase.';

create index if not exists news_items_published_at_idx
  on news_items (published_at desc);

create index if not exists news_items_source_idx
  on news_items (source, published_at desc);

-- Read-anywhere, write-nowhere (the service role bypasses RLS so the edge
-- function still upserts).
alter table news_items enable row level security;

create policy "news_items: public read"
  on news_items for select
  using (true);

-- ── Cron helper ────────────────────────────────────────────────────────────
-- After applying this migration the operator schedules the news cron with:
--
--   select cron.schedule(
--     'news-refresh-hourly', '0 * * * *',
--     $$select kick_news_refresh();$$
--   );
--
-- Requires the edge_service_role_key vault secret from migration 011.

create or replace function kick_news_refresh()
returns bigint
language sql
security definer
set search_path = public, pg_temp
as $$
  select kick_sync_phase(jsonb_build_object('phase', 'cron-news-refresh'));
$$;
