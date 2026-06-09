-- Add a position column for binder ordering. Used only when the parent
-- collection has kind='binder'; for other kinds it defaults to 0 and is
-- ignored.

alter table collection_items
  add column if not exists position integer not null default 0;

comment on column collection_items.position is
  'Ordering within the parent collection. Only meaningful when '
  'collections.kind = ''binder''; readers should ignore for other kinds.';

create index if not exists collection_items_collection_position_idx
  on collection_items (collection_id, position);
