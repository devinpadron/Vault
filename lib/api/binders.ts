// Binders API. Each binder is a row in `cloud_collections` with kind='binder';
// its cards live in `cloud_collection_items`. The cloud-sync engine
// (lib/db/cloud-sync.ts) handles the optimistic write + offline queue.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDb } from '@/lib/db/database';
import {
  addItemToCollection,
  createCollection,
} from '@/lib/db/cloud-sync';
import { useAuth } from '@/lib/auth/AuthContext';
import { PLACEHOLDER_CARD } from '@/lib/placeholder-card';
import { Binder, Card } from '@/types';

interface BinderRow {
  id: string;
  name: string;
  description: string | null;
  tone_start: string | null;
  tone_end: string | null;
  created_at: number;
}

function hydrateBinder(row: BinderRow, cover: Card, count: number): Binder {
  return {
    id:       row.id,
    name:     row.name,
    subtitle: row.description ?? '',
    count,
    cover,
    tone:     [row.tone_start ?? '#1F0E3A', row.tone_end ?? '#7A6BFF'],
  };
}

export function useBinders() {
  const { user } = useAuth();
  return useQuery<Binder[]>({
    queryKey: ['binders', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const db = await getDb();
      const rows = await db.getAllAsync<BinderRow>(
        `SELECT id, name, description, tone_start, tone_end, created_at
           FROM cloud_collections
          WHERE user_id = ? AND kind = 'binder'
          ORDER BY created_at DESC`,
        [user.id],
      );
      return Promise.all(rows.map(async row => {
        const coverRow = await db.getFirstAsync<{ card_json: string }>(
          `SELECT card_json FROM cloud_collection_items
            WHERE collection_id = ?
            ORDER BY position ASC LIMIT 1`,
          [row.id],
        );
        const countRow = await db.getFirstAsync<{ count: number }>(
          `SELECT COUNT(*) as count FROM cloud_collection_items WHERE collection_id = ?`,
          [row.id],
        );
        const cover = coverRow ? JSON.parse(coverRow.card_json) as Card : PLACEHOLDER_CARD;
        return hydrateBinder(row, cover, countRow?.count ?? 0);
      }));
    },
  });
}

export function useBinder(id: string) {
  const { user } = useAuth();
  return useQuery<Binder | null>({
    queryKey: ['binder', user?.id, id],
    queryFn: async () => {
      if (!user) return null;
      const db = await getDb();
      const row = await db.getFirstAsync<BinderRow>(
        `SELECT id, name, description, tone_start, tone_end, created_at
           FROM cloud_collections
          WHERE id = ? AND user_id = ? AND kind = 'binder'`,
        [id, user.id],
      );
      if (!row) return null;

      const coverRow = await db.getFirstAsync<{ card_json: string }>(
        `SELECT card_json FROM cloud_collection_items
          WHERE collection_id = ?
          ORDER BY position ASC LIMIT 1`,
        [id],
      );
      const countRow = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM cloud_collection_items WHERE collection_id = ?`,
        [id],
      );
      const cover = coverRow ? JSON.parse(coverRow.card_json) as Card : PLACEHOLDER_CARD;
      return hydrateBinder(row, cover, countRow?.count ?? 0);
    },
    enabled: !!id,
  });
}

export function useBinderCards(binderId: string) {
  return useQuery<Card[]>({
    queryKey: ['binder-cards', binderId],
    queryFn: async () => {
      const db = await getDb();
      const rows = await db.getAllAsync<{ card_json: string }>(
        `SELECT card_json FROM cloud_collection_items
          WHERE collection_id = ? ORDER BY position ASC`,
        [binderId],
      );
      return rows.map(r => JSON.parse(r.card_json) as Card);
    },
    enabled: !!binderId,
  });
}

export function useCreateBinder() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (name: string, toneStart: string, toneEnd: string): Promise<void> => {
    if (!user) throw new Error('Sign in to create binders.');
    await createCollection({
      userId:    user.id,
      kind:      'binder',
      name,
      toneStart,
      toneEnd,
    });
    queryClient.invalidateQueries({ queryKey: ['binders', user.id] });
  };
}

export function useAddCardToBinder() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (binderId: string, card: Card): Promise<void> => {
    if (!user) throw new Error('Sign in to add cards.');
    // Find current max position so the new card lands at the end.
    const db = await getDb();
    const maxRow = await db.getFirstAsync<{ max_pos: number | null }>(
      `SELECT MAX(position) as max_pos FROM cloud_collection_items WHERE collection_id = ?`,
      [binderId],
    );
    const position = (maxRow?.max_pos ?? -1) + 1;
    await addItemToCollection(binderId, card, position);
    queryClient.invalidateQueries({ queryKey: ['binder-cards', binderId] });
    queryClient.invalidateQueries({ queryKey: ['binder', user.id, binderId] });
    queryClient.invalidateQueries({ queryKey: ['binders', user.id] });
  };
}

