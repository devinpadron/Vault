-- 023: Security & performance hardening (Supabase database-linter sweep).
--
-- Findings addressed, in order:
--   1. SECURITY DEFINER functions were executable by anon/authenticated via
--      PostgREST RPC. Migration 021 revoked per-role, but Postgres grants
--      EXECUTE on new functions to PUBLIC by default, so those revokes were
--      ineffective. Revoke PUBLIC and grant back only what each role needs.
--      Critical: edge_service_key() returns the vault service-role key — it
--      must never be callable from the client API.
--   2. my_friends ran with definer rights (the Postgres 15+ default) even
--      though migration 010's comment claimed invoker semantics; flip it so
--      RLS on friendships actually applies.
--   3. Catalog tables (cards, prices, history, …) had RLS disabled. Supabase's
--      default privileges grant write access on public tables to anon and
--      authenticated, so without RLS any holder of the anon key could write
--      card/pricing data. Enable RLS with read-only policies; the sync edge
--      function writes via service_role, which bypasses RLS.
--   4. Performance lints: auth.uid() re-evaluated per row in 17 policies
--      (wrap in a scalar subselect), overlapping permissive SELECT policies
--      (split FOR ALL "owner write" policies into insert/update/delete), and
--      four foreign keys without covering indexes.

set search_path = public, pg_temp;

-- ── 1. SECURITY DEFINER function grants ─────────────────────────────────────

revoke execute on function edge_service_key()                 from public, anon, authenticated;
revoke execute on function kick_cards_refresh()               from public, anon, authenticated;
revoke execute on function kick_news_refresh()                from public, anon, authenticated;
revoke execute on function kick_sync_phase(jsonb)             from public, anon, authenticated;
revoke execute on function upsert_card_prices(jsonb)          from public, anon, authenticated;
revoke execute on function upsert_card_price_history(jsonb)   from public, anon, authenticated;
revoke execute on function handle_new_auth_user()             from public, anon, authenticated;
revoke execute on function emit_card_added_activity()         from public, anon, authenticated;
revoke execute on function are_friends(uuid, uuid)            from public, anon;

-- The sync edge function calls the upsert RPCs with the service-role key.
grant execute on function upsert_card_prices(jsonb)        to service_role;
grant execute on function upsert_card_price_history(jsonb) to service_role;
-- are_friends is referenced by activity_events RLS, evaluated as the caller.
grant execute on function are_friends(uuid, uuid) to authenticated;

-- ── 2. my_friends: invoker semantics ────────────────────────────────────────

alter view my_friends set (security_invoker = true);

-- ── 3. RLS on catalog / service tables ──────────────────────────────────────
-- Catalog tables: world-readable, writable only by service_role (bypasses RLS)
-- and the table owner (cron-driven functions run as postgres).

alter table cards               enable row level security;
alter table card_images         enable row level security;
alter table card_variants       enable row level security;
alter table card_prices_current enable row level security;
alter table card_price_history  enable row level security;
alter table card_listings       enable row level security;
alter table card_pop_reports    enable row level security;
alter table expansions          enable row level security;

create policy "cards: public read"               on cards               for select using (true);
create policy "card_images: public read"         on card_images         for select using (true);
create policy "card_variants: public read"       on card_variants       for select using (true);
create policy "card_prices_current: public read" on card_prices_current for select using (true);
create policy "card_price_history: public read"  on card_price_history  for select using (true);
create policy "card_listings: public read"       on card_listings       for select using (true);
create policy "card_pop_reports: public read"    on card_pop_reports    for select using (true);
create policy "expansions: public read"          on expansions          for select using (true);

-- Service tables: no client access at all (no policies = deny for anon/authed).
alter table sync_log             enable row level security;
alter table cache_refresh_policy enable row level security;

-- ── 4a. Pin search_path on the remaining mutable functions ──────────────────

alter function update_updated_at_column()         set search_path = public, pg_temp;
alter function set_updated_at()                   set search_path = public, pg_temp;
alter function upsert_card_prices(jsonb)          set search_path = public, pg_temp;
alter function upsert_card_price_history(jsonb)   set search_path = public, pg_temp;
alter function slug_for_username(text)            set search_path = public, pg_temp;
alter function unique_username(text)              set search_path = public, pg_temp;
alter function edge_function_url(text)            set search_path = public, pg_temp;

