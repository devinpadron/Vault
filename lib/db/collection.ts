import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDb } from './database';
import { cloudAddItem, cloudRemoveItem } from './cloud';
import { useAuth } from '@/lib/auth/AuthContext';
import { Card } from '@/types';

export function useCollectionCards() {
  return useQuery<Card[]>({
    queryKey: ['collection'],
    queryFn: async () => {
      const db = await getDb();
      const rows = await db.getAllAsync<{ card_json: string }>(
        'SELECT card_json FROM collection_cards ORDER BY added_at DESC',
      );
      return rows.map(r => JSON.parse(r.card_json) as Card);
    },
  });
}

export function useIsInCollection(cardId: string) {
  return useQuery<boolean>({
    queryKey: ['in-collection', cardId],
    queryFn: async () => {
      const db = await getDb();
      const row = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM collection_cards WHERE card_id = ?',
        [cardId],
      );
      return row !== null;
    },
    enabled: !!cardId,
  });
}

export function useAddToCollection() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (card: Card): Promise<void> => {
    const db = await getDb();
    const id = Date.now().toString(36);
    await db.runAsync(
      'INSERT OR IGNORE INTO collection_cards (id, card_id, card_json, added_at) VALUES (?, ?, ?, ?)',
      [id, card.id, JSON.stringify(card), Date.now()],
    );
    // Fire-and-forget cloud mirror — failures don't block UX.
    if (user) cloudAddItem(user.id, 'collection', card.id).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['collection'] });
    queryClient.invalidateQueries({ queryKey: ['in-collection', card.id] });
  };
}

export function useRemoveFromCollection() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (cardId: string): Promise<void> => {
    const db = await getDb();
    await db.runAsync('DELETE FROM collection_cards WHERE card_id = ?', [cardId]);
    if (user) cloudRemoveItem(user.id, 'collection', cardId).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['collection'] });
    queryClient.invalidateQueries({ queryKey: ['in-collection', cardId] });
  };
}
