import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MOCK_DATA } from '@/data/mock';
import { Binder } from '@/types';

export function useBinders() {
  return useQuery<Binder[]>({
    queryKey: ['binders'],
    queryFn: () => Promise.resolve(MOCK_DATA.binders),
    staleTime: Infinity,
  });
}

export function useBinder(id: string) {
  return useQuery<Binder | null>({
    queryKey: ['binder', id],
    queryFn: () => Promise.resolve(MOCK_DATA.binders.find(b => b.id === id) ?? null),
    staleTime: Infinity,
    enabled: !!id,
  });
}

export function useAddCardToBinder() {
  const queryClient = useQueryClient();
  return (binderId: string) => {
    queryClient.setQueryData<Binder[]>(['binders'], old =>
      old?.map(b => b.id === binderId ? { ...b, count: b.count + 1 } : b) ?? old
    );
  };
}
