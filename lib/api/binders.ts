// Binders API. Each binder is a row in `cloud_collections` with kind='binder';
// its cards live in `cloud_collection_items`. The cloud-sync engine
// (lib/db/cloud-sync.ts) handles the optimistic write + offline queue.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDb } from '@/lib/db/database';
import {
  addItemToCollection,
  createCollection,
  deleteCollection,
  removeItemFromCollectionByCard,
  renameCollection,
  setCollectionRules,
  SmartBinderRules,
} from '@/lib/db/cloud-sync';
import { useAuth } from '@/lib/auth/AuthContext';
import { PLACEHOLDER_CARD } from '@/lib/placeholder-card';
import { Binder, Card, cardNameVariant } from '@/types';

interface BinderRow {
  id: string;
  name: string;
  description: string | null;
  tone_start: string | null;
  tone_end: string | null;
  rules: string | null;
  created_at: number;
}

function parseRules(raw: string | null): SmartBinderRules | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as SmartBinderRules; } catch { return null; }
}

function hydrateBinder(row: BinderRow, cover: Card, count: number): Binder {
  return {
    id:       row.id,
    name:     row.name,
    subtitle: row.description ?? '',
    count,
    cover,
    tone:     [row.tone_start ?? '#1F0E3A', row.tone_end ?? '#7A6BFF'],
    rules:    parseRules(row.rules),
  };
}

/** Check a card against a rule set. AND vs OR is controlled by `match`. */
export function cardMatchesRules(card: Card, rules: SmartBinderRules): boolean {
  const checks: boolean[] = [];

  if (rules.sets && rules.sets.length > 0) {
    checks.push(rules.sets.includes((card.set || '').toUpperCase()));
  }
  if (rules.rarities && rules.rarities.length > 0) {
    checks.push(rules.rarities.includes(card.rarity));
  }
  if (rules.supertypes && rules.supertypes.length > 0) {
    checks.push(!!card.supertype && rules.supertypes.includes(card.supertype));
  }
  if (rules.variants && rules.variants.length > 0) {
    const v = cardNameVariant(card.name);
    checks.push(!!v && rules.variants.includes(v.toUpperCase()));
  }
  if (rules.minValue != null) checks.push(card.value >= rules.minValue);
  if (rules.maxValue != null) checks.push(card.value <= rules.maxValue);
  if (rules.foilOnly)         checks.push(card.foil === true);

  if (checks.length === 0) return false;
  return rules.match === 'any' ? checks.some(Boolean) : checks.every(Boolean);
}

/** Materialize a smart binder against the user's main collection cards. */
function materialize(rules: SmartBinderRules, mainCards: Card[]): Card[] {
  return mainCards.filter(c => cardMatchesRules(c, rules));
}

async function getMainCollectionCards(userId: string): Promise<Card[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ card_json: string }>(
    `SELECT i.card_json
       FROM cloud_collection_items i
       JOIN cloud_collections c ON c.id = i.collection_id
      WHERE c.user_id = ? AND c.kind = 'collection'`,
    [userId],
  );
  return rows.map(r => JSON.parse(r.card_json) as Card);
}

export function useBinders() {
  const { user } = useAuth();
  return useQuery<Binder[]>({
    queryKey: ['binders', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const db = await getDb();
      const rows = await db.getAllAsync<BinderRow>(
        `SELECT id, name, description, tone_start, tone_end, rules, created_at
           FROM cloud_collections
          WHERE user_id = ? AND kind = 'binder'
          ORDER BY created_at DESC`,
        [user.id],
      );
      // Pull main collection once if any binder is smart — saves N queries.
      const anySmart = rows.some(r => parseRules(r.rules));
      const mainCards = anySmart ? await getMainCollectionCards(user.id) : [];

      return Promise.all(rows.map(async row => {
        const rules = parseRules(row.rules);
        if (rules) {
          const matched = materialize(rules, mainCards);
          const cover = matched[0] ?? PLACEHOLDER_CARD;
          return hydrateBinder(row, cover, matched.length);
        }
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
        `SELECT id, name, description, tone_start, tone_end, rules, created_at
           FROM cloud_collections
          WHERE id = ? AND user_id = ? AND kind = 'binder'`,
        [id, user.id],
      );
      if (!row) return null;

      const rules = parseRules(row.rules);
      if (rules) {
        const matched = materialize(rules, await getMainCollectionCards(user.id));
        return hydrateBinder(row, matched[0] ?? PLACEHOLDER_CARD, matched.length);
      }

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
  const { user } = useAuth();
  return useQuery<Card[]>({
    queryKey: ['binder-cards', user?.id, binderId],
    queryFn: async () => {
      if (!user) return [];
      const db = await getDb();
      const rulesRow = await db.getFirstAsync<{ rules: string | null }>(
        `SELECT rules FROM cloud_collections WHERE id = ? AND user_id = ?`,
        [binderId, user.id],
      );
      const rules = parseRules(rulesRow?.rules ?? null);
      if (rules) {
        return materialize(rules, await getMainCollectionCards(user.id));
      }
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
  return async (
    name: string,
    toneStart: string,
    toneEnd: string,
    rules: SmartBinderRules | null = null,
  ): Promise<void> => {
    if (!user) throw new Error('Sign in to create binders.');
    await createCollection({
      userId:    user.id,
      kind:      'binder',
      name,
      toneStart,
      toneEnd,
      rules,
    });
    queryClient.invalidateQueries({ queryKey: ['binders', user.id] });
  };
}

export function useUpdateBinderRules() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (binderId: string, rules: SmartBinderRules | null): Promise<void> => {
    if (!user) throw new Error('Sign in to edit binders.');
    await setCollectionRules(binderId, rules);
    queryClient.invalidateQueries({ queryKey: ['binders', user.id] });
    queryClient.invalidateQueries({ queryKey: ['binder', user.id, binderId] });
    queryClient.invalidateQueries({ queryKey: ['binder-cards', user.id, binderId] });
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

export function useRemoveCardFromBinder() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (binderId: string, cardId: string): Promise<void> => {
    if (!user) throw new Error('Sign in to manage binders.');
    await removeItemFromCollectionByCard(binderId, cardId);
    queryClient.invalidateQueries({ queryKey: ['binder-cards', binderId] });
    queryClient.invalidateQueries({ queryKey: ['binder', user.id, binderId] });
    queryClient.invalidateQueries({ queryKey: ['binders', user.id] });
  };
}

export function useRenameBinder() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (binderId: string, name: string): Promise<void> => {
    if (!user) throw new Error('Sign in to manage binders.');
    await renameCollection(binderId, name);
    queryClient.invalidateQueries({ queryKey: ['binder', user.id, binderId] });
    queryClient.invalidateQueries({ queryKey: ['binders', user.id] });
  };
}

export function useDeleteBinder() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (binderId: string): Promise<void> => {
    if (!user) throw new Error('Sign in to manage binders.');
    await deleteCollection(binderId);
    queryClient.invalidateQueries({ queryKey: ['binders', user.id] });
    queryClient.invalidateQueries({ queryKey: ['binder', user.id, binderId] });
    queryClient.invalidateQueries({ queryKey: ['binder-cards', binderId] });
  };
}

