import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDb } from './database';
import { Card } from '@/types';

export function useWishlistCards() {
  return useQuery<Card[]>({
    queryKey: ['wishlist'],
    queryFn: async () => {
      const db = await getDb();
      const rows = await db.getAllAsync<{ card_json: string }>(
        'SELECT card_json FROM wishlist_cards ORDER BY added_at DESC'
      );
      return rows.map(r => JSON.parse(r.card_json) as Card);
    },
  });
}

export function useIsWishlisted(cardId: string) {
  return useQuery<boolean>({
    queryKey: ['wishlisted', cardId],
    queryFn: async () => {
      const db = await getDb();
      const row = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM wishlist_cards WHERE card_id = ?',
        [cardId]
      );
      return row !== null;
    },
    enabled: !!cardId,
  });
}

export function useAddToWishlist() {
  const queryClient = useQueryClient();
  return async (card: Card): Promise<void> => {
    const db = await getDb();
    const id = Date.now().toString(36);
    await db.runAsync(
      'INSERT OR IGNORE INTO wishlist_cards (id, card_id, card_json, added_at) VALUES (?, ?, ?, ?)',
      [id, card.id, JSON.stringify(card), Date.now()]
    );
    queryClient.invalidateQueries({ queryKey: ['wishlist'] });
    queryClient.invalidateQueries({ queryKey: ['wishlisted', card.id] });
  };
}

export function useRemoveFromWishlist() {
  const queryClient = useQueryClient();
  return async (cardId: string): Promise<void> => {
    const db = await getDb();
    await db.runAsync('DELETE FROM wishlist_cards WHERE card_id = ?', [cardId]);
    queryClient.invalidateQueries({ queryKey: ['wishlist'] });
    queryClient.invalidateQueries({ queryKey: ['wishlisted', cardId] });
  };
}
