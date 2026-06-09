// Wishlist hooks. Mirror of collection.ts but scoped to kind='wishlist'.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDb } from './database';
import {
  addItemToCollection,
  getOrCreateDefaultCollection,
  removeItemFromCollectionByCard,
} from './cloud-sync';
import { useAuth } from '@/lib/auth/AuthContext';
import { Card } from '@/types';

export function useWishlistCards() {
  const { user } = useAuth();
  return useQuery<Card[]>({
    queryKey: ['wishlist', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const db = await getDb();
      const rows = await db.getAllAsync<{ card_json: string }>(
        `SELECT i.card_json
           FROM cloud_collection_items i
           JOIN cloud_collections c ON c.id = i.collection_id
          WHERE c.user_id = ? AND c.kind = 'wishlist'
          ORDER BY i.added_at DESC`,
        [user.id],
      );
      return rows.map(r => JSON.parse(r.card_json) as Card);
    },
  });
}

export function useIsWishlisted(cardId: string) {
  const { user } = useAuth();
  return useQuery<boolean>({
    queryKey: ['wishlisted', user?.id, cardId],
    queryFn: async () => {
      if (!user) return false;
      const db = await getDb();
      const row = await db.getFirstAsync<{ id: string }>(
        `SELECT i.id
           FROM cloud_collection_items i
           JOIN cloud_collections c ON c.id = i.collection_id
          WHERE c.user_id = ? AND c.kind = 'wishlist' AND i.card_id = ?`,
        [user.id, cardId],
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
    if (!user) throw new Error('Sign in to use the wishlist.');
    const collectionId = await getOrCreateDefaultCollection(user.id, 'wishlist', 'Wishlist');
    await addItemToCollection(collectionId, card);
    queryClient.invalidateQueries({ queryKey: ['wishlist', user.id] });
    queryClient.invalidateQueries({ queryKey: ['wishlisted', user.id, card.id] });
  };
}

export function useRemoveFromWishlist() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (cardId: string): Promise<void> => {
    if (!user) throw new Error('Sign in to manage your wishlist.');
    const collectionId = await getOrCreateDefaultCollection(user.id, 'wishlist', 'Wishlist');
    await removeItemFromCollectionByCard(collectionId, cardId);
    queryClient.invalidateQueries({ queryKey: ['wishlist', user.id] });
    queryClient.invalidateQueries({ queryKey: ['wishlisted', user.id, cardId] });
  };
}
