-- Binder customization media: photo "tiles" that occupy an arbitrary set of a
-- binder page's 3x3 cells (free-form 9-bit cell_mask), plus optional full-page
-- background images. One row per placed photo. Tiles/backgrounds are page-pinned
-- (page_num); cards flow into the cells a tile does NOT occupy.
--
-- Images live in the public-read `binder-media` storage bucket under
-- `{user_id}/...` so RLS keys writes to the owner's folder, mirroring `avatars`.

set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- binder_media table
-- ---------------------------------------------------------------------------

create table if not exists binder_media (
  id          uuid        primary key default gen_random_uuid(),
  binder_id   uuid        not null references collections (id) on delete cascade,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  page_num    integer     not null default 0,
  kind        text        not null default 'tile' check (kind in ('tile', 'background')),
  cell_mask   integer     not null default 0,   -- bits 0..8 = which of the 9 cells (tiles only)
  storage_key text        not null,             -- public URL into the binder-media bucket
  transform   jsonb,                            -- optional per-image fit/pan/zoom; null = default
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table binder_media is
  'App layer. Photo tiles / full-page backgrounds decorating a binder''s pages. RLS enabled.';

create index if not exists binder_media_binder_id_idx
  on binder_media (binder_id, page_num);

create or replace trigger binder_media_set_updated_at
  before update on binder_media
  for each row execute function set_updated_at();

-- Visible whenever the parent binder is visible (owner always; others when the
-- binder is public) — mirrors collection_items so shared binders show artwork.
alter table binder_media enable row level security;

create policy "binder_media: visible if binder visible"
  on binder_media for select
  using (
    exists (
      select 1 from collections c
      where c.id = binder_id
        and (c.user_id = auth.uid() or c.is_public = true)
    )
  );

create policy "binder_media: owner write"
  on binder_media for all
  using (
    exists (
      select 1 from collections c
      where c.id = binder_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from collections c
      where c.id = binder_id and c.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- binder-media storage bucket (public-read; owner-folder writes)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'binder-media',
  'binder-media',
  true,
  10485760, -- 10 MB (binder artwork can be larger than avatars)
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "binder_media_public_read" on storage.objects;
create policy "binder_media_public_read"
  on storage.objects for select
  using (bucket_id = 'binder-media');

drop policy if exists "binder_media_owner_insert" on storage.objects;
create policy "binder_media_owner_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'binder-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "binder_media_owner_update" on storage.objects;
create policy "binder_media_owner_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'binder-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'binder-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "binder_media_owner_delete" on storage.objects;
create policy "binder_media_owner_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'binder-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
