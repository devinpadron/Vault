-- TIER 5 — app layer. Realized sales ledger.
--
-- When a user marks a card as sold (vs silently removed), we keep a row here
-- with the sale price and a snapshot of the cost basis at sale time. The card
-- row is then deleted from collection_items, so this table is the only source
-- for realized P/L over time.
--
-- Cost-basis on the collection_items table (acquired_price / acquired_at) was
-- added in migration 005 — no changes needed there.

create table if not exists card_sales (
  id                uuid          primary key default gen_random_uuid(),
  user_id           uuid          not null references auth.users (id) on delete cascade,
  collection_id     uuid          references collections (id) on delete set null,
  card_id           text          not null references cards (id),
  card_name         text          not null,
  card_set          text,
  cost_basis        numeric(12,2),
  sale_price        numeric(12,2) not null,
  currency          text          not null default 'USD',
  sold_at           timestamptz   not null default now(),
  notes             text,
  created_at        timestamptz   not null default now()
);

comment on table card_sales is
  'TIER 5 — app layer. Realized sale ledger for P/L tracking. RLS enabled.';

create index if not exists card_sales_user_id_idx
  on card_sales (user_id, sold_at desc);

create index if not exists card_sales_card_id_idx
  on card_sales (card_id);

alter table card_sales enable row level security;

create policy "card_sales: owner only"
  on card_sales for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
