import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// Mirrors the card_listings row shape (migration 006). One row per sold
// listing; backfilled by seed-listings.mjs and refreshed by the daily sync
// Edge Function (phase=listings).
export interface CardListing {
  id: string;
  card_id: string;
  source: string;                  // 'ebay' | …
  title: string | null;
  url: string | null;
  variant: string | null;          // Scrydex variant key (e.g. 'holofoil')
  company: string | null;          // 'PSA' | 'CGC' | … | null when raw
  grade: string | null;            // '10' | '9.5' | … | null when raw
  is_perfect: boolean;
  is_signed: boolean;
  is_error: boolean;
  price: number;
  currency: string;
  sold_at: string | null;          // ISO date 'YYYY-MM-DD'
}

export interface ListingsFilter {
  /** When set, restrict to graded listings matching company + grade. */
  company?: string;
  grade?: string;
  /** When true, only raw (no grade) listings are returned. */
  rawOnly?: boolean;
  /** Cap the result count. Default 50. */
  limit?: number;
}

export function useCardListings(cardId: string, filter: ListingsFilter = {}) {
  const limit = filter.limit ?? 50;

  return useQuery<CardListing[]>({
    queryKey: ['card-listings', cardId, filter.company ?? '', filter.grade ?? '', filter.rawOnly ?? false, limit],
    queryFn: async () => {
      let q = supabase
        .from('card_listings')
        .select('id, card_id, source, title, url, variant, company, grade, is_perfect, is_signed, is_error, price, currency, sold_at')
        .eq('card_id', cardId)
        .order('sold_at', { ascending: false })
        .limit(limit);

      if (filter.rawOnly) {
        q = q.is('company', null);
      } else if (filter.company && filter.grade) {
        q = q.eq('company', filter.company).eq('grade', filter.grade);
      }

      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as CardListing[];
    },
    staleTime: 1000 * 60 * 60,
    enabled: !!cardId,
  });
}
