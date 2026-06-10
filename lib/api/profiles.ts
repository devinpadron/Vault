import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { File } from 'expo-file-system';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/AuthContext';
export { avatarFor } from '@/lib/avatar';

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileStats {
  binders: number;          // count of collections visible to caller
  cards: number;            // count of items across visible collections
  recent_card_name: string | null;
}

const PROFILE_COLUMNS = 'id, username, display_name, avatar_url, bio, created_at, updated_at';

// ─── Reads ────────────────────────────────────────────────────────────────────

export function useProfile(id: string | undefined | null) {
  return useQuery<Profile | null>({
    queryKey: ['profile', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return (data as Profile | null) ?? null;
    },
  });
}

export function useMyProfile() {
  const { user } = useAuth();
  return useProfile(user?.id);
}

// Stats are computed from collections visible to the current viewer (their own
// + any public collections). For a friend's profile this naturally limits to
// public data via RLS.
export function useProfileStats(id: string | undefined | null) {
  return useQuery<ProfileStats>({
    queryKey: ['profile-stats', id],
    enabled: !!id,
    queryFn: async () => {
      // Count visible collections owned by this user.
      const { data: collections, error: cErr } = await supabase
        .from('collections')
        .select('id')
        .eq('user_id', id);
      if (cErr) throw cErr;
      const collectionIds = (collections ?? []).map(c => (c as { id: string }).id);

      if (collectionIds.length === 0) {
        return { binders: 0, cards: 0, recent_card_name: null };
      }

      const { count: cardCount, error: itemsErr } = await supabase
        .from('collection_items')
        .select('id', { count: 'exact', head: true })
        .in('collection_id', collectionIds);
      if (itemsErr) throw itemsErr;

      const { data: recent, error: recentErr } = await supabase
        .from('collection_items')
        .select('cards(name), created_at')
        .in('collection_id', collectionIds)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (recentErr) throw recentErr;

      const cardJoin = recent as { cards: { name: string } | null } | null;
      return {
        binders: collectionIds.length,
        cards: cardCount ?? 0,
        recent_card_name: cardJoin?.cards?.name ?? null,
      };
    },
  });
}

// Public collections visible on someone's profile. For your own profile this
// returns *all* collections (RLS lets you see your private ones too).
export interface PublicCollection {
  id: string;
  name: string;
  description: string | null;
  kind: 'collection' | 'wishlist' | 'binder' | 'for_trade';
  is_public: boolean;
  item_count: number;
}

export function useProfileCollections(id: string | undefined | null) {
  return useQuery<PublicCollection[]>({
    queryKey: ['profile-collections', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collections')
        .select('id, name, description, kind, is_public, collection_items(count)')
        .eq('user_id', id)
        .order('created_at', { ascending: false });
      if (error) throw error;

      type Row = {
        id: string;
        name: string;
        description: string | null;
        kind: PublicCollection['kind'];
        is_public: boolean;
        collection_items: { count: number }[];
      };
      return (data as Row[]).map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        kind: r.kind,
        is_public: r.is_public,
        item_count: r.collection_items[0]?.count ?? 0,
      }));
    },
  });
}

// ─── Search ───────────────────────────────────────────────────────────────────

export function useSearchProfiles(query: string) {
  const { user } = useAuth();
  const q = query.trim().toLowerCase();
  return useQuery<Profile[]>({
    queryKey: ['profile-search', q, user?.id],
    enabled: q.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        .neq('id', user?.id ?? '')
        .limit(20);
      if (error) throw error;
      return (data as Profile[]) ?? [];
    },
    staleTime: 30_000,
  });
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export interface UpdateProfileInput {
  username?: string;
  display_name?: string | null;
  bio?: string | null;
}

export function useUpdateProfile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateProfileInput) => {
      if (!user) throw new Error('Not signed in');
      const payload: Record<string, unknown> = {};
      if (input.username !== undefined) payload.username = input.username.trim().toLowerCase();
      if (input.display_name !== undefined) payload.display_name = input.display_name?.trim() || null;
      if (input.bio !== undefined) payload.bio = input.bio?.trim() || null;
      const { data, error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', user.id)
        .select(PROFILE_COLUMNS)
        .single();
      if (error) throw error;
      return data as Profile;
    },
    onSuccess: profile => {
      qc.setQueryData(['profile', profile.id], profile);
      qc.invalidateQueries({ queryKey: ['profile-search'] });
    },
  });
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

const AVATAR_BUCKET = 'avatars';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
};

// Storage object path for a public avatar URL, or null when the URL doesn't
// point into our bucket (e.g. an OAuth-provider picture).
function avatarStoragePath(url: string | null): string | null {
  if (!url) return null;
  const marker = `/object/public/${AVATAR_BUCKET}/`;
  const idx = url.indexOf(marker);
  return idx === -1 ? null : decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
}

export interface SetAvatarInput {
  uri: string;
  mimeType?: string;
}

/**
 * Uploads a locally-picked image as the user's profile picture, or clears it
 * when called with `null`. Each upload gets a unique filename so the public
 * CDN URL changes (no stale-cache issue); the previous object is deleted
 * best-effort afterwards.
 */
export function useSetAvatar() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SetAvatarInput | null) => {
      if (!user) throw new Error('Not signed in');

      const previous = qc.getQueryData<Profile | null>(['profile', user.id]);
      const oldPath = avatarStoragePath(previous?.avatar_url ?? null);

      let avatarUrl: string | null = null;
      if (input) {
        const contentType = input.mimeType ?? 'image/jpeg';
        const ext = EXT_BY_MIME[contentType] ?? 'jpg';
        const path = `${user.id}/${Date.now()}.${ext}`;
        const bytes = await new File(input.uri).bytes();
        const { error: uploadErr } = await supabase.storage
          .from(AVATAR_BUCKET)
          .upload(path, bytes, { contentType });
        if (uploadErr) throw uploadErr;
        avatarUrl = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
      }

      const { data, error } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', user.id)
        .select(PROFILE_COLUMNS)
        .single();
      if (error) throw error;

      if (oldPath) {
        supabase.storage.from(AVATAR_BUCKET).remove([oldPath]).then(({ error: rmErr }) => {
          if (rmErr && __DEV__) console.warn('[avatar] old object cleanup failed:', rmErr);
        });
      }
      return data as Profile;
    },
    onSuccess: profile => {
      qc.setQueryData(['profile', profile.id], profile);
      qc.invalidateQueries({ queryKey: ['profile-search'] });
      // Friends-side caches embed avatar_url via profileToFriend.
      qc.invalidateQueries({ queryKey: ['friends'] });
    },
  });
}
