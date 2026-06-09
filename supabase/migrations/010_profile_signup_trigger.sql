-- Auto-provision a `profiles` row whenever a new auth.users row is created.
-- Also backfills profiles for any existing users that signed up before this
-- migration. Usernames are derived from the email prefix (or display name as
-- fallback) and a numeric suffix is appended on collision.

set search_path = public, pg_temp;

-- Lower-case, alphanumeric+underscore slug derived from an arbitrary string.
-- Trims to 24 chars and prepends 'user' if empty (e.g. caller passes "...").
create or replace function slug_for_username(raw text)
returns text
language sql
immutable
as $$
  with cleaned as (
    select
      nullif(
        regexp_replace(lower(coalesce(raw, '')), '[^a-z0-9]+', '_', 'g'),
        ''
      ) as v
  )
  select coalesce(
    left(regexp_replace(v, '(^_+|_+$)', '', 'g'), 24),
    'user'
  )
  from cleaned;
$$;

-- Returns a username that is guaranteed unique in `profiles` by appending an
-- incrementing numeric suffix on collision. The unique constraint on the
-- column is still the source of truth — this just minimises retries.
create or replace function unique_username(base text)
returns text
language plpgsql
as $$
declare
  candidate text;
  suffix    int := 1;
begin
  candidate := base;
  while exists (select 1 from profiles where username = candidate) loop
    suffix := suffix + 1;
    candidate := left(base, 22) || '_' || suffix::text;
  end loop;
  return candidate;
end;
$$;

-- Trigger function: invoked after-insert on auth.users. SECURITY DEFINER so it
-- can write to public.profiles regardless of the inserting role.
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  meta         jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  full_name    text  := nullif(meta->>'full_name', '');
  display      text  := coalesce(full_name, nullif(meta->>'name', ''), split_part(new.email, '@', 1));
  base_handle  text  := slug_for_username(coalesce(nullif(meta->>'user_name', ''), split_part(new.email, '@', 1), display));
begin
  insert into profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    unique_username(base_handle),
    display,
    nullif(meta->>'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- Backfill profiles for any existing users that pre-date this migration.
insert into profiles (id, username, display_name, avatar_url)
select
  u.id,
  unique_username(
    slug_for_username(
      coalesce(
        nullif(u.raw_user_meta_data->>'user_name', ''),
        split_part(u.email, '@', 1),
        nullif(u.raw_user_meta_data->>'full_name', '')
      )
    )
  ),
  coalesce(
    nullif(u.raw_user_meta_data->>'full_name', ''),
    nullif(u.raw_user_meta_data->>'name', ''),
    split_part(u.email, '@', 1)
  ),
  nullif(u.raw_user_meta_data->>'avatar_url', '')
from auth.users u
where not exists (select 1 from profiles p where p.id = u.id);

-- Helper view: returns the *other* user_id for each accepted friendship of
-- the caller. Used by the API layer to materialise a friends list with one
-- round trip. SECURITY INVOKER so RLS on `friendships` still applies.
create or replace view my_friends as
select
  case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end as friend_id,
  f.id     as friendship_id,
  f.status,
  f.created_at,
  f.updated_at
from friendships f
where f.status = 'accepted'
  and (f.requester_id = auth.uid() or f.addressee_id = auth.uid());

comment on view my_friends is
  'TIER 5 — convenience view. Lists the *other* user in every accepted friendship of the calling user.';
