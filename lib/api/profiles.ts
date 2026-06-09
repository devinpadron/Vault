import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/AuthContext';

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

// Deterministic gradient from a user id — same palette used in AuthContext so
// the user's own avatar matches across screens. Kept in sync manually.
const AVATAR_PALETTE: [string, string][] = [
  ['#FFD700', '#FF7A3A'],
  ['#7A6BFF', '#5FD2FF'],
  ['#9CFF6E', '#2EA15A'],
  ['#FF7AE0', '#7B2AC9'],
  ['#5FD2FF', '#FFB8E0'],
];

export function avatarFor(id: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
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
  kind: 'collection' | 'wishlist' | 'for_trade';
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
