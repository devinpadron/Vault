-- 007: Widen the trend percentage columns on card_prices_current.
--
-- NOTE: this file was recovered from the live database on 2026-06-12 — it was
-- applied remotely (version 20260515194253) but the file was never committed.
-- Scrydex returns percent swings beyond the original numeric(8,2) bound for
-- thin markets (a card moving from $0.01 to $5 is a 49,900% change), so the
-- *_pct columns were widened to unconstrained numeric. The *_change columns
-- remain numeric(12,2). Do not re-apply by hand; it is already live.

alter table card_prices_current alter column trend_1d_pct  type numeric;
alter table card_prices_current alter column trend_7d_pct  type numeric;
alter table card_prices_current alter column trend_30d_pct type numeric;
alter table card_prices_current alter column trend_90d_pct type numeric;
