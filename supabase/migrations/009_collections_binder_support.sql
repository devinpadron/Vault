-- 009: Extend collections to host binders.
--
-- Binders were previously SQLite-only (lib/db/database.ts:binders). To enable
-- cloud sync alongside collection + wishlist, we reuse the `collections` table:
--   kind='collection' → main / per-user default
--   kind='wishlist'   → wishlist
--   kind='binder'     → individual binder, with tone_start/tone_end for cover
--   kind='for_trade'  → reserved for future "for trade" surface

-- Widen the kind check.
alter table collections drop constraint if exists collections_kind_check;
alter table collections add constraint collections_kind_check
  check (kind in ('collection', 'wishlist', 'for_trade', 'binder'));

-- Cover gradient (used only when kind='binder'). Nullable for all other kinds.
alter table collections add column if not exists tone_start text;
alter table collections add column if not exists tone_end   text;

comment on column collections.tone_start is
  'Hex start of cover gradient. Only meaningful when kind=binder.';
comment on column collections.tone_end is
  'Hex end of cover gradient. Only meaningful when kind=binder.';

-- Helpful index for the most common per-user lookup: "all my binders" / "my wishlist".
create index if not exists collections_user_kind_idx
  on collections (user_id, kind);
