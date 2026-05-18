import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDb } from '../db/database';
import { Binder, Card } from '@/types';

const PLACEHOLDER_CARD: Card = {
  id: 'placeholder',
  name: 'Empty Binder',
  variant: '—',
  set: 'POKEVAULT',
  no: '—',
  release: '—',
  rarity: 'Common',
  value: 0,
  change: 0,
  trend30d: null,
  foil: false,
  art: ['#1F0E3A', '#2D1B5E', '#1F0E3A'],
  creature: '○',
  types: ['dark'],
  artist: '—',
};

interface BinderRow {
  id: string;
  name: string;
  subtitle: string;
  tone_start: string;
  tone_end: string;
  created_at: number;
}

export function useBinders() {
  return useQuery<Binder[]>({
    queryKey: ['binders'],
    queryFn: async () => {
      const db = await getDb();
      const rows = await db.getAllAsync<BinderRow>(
        'SELECT * FROM binders ORDER BY created_at DESC'
      );
      const binders = await Promise.all(rows.map(async row => {
        const coverRow = await db.getFirstAsync<{ card_json: string }>(
          'SELECT card_json FROM binder_cards WHERE binder_id = ? AND position = 0',
          [row.id]
        );
        const countRow = await db.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM binder_cards WHERE binder_id = ?',
          [row.id]
        );
        const cover = coverRow ? JSON.parse(coverRow.card_json) as Card : PLACEHOLDER_CARD;
        return {
          id: row.id,
          name: row.name,
          subtitle: row.subtitle,
          count: countRow?.count ?? 0,
          cover,
          tone: [row.tone_start, row.tone_end] as [string, string],
        };
      }));
      return binders;
    },
  });
}

export function useBinder(id: string) {
  return useQuery<Binder | null>({
    queryKey: ['binder', id],
    queryFn: async () => {
      const db = await getDb();
      const row = await db.getFirstAsync<BinderRow>(
        'SELECT * FROM binders WHERE id = ?',
        [id]
      );
      if (!row) return null;
      const coverRow = await db.getFirstAsync<{ card_json: string }>(
        'SELECT card_json FROM binder_cards WHERE binder_id = ? AND position = 0',
        [id]
      );
      const countRow = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM binder_cards WHERE binder_id = ?',
        [id]
      );
      const cover = coverRow ? JSON.parse(coverRow.card_json) as Card : PLACEHOLDER_CARD;
      return {
        id: row.id,
        name: row.name,
        subtitle: row.subtitle,
        count: countRow?.count ?? 0,
        cover,
        tone: [row.tone_start, row.tone_end] as [string, string],
      };
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
        'SELECT card_json FROM binder_cards WHERE binder_id = ? ORDER BY position',
        [binderId]
      );
      return rows.map(r => JSON.parse(r.card_json) as Card);
    },
    enabled: !!binderId,
  });
}

export function useCreateBinder() {
  const queryClient = useQueryClient();
  return async (name: string, toneStart: string, toneEnd: string): Promise<void> => {
    const db = await getDb();
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    await db.runAsync(
      'INSERT INTO binders (id, name, subtitle, tone_start, tone_end, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, name, '', toneStart, toneEnd, Date.now()]
    );
    queryClient.invalidateQueries({ queryKey: ['binders'] });
  };
}

export function useAddCardToBinder() {
  const queryClient = useQueryClient();
  return async (binderId: string, card: Card): Promise<void> => {
    const db = await getDb();
    const existing = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM binder_cards WHERE binder_id = ? AND card_id = ?',
      [binderId, card.id]
    );
    if (existing) return;
    const maxRow = await db.getFirstAsync<{ max_pos: number | null }>(
      'SELECT MAX(position) as max_pos FROM binder_cards WHERE binder_id = ?',
      [binderId]
    );
    const position = (maxRow?.max_pos ?? -1) + 1;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    await db.runAsync(
      'INSERT INTO binder_cards (id, binder_id, card_id, card_json, position) VALUES (?, ?, ?, ?, ?)',
      [id, binderId, card.id, JSON.stringify(card), position]
    );
    queryClient.invalidateQueries({ queryKey: ['binder-cards', binderId] });
    queryClient.invalidateQueries({ queryKey: ['binder', binderId] });
    queryClient.invalidateQueries({ queryKey: ['binders'] });
  };
}

export function useDeleteBinder() {
  const queryClient = useQueryClient();
  return async (id: string): Promise<void> => {
    const db = await getDb();
    await db.runAsync('DELETE FROM binders WHERE id = ?', [id]);
    await db.runAsync('DELETE FROM binder_cards WHERE binder_id = ?', [id]);
    queryClient.invalidateQueries({ queryKey: ['binders'] });
  };
}
