import { useQuery } from '@tanstack/react-query';
import { MOCK_DATA, MOCK_DATA_ENABLED } from '@/data/mock';
import { NewsItem } from '@/types';

// News has no Scrydex source. Stays mocked behind MOCK_DATA_ENABLED until a
// real source (CMS feed, RSS, or expansion-release pseudo-news) is wired in.
export function useNews() {
  return useQuery<NewsItem[]>({
    queryKey: ['news'],
    queryFn: () => Promise.resolve(MOCK_DATA_ENABLED ? MOCK_DATA.news : []),
    staleTime: 1000 * 60 * 15,
  });
}
