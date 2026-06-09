// Collection hooks. Reads come from the cloud_collection_items mirror;
// mutations enqueue ops to the offline queue, which flushes them to Supabase.
// See lib/db/cloud-sync.ts for the sync engine.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDb } from './database';
import {
  addItemToCollection,
  getOrCreateDefaultCollection,
  removeItemFromCollectionByCard,
} from './cloud-sync';
import { useAuth } from '@/lib/auth/AuthContext';
import { Card } from '@/types';
import { CollectionEntry } from '@/lib/filters/collection';

// Returns the user's main-collection items paired with their added_at
// timestamp — needed for "Recently added" / "Oldest first" sort options.
// Prefer this in the collection screen; thin wrappers below cover the
// callers that just need Card[].
export function useCollectionEntries() {
  const { user } = useAuth();
  return useQuery<CollectionEntry[]>({
    queryKey: ['collection-entries', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const db = await getDb();
      const rows = await db.getAllAsync<{ card_json: string; added_at: number }>(
        `SELECT i.card_json, i.added_at
           FROM cloud_collection_items i
           JOIN cloud_collections c ON c.id = i.collection_id
          WHERE c.user_id = ? AND c.kind = 'collection'
          ORDER BY i.added_at DESC`,
        [user.id],
      );
      return rows.map(r => ({
        card:     JSON.parse(r.card_json) as Card,
        added_at: r.added_at,
      }));
    },
  });
}

export function useCollectionCards() {
  const q = useCollectionEntries();
  return {
    ...q,
    data: (q.data ?? []).map(e => e.card),
  };
}

export function useIsInCollection(cardId: string) {
  const { user } = useAuth();
  return useQuery<boolean>({
    queryKey: ['in-collection', user?.id, cardId],
    queryFn: async () => {
      if (!user) return false;
      const db = await getDb();
      const row = await db.getFirstAsync<{ id: string }>(
        `SELECT i.id
           FROM cloud_collection_items i
           JOIN cloud_collections c ON c.id = i.collection_id
          WHERE c.user_id = ? AND c.kind = 'collection' AND i.card_id = ?`,
        [user.id, cardId],
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
    if (!user) throw new Error('Sign in to save cards.');
    const collectionId = await getOrCreateDefaultCollection(user.id, 'collection', 'Main');
    await addItemToCollection(collectionId, card);
    queryClient.invalidateQueries({ queryKey: ['collection-entries', user.id] });
    queryClient.invalidateQueries({ queryKey: ['in-collection', user.id, card.id] });
    queryClient.invalidateQueries({ queryKey: ['portfolio-history', user.id] });
  };
}

export function useRemoveFromCollection() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (cardId: string): Promise<void> => {
    if (!user) throw new Error('Sign in to manage your collection.');
    const collectionId = await getOrCreateDefaultCollection(user.id, 'collection', 'Main');
    await removeItemFromCollectionByCard(collectionId, cardId);
    queryClient.invalidateQueries({ queryKey: ['collection-entries', user.id] });
    queryClient.invalidateQueries({ queryKey: ['in-collection', user.id, cardId] });
    queryClient.invalidateQueries({ queryKey: ['portfolio-history', user.id] });
  };
}
