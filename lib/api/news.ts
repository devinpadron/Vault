import { useQuery } from '@tanstack/react-query';
import { MOCK_DATA } from '@/data/mock';
import { NewsItem } from '@/types';

export function useNews() {
  return useQuery<NewsItem[]>({
    queryKey: ['news'],
    queryFn: () => Promise.resolve(MOCK_DATA.news),
    staleTime: 1000 * 60 * 15,
  });
}
