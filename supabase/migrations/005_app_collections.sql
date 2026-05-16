-- TIER 5: App-layer — collection management, social, and price alerts
-- Not sourced from Scrydex. Powers collection tracking, friends comparison,
-- and price alerts. RLS is enabled on every table in this file.

-- ---------------------------------------------------------------------------
-- profiles
-- Public mirror of auth.users. Created automatically on user signup via trigger
-- or Edge Function; kept in sync with auth.users by cascade delete.
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id           uuid        primary key references auth.users (id) on delete cascade,
  username     text        unique not null,
  display_name text,
  avatar_url   text,
  bio          text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table profiles is
  'TIER 5 — app layer. Public profile data mirroring auth.users. RLS enabled.';

create index if not exists profiles_username_trgm_idx
  on profiles using gin (username gin_trgm_ops);            -- friend search

create or replace trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

alter table profiles enable row level security;

-- Everyone can read profiles.
create policy "profiles: public read"
  on profiles for select
  using (true);

-- Only the owner can write their own profile.
create policy "profiles: owner write"
  on profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- collections
-- Users can have multiple named collections (Main, Wishlist, For-Trade, PC, …).
-- ---------------------------------------------------------------------------
create table if not exists collections (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  name        text        not null,
  description text,
  kind        text        not null default 'collection'
                check (kind in ('collection', 'wishlist', 'for_trade')),
  is_public   boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table collections is
  'TIER 5 — app layer. Named card collections per user. RLS enabled.';

create index if not exists collections_user_id_idx
  on collections (user_id);

create or replace trigger collections_set_updated_at
  before update on collections
  for each row execute function set_updated_at();

alter table collections enable row level security;

-- Owner always sees their own collections; others only see public ones.
create policy "collections: owner or public read"
  on collections for select
  using (user_id = auth.uid() or is_public = true);

create policy "collections: owner write"
  on collections for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- collection_items
-- Individual card entries inside a collection. Visibility piggybacks on the
-- parent collection's RLS — item is visible iff the collection is.
-- ---------------------------------------------------------------------------
create table if not exists collection_items (
  id                uuid        primary key default gen_random_uuid(),
  collection_id     uuid        not null references collections (id) on delete cascade,
  card_id           text        not null references cards (id),
  variant_id        uuid        references card_variants (id),  -- null = "any printing"
  quantity          integer     not null default 1 check (quantity > 0),
  condition         text,                                        -- NM | LP | MP | HP | DM
  grader            text,
  grade             text,
  cert_number       text,                                        -- graded cert / pop report lookup
  is_signed         boolean     not null default false,
  is_error          boolean     not null default false,
  acquired_at       date,
  acquired_price    numeric(12,2),
  acquired_currency text        not null default 'USD',
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table collection_items is
  'TIER 5 — app layer. Cards inside a collection. Visibility inherits from collections RLS.';

create index if not exists collection_items_collection_id_idx
  on collection_items (collection_id);

create index if not exists collection_items_card_id_idx
  on collection_items (card_id);

create index if not exists collection_items_collection_card_idx
  on collection_items (collection_id, card_id);

create or replace trigger collection_items_set_updated_at
  before update on collection_items
  for each row execute function set_updated_at();

alter table collection_items enable row level security;

create policy "collection_items: visible if collection visible"
  on collection_items for select
  using (
    exists (
      select 1 from collections c
      where c.id = collection_id
        and (c.user_id = auth.uid() or c.is_public = true)
    )
  );

create policy "collection_items: owner write"
  on collection_items for all
  using (
    exists (
      select 1 from collections c
      where c.id = collection_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from collections c
      where c.id = collection_id and c.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- friendships
-- Bidirectional friendship with pending / accepted / blocked states.
-- ---------------------------------------------------------------------------
create table if not exists friendships (
  id           uuid        primary key default gen_random_uuid(),
  requester_id uuid        not null references auth.users (id) on delete cascade,
  addressee_id uuid        not null references auth.users (id) on delete cascade,
  status       text        not null check (status in ('pending', 'accepted', 'blocked')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

comment on table friendships is
  'TIER 5 — app layer. Friend requests and status. RLS enabled.';

create or replace trigger friendships_set_updated_at
  before update on friendships
  for each row execute function set_updated_at();

alter table friendships enable row level security;

-- Either party can see the row.
create policy "friendships: participant read"
  on friendships for select
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- Only the requester can create a friendship row.
create policy "friendships: requester insert"
  on friendships for insert
  with check (requester_id = auth.uid());

-- Only the addressee can update status (accept / block).
create policy "friendships: addressee update"
  on friendships for update
  using (addressee_id = auth.uid());

-- Either party can delete (withdraw request or unfriend).
create policy "friendships: participant delete"
  on friendships for delete
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- ---------------------------------------------------------------------------
-- price_alerts
-- Notify the owner when a variant's market price crosses a threshold.
-- ---------------------------------------------------------------------------
create table if not exists price_alerts (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users (id) on delete cascade,
  variant_id        uuid        not null references card_variants (id) on delete cascade,
  condition         text,
  grader            text,
  grade             text,
  direction         text        not null check (direction in ('above', 'below')),
  threshold         numeric(12,2) not null,
  currency          text        not null default 'USD',
  is_active         boolean     not null default true,
  last_triggered_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table price_alerts is
  'TIER 5 — app layer. User price threshold alerts per variant. RLS enabled.';

create index if not exists price_alerts_user_active_idx
  on price_alerts (user_id, is_active);

create index if not exists price_alerts_variant_active_idx
  on price_alerts (variant_id, is_active);

create or replace trigger price_alerts_set_updated_at
  before update on price_alerts
  for each row execute function set_updated_at();

alter table price_alerts enable row level security;

-- Only the owner can read or write their alerts.
create policy "price_alerts: owner only"
  on price_alerts for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
