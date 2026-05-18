import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDb } from './database';
import { cloudAddItem, cloudRemoveItem } from './cloud';
import { useAuth } from '@/lib/auth/AuthContext';
import { Card } from '@/types';

export function useWishlistCards() {
  return useQuery<Card[]>({
    queryKey: ['wishlist'],
    queryFn: async () => {
      const db = await getDb();
      const rows = await db.getAllAsync<{ card_json: string }>(
        'SELECT card_json FROM wishlist_cards ORDER BY added_at DESC',
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
        [cardId],
      );
      return row !== null;
    },
    enabled: !!cardId,
  });
}

export function useAddToWishlist() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (card: Card): Promise<void> => {
    const db = await getDb();
    const id = Date.now().toString(36);
    await db.runAsync(
      'INSERT OR IGNORE INTO wishlist_cards (id, card_id, card_json, added_at) VALUES (?, ?, ?, ?)',
      [id, card.id, JSON.stringify(card), Date.now()],
    );
    if (user) cloudAddItem(user.id, 'wishlist', card.id).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['wishlist'] });
    queryClient.invalidateQueries({ queryKey: ['wishlisted', card.id] });
  };
}

export function useRemoveFromWishlist() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (cardId: string): Promise<void> => {
    const db = await getDb();
    await db.runAsync('DELETE FROM wishlist_cards WHERE card_id = ?', [cardId]);
    if (user) cloudRemoveItem(user.id, 'wishlist', cardId).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['wishlist'] });
    queryClient.invalidateQueries({ queryKey: ['wishlisted', cardId] });
  };
}
