import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/AuthContext';
import { avatarFor } from '@/lib/avatar';
import { toneFor } from '@/lib/binder-tones';
import { PLACEHOLDER_CARD } from '@/lib/placeholder-card';
import { Profile } from './profiles';
import { Friend, Binder } from '@/types';

// All friends data is sourced from Supabase tables `profiles` and
// `friendships` (RLS-protected). The historical `Friend` shape is preserved
// for UI compatibility — fields that are not yet tracked (online presence,
// total $ value) are populated with neutral defaults.

const PROFILE_COLUMNS = 'id, username, display_name, avatar_url, bio, created_at, updated_at';

function profileToFriend(p: Profile, binderCount: number): Friend {
  return {
    id:      p.id,
    name:    p.display_name?.trim() || p.username,
    handle:  `@${p.username}`,
    avatar:  avatarFor(p.id),
    value:   0,            // not yet computed — needs price join, deferred
    binders: binderCount,
    online:  false,        // no presence system yet
    recent:  '',           // shown on profile page, not in list rows
  };
}

// ─── Friends list ─────────────────────────────────────────────────────────────

export function useFriends() {
  const { user } = useAuth();
  return useQuery<Friend[]>({
    queryKey: ['friends', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      // 1. Fetch friend ids from the `my_friends` view (RLS scopes to caller).
      const { data: rows, error } = await supabase
        .from('my_friends')
        .select('friend_id');
      if (error) throw error;
      const ids = (rows ?? []).map(r => (r as { friend_id: string }).friend_id);
      if (ids.length === 0) return [];

      // 2. Profiles in one round trip.
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .in('id', ids);
      if (pErr) throw pErr;

      // 3. Visible collections per friend (RLS hides private ones).
      const { data: collections, error: cErr } = await supabase
        .from('collections')
        .select('user_id')
        .in('user_id', ids);
      if (cErr) throw cErr;

      const countsByUser = new Map<string, number>();
      for (const row of (collections ?? []) as { user_id: string }[]) {
        countsByUser.set(row.user_id, (countsByUser.get(row.user_id) ?? 0) + 1);
      }

      return (profiles as Profile[]).map(p => profileToFriend(p, countsByUser.get(p.id) ?? 0));
    },
  });
}

// Profile-shaped friend view (id == user id, not a friendship id).
export function useFriend(id: string) {
  return useQuery<Friend | null>({
    queryKey: ['friend', id],
    enabled: !!id,
    queryFn: async () => {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!profile) return null;

      const { data: collections, error: cErr } = await supabase
        .from('collections')
        .select('id')
        .eq('user_id', id);
      if (cErr) throw cErr;
      const collectionIds = (collections ?? []).map(c => (c as { id: string }).id);

      let recent: string = '';
      if (collectionIds.length > 0) {
        const { data: recentRow } = await supabase
          .from('collection_items')
          .select('cards(name), created_at')
          .in('collection_id', collectionIds)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const join = recentRow as { cards: { name: string } | null } | null;
        recent = join?.cards?.name ?? '';
      }

      const friend = profileToFriend(profile as Profile, collectionIds.length);
      return { ...friend, recent };
    },
  });
}

// Returns the friend's *public* collections as Binder rows, with a deterministic
// gradient tone derived from the collection id (see lib/binder-tones).
// The cover card is a placeholder — adding real cover art means resolving a
// card row per collection (deferred).
export function useFriendBinders(id: string) {
  return useQuery<Binder[]>({
    queryKey: ['friend-binders', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collections')
        .select('id, name, description, collection_items(count)')
        .eq('user_id', id)
        .order('created_at', { ascending: false });
      if (error) throw error;

      type Row = {
        id: string;
        name: string;
        description: string | null;
        collection_items: { count: number }[];
      };
      return (data as Row[]).map(r => ({
        id:       r.id,
        name:     r.name,
        subtitle: r.description ?? '',
        count:    r.collection_items[0]?.count ?? 0,
        cover:    PLACEHOLDER_CARD,
        tone:     toneFor(r.id),
      }));
    },
  });
}

