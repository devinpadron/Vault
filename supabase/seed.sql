-- Seed: cache_refresh_policy defaults
-- max_age_seconds: staleness threshold before a sync worker re-pulls from Scrydex.

insert into cache_refresh_policy (resource, max_age_seconds, priority, enabled)
values
  ('expansions',          604800, 10, true),   -- 1 week
  ('cards',               604800, 10, true),   -- 1 week
  ('card_variants',       604800, 10, true),   -- 1 week
  ('card_prices_current',  86400, 20, true),   -- 1 day
  ('card_price_history',   86400,  5, true),   -- 1 day, append-only
  ('card_pop_reports',     86400,  5, true)    -- 1 day, append-only
on conflict (resource) do update
  set max_age_seconds = excluded.max_age_seconds,
      priority        = excluded.priority,
      enabled         = excluded.enabled,
      updated_at      = now();
