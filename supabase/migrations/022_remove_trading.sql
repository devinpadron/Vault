-- 022: Remove the trading feature entirely.
--
-- Product decision: cards are held physically, so the app only shows who owns
-- what — there is no in-app trading. This drops the structured-trade substrate
-- added in migration 020 and narrows the enum-like CHECK constraints that
-- referenced trade concepts.
--
-- Kept on purpose: device_tokens, notifications, activity_events (minus the
-- trade event type) — that push/notification infrastructure stays for friend
-- requests and future use. The trade-only `notify` edge function is removed
-- separately (it is deleted from the deployment, not via SQL).

-- ── Trade tables ───────────────────────────────────────────────────────────
-- trade_items has an FK to trades; drop it first (CASCADE covers it regardless).
drop table if exists trade_items cascade;
drop table if exists trades      cascade;

-- ── activity_events: drop the 'trade_listed' event type ────────────────────
-- Remove any existing trade activity rows, then narrow the CHECK so the type
-- can no longer be inserted.
delete from activity_events where type = 'trade_listed';

alter table activity_events drop constraint if exists activity_events_type_check;
alter table activity_events add constraint activity_events_type_check
  check (type in ('card_added', 'set_milestone', 'binder_published'));

-- ── notifications: clear trade-event rows ──────────────────────────────────
-- `type` is free-text (no CHECK), but these rows deep-link to trades that no
-- longer exist, so remove them. Future notifications are unaffected.
delete from notifications where type like 'trade_%';

-- ── collections: drop the unused 'for_trade' kind ──────────────────────────
-- No UI ever surfaced it; remove any stray rows (cascades to their items) and
-- narrow the kind CHECK.
delete from collections where kind = 'for_trade';

alter table collections drop constraint if exists collections_kind_check;
alter table collections add constraint collections_kind_check
  check (kind in ('collection', 'wishlist', 'binder'));