// ─── Friend requests ──────────────────────────────────────────────────────────

export type FriendshipStatus =
  | 'none'
  | 'pending_outgoing'
  | 'pending_incoming'
  | 'accepted'
  | 'blocked';

export function useFriendshipStatus(otherId: string | undefined | null) {
  const { user } = useAuth();
  return useQuery<FriendshipStatus>({
    queryKey: ['friendship-status', user?.id, otherId],
    enabled: !!user?.id && !!otherId && user?.id !== otherId,
    queryFn: async () => {
      const me = user!.id;
      const { data, error } = await supabase
        .from('friendships')
        .select('id, requester_id, addressee_id, status')
        .or(
          `and(requester_id.eq.${me},addressee_id.eq.${otherId}),` +
          `and(requester_id.eq.${otherId},addressee_id.eq.${me})`,
        )
        .maybeSingle();
      if (error) throw error;
      if (!data) return 'none';

      const row = data as {
        id: string;
        requester_id: string;
        addressee_id: string;
        status: 'pending' | 'accepted' | 'blocked';
      };
      if (row.status === 'accepted') return 'accepted';
      if (row.status === 'blocked')  return 'blocked';
      return row.requester_id === me ? 'pending_outgoing' : 'pending_incoming';
    },
  });
}

export interface IncomingFriendRequest {
  friendship_id: string;
  requester: Profile;
  created_at: string;
}

export function useIncomingFriendRequests() {
  const { user } = useAuth();
  return useQuery<IncomingFriendRequest[]>({
    queryKey: ['friend-requests-incoming', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      // friendships FKs point at auth.users (not profiles), so PostgREST can't
      // auto-join — two round trips, then merge.
      const { data: rows, error } = await supabase
        .from('friendships')
        .select('id, created_at, requester_id')
        .eq('addressee_id', user!.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;

      type Row = { id: string; created_at: string; requester_id: string };
      const requests = (rows ?? []) as Row[];
      if (requests.length === 0) return [];

      const requesterIds = requests.map(r => r.requester_id);
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .in('id', requesterIds);
      if (pErr) throw pErr;

      const byId = new Map<string, Profile>(
        (profiles as Profile[]).map(p => [p.id, p]),
      );
      return requests
        .filter(r => byId.has(r.requester_id))
        .map(r => ({
          friendship_id: r.id,
          requester:     byId.get(r.requester_id)!,
          created_at:    r.created_at,
        }));
    },
  });
}

function invalidateFriendQueries(qc: ReturnType<typeof useQueryClient>, otherId?: string) {
  qc.invalidateQueries({ queryKey: ['friends'] });
  qc.invalidateQueries({ queryKey: ['friend-requests-incoming'] });
  if (otherId) qc.invalidateQueries({ queryKey: ['friendship-status'] });
}

export function useSendFriendRequest() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (addresseeId: string) => {
      if (!user) throw new Error('Not signed in');
      if (addresseeId === user.id) throw new Error("You can't add yourself");
      const { error } = await supabase.from('friendships').insert({
        requester_id: user.id,
        addressee_id: addresseeId,
        status:       'pending',
      });
      if (error) throw error;
      return addresseeId;
    },
    onSuccess: addresseeId => invalidateFriendQueries(qc, addresseeId),
  });
}

export function useRespondToFriendRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { friendshipId: string; accept: boolean }) => {
      if (args.accept) {
        const { error } = await supabase
          .from('friendships')
          .update({ status: 'accepted' })
          .eq('id', args.friendshipId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('friendships')
          .delete()
          .eq('id', args.friendshipId);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidateFriendQueries(qc),
  });
}

export function useRemoveFriend() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (otherUserId: string) => {
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase
        .from('friendships')
        .delete()
        .or(
          `and(requester_id.eq.${user.id},addressee_id.eq.${otherUserId}),` +
          `and(requester_id.eq.${otherUserId},addressee_id.eq.${user.id})`,
        );
      if (error) throw error;
      return otherUserId;
    },
    onSuccess: otherId => invalidateFriendQueries(qc, otherId),
  });
}
