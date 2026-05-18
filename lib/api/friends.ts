import { useQuery } from '@tanstack/react-query';
import { MOCK_DATA, MOCK_DATA_ENABLED } from '@/data/mock';
import { Friend, Binder } from '@/types';

// Friends data is mocked until supabase/migrations/005_app_collections.sql
// (profiles + friendships tables) is wired up. See MOCK_DATA_ENABLED.
// When disabled, all hooks resolve to empty data — UI degrades to empty states.

export function useFriends() {
  return useQuery<Friend[]>({
    queryKey: ['friends'],
    queryFn: () => Promise.resolve(MOCK_DATA_ENABLED ? MOCK_DATA.friends : []),
    staleTime: Infinity,
  });
}

export function useFriend(id: string) {
  return useQuery<Friend | null>({
    queryKey: ['friend', id],
    queryFn: () =>
      Promise.resolve(
        MOCK_DATA_ENABLED ? MOCK_DATA.friends.find(f => f.id === id) ?? null : null,
      ),
    staleTime: Infinity,
    enabled: !!id,
  });
}

export function useFriendBinders(id: string) {
  return useQuery<Binder[]>({
    queryKey: ['friend-binders', id],
    queryFn: () =>
      Promise.resolve(MOCK_DATA_ENABLED ? MOCK_DATA.binders.slice(0, 2) : []),
    staleTime: Infinity,
    enabled: !!id,
  });
}