-- ── 4b. FK covering indexes ──────────────────────────────────────────────────

create index if not exists card_grading_submissions_card_id_idx
  on card_grading_submissions (card_id);
create index if not exists card_sales_collection_id_idx
  on card_sales (collection_id);
create index if not exists collection_items_variant_id_idx
  on collection_items (variant_id);
create index if not exists friendships_addressee_id_idx
  on friendships (addressee_id);

-- ── 4c. auth_rls_initplan: evaluate auth.uid() once per statement ────────────
-- (select auth.uid()) is hoisted into an InitPlan instead of being re-run per
-- row. Same semantics, large win on multi-row scans like collection pulls.

alter policy "collections: owner or public read" on collections
  using (user_id = (select auth.uid()) or is_public = true);

alter policy "collection_items: visible if collection visible" on collection_items
  using (exists (
    select 1 from collections c
     where c.id = collection_items.collection_id
       and (c.user_id = (select auth.uid()) or c.is_public = true)
  ));

alter policy "friendships: participant read" on friendships
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));
alter policy "friendships: requester insert" on friendships
  with check (requester_id = (select auth.uid()));
alter policy "friendships: addressee update" on friendships
  using (addressee_id = (select auth.uid()));
alter policy "friendships: participant delete" on friendships
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));

alter policy "price_alerts: owner only" on price_alerts
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "card_sales: owner only" on card_sales
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "card_grading: owner only" on card_grading_submissions
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "device_tokens: owner all" on device_tokens
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "notifications: owner read" on notifications
  using (user_id = (select auth.uid()));
alter policy "notifications: owner update" on notifications
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "activity_events: friends read" on activity_events
  using (actor_id = (select auth.uid()) or are_friends(actor_id, (select auth.uid())));
alter policy "activity_events: actor insert" on activity_events
  with check (actor_id = (select auth.uid()));

-- ── 4d. Split FOR ALL "owner write" policies ─────────────────────────────────
-- Their implicit SELECT arm overlapped the dedicated read policies (two
-- permissive SELECT policies are OR-ed and both evaluated per row). Replace
-- with explicit insert/update/delete policies; reads stay on the single
-- dedicated policy.

drop policy "profiles: owner write" on profiles;
create policy "profiles: owner insert" on profiles
  for insert with check (id = (select auth.uid()));
create policy "profiles: owner update" on profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "profiles: owner delete" on profiles
  for delete using (id = (select auth.uid()));

drop policy "collections: owner write" on collections;
create policy "collections: owner insert" on collections
  for insert with check (user_id = (select auth.uid()));
create policy "collections: owner update" on collections
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "collections: owner delete" on collections
  for delete using (user_id = (select auth.uid()));

drop policy "collection_items: owner write" on collection_items;
create policy "collection_items: owner insert" on collection_items
  for insert with check (exists (
    select 1 from collections c
     where c.id = collection_items.collection_id and c.user_id = (select auth.uid())
  ));
create policy "collection_items: owner update" on collection_items
  for update
  using (exists (
    select 1 from collections c
     where c.id = collection_items.collection_id and c.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from collections c
     where c.id = collection_items.collection_id and c.user_id = (select auth.uid())
  ));
create policy "collection_items: owner delete" on collection_items
  for delete using (exists (
    select 1 from collections c
     where c.id = collection_items.collection_id and c.user_id = (select auth.uid())
  ));

-- Deliberately NOT done here:
--   • notifications.type CHECK constraint — the table is empty and the trade
--     notify function was removed in 022; constraining to a guessed type list
--     would just fight the next notification writer.
--   • Dropping "unused" indexes — the project is a month old; usage stats
--     aren't meaningful yet.
--   • Moving pg_trgm / btree_gin out of public — ALTER EXTENSION SET SCHEMA
--     on extensions with live index dependencies is riskier than the lint
--     it silences.
