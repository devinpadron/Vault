import { useQuery } from '@tanstack/react-query';
import { MOCK_DATA } from '@/data/mock';
import { Friend, Binder } from '@/types';

export function useFriends() {
  return useQuery<Friend[]>({
    queryKey: ['friends'],
    queryFn: () => Promise.resolve(MOCK_DATA.friends),
    staleTime: Infinity,
  });
}

export function useFriend(id: string) {
  return useQuery<Friend | null>({
    queryKey: ['friend', id],
    queryFn: () => Promise.resolve(MOCK_DATA.friends.find(f => f.id === id) ?? null),
    staleTime: Infinity,
    enabled: !!id,
  });
}

export function useFriendBinders(id: string) {
  return useQuery<Binder[]>({
    queryKey: ['friend-binders', id],
    queryFn: () => Promise.resolve(MOCK_DATA.binders.slice(0, 2)),
    staleTime: Infinity,
    enabled: !!id,
  });
}
