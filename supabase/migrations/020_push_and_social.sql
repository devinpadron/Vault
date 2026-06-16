-- TIER 5: App-layer — push notifications + social (collection diff is read-only,
-- so it needs no schema). Adds the substrate for trade proposals, the activity
-- feed, public showcase profiles, and the device-token registry + notification
-- inbox that back push delivery. RLS is enabled on every table here.

-- ---------------------------------------------------------------------------
-- are_friends(a, b)
-- SECURITY DEFINER helper so RLS policies can ask "are these two users accepted
-- friends?" without being limited by the caller's own visibility of friendships.
-- ---------------------------------------------------------------------------
create or replace function are_friends(a uuid, b uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from friendships f
     where f.status = 'accepted'
       and ((f.requester_id = a and f.addressee_id = b)
         or (f.requester_id = b and f.addressee_id = a))
  );
$$;

-- ===========================================================================
-- PHASE 0 — push substrate
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- device_tokens
-- One row per (user, device). Holds the Expo push token used by the `notify`
-- edge phase to deliver pushes. Owner-only.
-- ---------------------------------------------------------------------------
create table if not exists device_tokens (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  expo_push_token text        not null unique,
  platform        text        not null default 'ios' check (platform in ('ios', 'android')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table device_tokens is
  'TIER 5 — app layer. Expo push tokens per device. RLS enabled.';

create index if not exists device_tokens_user_id_idx on device_tokens (user_id);

create or replace trigger device_tokens_set_updated_at
  before update on device_tokens
  for each row execute function set_updated_at();

alter table device_tokens enable row level security;

create policy "device_tokens: owner all"
  on device_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- notifications
-- In-app inbox backing the bell badge. Written by the `notify` edge phase
-- (service role) alongside a push; read/updated by the owner.
-- ---------------------------------------------------------------------------
create table if not exists notifications (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  type       text        not null,        -- 'trade_proposed' | 'trade_accepted' | 'activity' | …
  title      text        not null,
  body       text,
  data       jsonb       not null default '{}'::jsonb,   -- deep-link payload (e.g. {trade_id})
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

comment on table notifications is
  'TIER 5 — app layer. Per-user in-app notification inbox. RLS enabled.';

create index if not exists notifications_user_unread_idx
  on notifications (user_id, created_at desc) where read_at is null;

alter table notifications enable row level security;

-- Owner can read and mark read; inserts come from the service role (bypasses RLS).
create policy "notifications: owner read"
  on notifications for select
  using (auth.uid() = user_id);

create policy "notifications: owner update"
  on notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ===========================================================================
-- PHASE 2 — trade proposals
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- trades
-- A structured offer between two users. cash_adjustment is signed: positive
-- means the recipient pays the proposer that amount on top of the card swap.
-- Counter-offers reference the trade they answer via parent_trade_id.
-- ---------------------------------------------------------------------------
create table if not exists trades (
  id              uuid        primary key default gen_random_uuid(),
  proposer_id     uuid        not null references auth.users (id) on delete cascade,
  recipient_id    uuid        not null references auth.users (id) on delete cascade,
  status          text        not null default 'pending'
                    check (status in ('pending', 'accepted', 'declined', 'countered', 'cancelled')),
  cash_adjustment numeric(12,2) not null default 0,
  cash_currency   text        not null default 'USD',
  message         text,
  parent_trade_id uuid        references trades (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  check (proposer_id <> recipient_id)
);

comment on table trades is
  'TIER 5 — app layer. Structured trade offers between users. RLS enabled.';

create index if not exists trades_recipient_idx on trades (recipient_id, status, created_at desc);
create index if not exists trades_proposer_idx  on trades (proposer_id, status, created_at desc);

create or replace trigger trades_set_updated_at
  before update on trades
  for each row execute function set_updated_at();

alter table trades enable row level security;

-- Both participants can read the trade.
create policy "trades: participant read"
  on trades for select
  using (proposer_id = auth.uid() or recipient_id = auth.uid());

-- Only the proposer creates the trade, and only as 'pending'.
create policy "trades: proposer insert"
  on trades for insert
  with check (proposer_id = auth.uid() and status = 'pending');

-- Recipient may accept / decline / counter a pending trade.
create policy "trades: recipient respond"
  on trades for update
  using (recipient_id = auth.uid() and status = 'pending')
  with check (recipient_id = auth.uid() and status in ('accepted', 'declined', 'countered'));

-- Proposer may cancel their own pending trade.
create policy "trades: proposer cancel"
  on trades for update
  using (proposer_id = auth.uid() and status = 'pending')
  with check (proposer_id = auth.uid() and status = 'cancelled');

-- ---------------------------------------------------------------------------
-- trade_items
-- The cards on each side of a trade. `side` says whose card it is. snapshot_value
-- freezes the card's value at proposal time so totals stay stable as prices move.
-- ---------------------------------------------------------------------------
create table if not exists trade_items (
  id             uuid        primary key default gen_random_uuid(),
  trade_id       uuid        not null references trades (id) on delete cascade,
  side           text        not null check (side in ('proposer', 'recipient')),
  card_id        text        not null references cards (id),
  variant_id     uuid        references card_variants (id),
  condition      text,
  grader         text,
  grade          text,
  snapshot_value numeric(12,2),
  quantity       integer     not null default 1 check (quantity > 0),
  created_at     timestamptz not null default now()
);

comment on table trade_items is
  'TIER 5 — app layer. Cards on each side of a trade. RLS via parent trade.';

create index if not exists trade_items_trade_idx on trade_items (trade_id);

alter table trade_items enable row level security;

-- Visible to either participant of the parent trade.
create policy "trade_items: participant read"
  on trade_items for select
  using (exists (
    select 1 from trades t
     where t.id = trade_items.trade_id
       and (t.proposer_id = auth.uid() or t.recipient_id = auth.uid())
  ));

-- Only the proposer of the parent trade can attach items (at build time).
create policy "trade_items: proposer insert"
  on trade_items for insert
  with check (exists (
    select 1 from trades t
     where t.id = trade_items.trade_id
       and t.proposer_id = auth.uid()
  ));

-- ===========================================================================
-- PHASE 3 — activity feed
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- activity_events
-- Append-only log of friend-visible events. Visible to the actor and to their
-- accepted friends (via are_friends). Produced by triggers + the trade flow.
-- ---------------------------------------------------------------------------
create table if not exists activity_events (
  id         uuid        primary key default gen_random_uuid(),
  actor_id   uuid        not null references auth.users (id) on delete cascade,
  type       text        not null
               check (type in ('card_added', 'set_milestone', 'trade_listed', 'binder_published')),
  data       jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table activity_events is
  'TIER 5 — app layer. Friend-visible activity log. RLS via are_friends.';

create index if not exists activity_events_actor_idx on activity_events (actor_id, created_at desc);
create index if not exists activity_events_recent_idx on activity_events (created_at desc);

alter table activity_events enable row level security;

-- You see your own events and those of your accepted friends.
create policy "activity_events: friends read"
  on activity_events for select
  using (actor_id = auth.uid() or are_friends(actor_id, auth.uid()));

-- Only the actor inserts their own events (triggers run as the owner).
create policy "activity_events: actor insert"
  on activity_events for insert
  with check (actor_id = auth.uid());

-- Emit a 'card_added' event when a card is added to a *public* collection of
-- kind 'collection'. Runs as the row owner, so the actor_insert policy passes.
create or replace function emit_card_added_activity()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  coll collections%rowtype;
begin
  select * into coll from collections where id = new.collection_id;
  if coll.is_public and coll.kind = 'collection' then
    insert into activity_events (actor_id, type, data)
    values (
      coll.user_id,
      'card_added',
      jsonb_build_object('card_id', new.card_id, 'collection_id', new.collection_id)
    );
  end if;
  return new;
end;
$$;

create or replace trigger collection_items_emit_activity
  after insert on collection_items
  for each row execute function emit_card_added_activity();

-- ===========================================================================
-- PHASE 4 — public showcase profile
-- ===========================================================================

-- Opt-in public showcase. profiles are already public-readable; the app only
-- surfaces showcase data when is_showcase_public is true. showcase_binder_ids
-- is an ordered list of the user's public binder collection ids to feature.
alter table profiles
  add column if not exists is_showcase_public boolean not null default false,
  add column if not exists showcase_binder_ids uuid[] not null default '{}'::uuid[];
