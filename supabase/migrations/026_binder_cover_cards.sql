-- Per-binder chosen cover cards. NULL = default (the first two cards by
-- position). When set, holds up to two card ids shown on the binder's cover.
-- Inherits collections RLS.

set search_path = public, pg_temp;

alter table collections
  add column if not exists cover_card_ids text[];

comment on column collections.cover_card_ids is
  'Up to two card ids shown on the binder cover. NULL = default to first two by position. Only meaningful when kind = binder.';
