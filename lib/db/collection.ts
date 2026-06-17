// Collection hooks. Reads come from the cloud_collection_items mirror;
// mutations enqueue ops to the offline queue, which flushes them to Supabase.
// See lib/db/cloud-sync.ts for the sync engine.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDb } from './database';
import {
  addItemToCollection,
  getOrCreateDefaultCollection,
  ItemDetails,
  recordSaleAndRemove,
  recordSaleAndRemoveById,
  removeItemFromCollectionByCard,
  removeItemById,
  setCollectionVisibility,
  setItemCostBasis,
  setItemCostBasisById,
} from './cloud-sync';
import { autoFileCardIntoBinders } from '@/lib/api/binders';
import { useAuth } from '@/lib/auth/AuthContext';
import { Card } from '@/types';
import { CollectionEntry } from '@/lib/filters/collection';

// Smart binders read live off the collection, and auto-add binders pull in
// matching cards on intake — so any collection write must refresh the binder
// caches too. Centralized here so add/remove paths stay consistent.
function invalidateBinderQueries(queryClient: ReturnType<typeof useQueryClient>, userId: string) {
  queryClient.invalidateQueries({ queryKey: ['binders', userId] });
  queryClient.invalidateQueries({ queryKey: ['binder', userId] });
  queryClient.invalidateQueries({ queryKey: ['binder-cards'] });
}

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
      const rows = await db.getAllAsync<{
        item_id: string;
        card_json: string;
        added_at: number;
        acquired_price: number | null;
        acquired_at: number | null;
        variant_name: string | null;
        condition: string | null;
        grader: string | null;
        grade: string | null;
      }>(
        `SELECT i.id AS item_id, i.card_json, i.added_at, i.acquired_price, i.acquired_at,
                i.variant_name, i.condition, i.grader, i.grade
           FROM cloud_collection_items i
           JOIN cloud_collections c ON c.id = i.collection_id
          WHERE c.user_id = ? AND c.kind = 'collection'
          ORDER BY i.added_at DESC`,
        [user.id],
      );
      return rows.map(r => ({
        item_id:        r.item_id,
        card:           JSON.parse(r.card_json) as Card,
        added_at:       r.added_at,
        acquired_price: r.acquired_price,
        acquired_at:    r.acquired_at,
        variant_name:   r.variant_name,
        condition:      r.condition,
        grader:         r.grader,
        grade:          r.grade,
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
  return async (card: Card, details?: ItemDetails): Promise<void> => {
    if (!user) throw new Error('Sign in to save cards.');
    const collectionId = await getOrCreateDefaultCollection(user.id, 'collection', 'Main');
    await addItemToCollection(collectionId, card, details);
    // File the card into any auto-add binder it matches. Best-effort — a binder
    // file failing shouldn't fail the collection add.
    await autoFileCardIntoBinders(user.id, card).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['collection-entries', user.id] });
    queryClient.invalidateQueries({ queryKey: ['in-collection', user.id, card.id] });
    queryClient.invalidateQueries({ queryKey: ['collection-copies', user.id, card.id] });
    queryClient.invalidateQueries({ queryKey: ['portfolio-history', user.id] });
    invalidateBinderQueries(queryClient, user.id);
  };
}

/**
 * All copies of a given card the user holds in their main collection — one
 * entry per physical copy (distinct variant / grade). Drives the card-detail
 * "manage copies" UI.
 */
export function useCollectionCopies(cardId: string) {
  const { user } = useAuth();
  return useQuery<CollectionEntry[]>({
    queryKey: ['collection-copies', user?.id, cardId],
    queryFn: async () => {
      if (!user || !cardId) return [];
      const db = await getDb();
      const rows = await db.getAllAsync<{
        item_id: string;
        card_json: string;
        added_at: number;
        acquired_price: number | null;
        acquired_at: number | null;
        variant_name: string | null;
        condition: string | null;
        grader: string | null;
        grade: string | null;
      }>(
        `SELECT i.id AS item_id, i.card_json, i.added_at, i.acquired_price, i.acquired_at,
                i.variant_name, i.condition, i.grader, i.grade
           FROM cloud_collection_items i
           JOIN cloud_collections c ON c.id = i.collection_id
          WHERE c.user_id = ? AND c.kind = 'collection' AND i.card_id = ?
          ORDER BY i.added_at DESC`,
        [user.id, cardId],
      );
      return rows.map(r => ({
        item_id:        r.item_id,
        card:           JSON.parse(r.card_json) as Card,
        added_at:       r.added_at,
        acquired_price: r.acquired_price,
        acquired_at:    r.acquired_at,
        variant_name:   r.variant_name,
        condition:      r.condition,
        grader:         r.grader,
        grade:          r.grade,
      }));
    },
    enabled: !!cardId,
  });
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
    queryClient.invalidateQueries({ queryKey: ['collection-copies', user.id, cardId] });
    queryClient.invalidateQueries({ queryKey: ['portfolio-history', user.id] });
    // Virtual smart binders mirror the collection, so they must drop this card.
    // Auto-add binders keep their persisted copy by design.
    invalidateBinderQueries(queryClient, user.id);
  };
}

/** Remove a single physical copy by its item id (copy-aware). Pass the card id
 *  too so the per-card queries can be invalidated. */
export function useRemoveItem() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (itemId: string, cardId: string): Promise<void> => {
    if (!user) throw new Error('Sign in to manage your collection.');
    await removeItemById(itemId);
    queryClient.invalidateQueries({ queryKey: ['collection-entries', user.id] });
    queryClient.invalidateQueries({ queryKey: ['in-collection', user.id, cardId] });
    queryClient.invalidateQueries({ queryKey: ['collection-copies', user.id, cardId] });
    queryClient.invalidateQueries({ queryKey: ['portfolio-summary', user.id] });
    queryClient.invalidateQueries({ queryKey: ['portfolio-history', user.id] });
  };
}

// ─── Cost basis ──────────────────────────────────────────────────────────────

/**
 * Set or clear the cost basis for a card already in the user's main
 * collection. Pass `acquiredPrice: null` to clear.
 */
export function useUpdateCostBasis() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (
    cardId: string,
    acquiredPrice: number | null,
    acquiredAt: number | null = null,
  ): Promise<void> => {
    if (!user) throw new Error('Sign in to manage your collection.');
    const collectionId = await getOrCreateDefaultCollection(user.id, 'collection', 'Main');
    await setItemCostBasis(collectionId, cardId, acquiredPrice, acquiredAt);
    queryClient.invalidateQueries({ queryKey: ['collection-entries', user.id] });
    queryClient.invalidateQueries({ queryKey: ['card-cost-basis', user.id, cardId] });
    queryClient.invalidateQueries({ queryKey: ['portfolio-summary', user.id] });
  };
}

/** Set/clear the cost basis for a single physical copy by item id. */
export function useUpdateCopyCostBasis() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (
    itemId: string,
    cardId: string,
    acquiredPrice: number | null,
    acquiredAt: number | null = null,
  ): Promise<void> => {
    if (!user) throw new Error('Sign in to manage your collection.');
    await setItemCostBasisById(itemId, acquiredPrice, acquiredAt);
    queryClient.invalidateQueries({ queryKey: ['collection-entries', user.id] });
    queryClient.invalidateQueries({ queryKey: ['collection-copies', user.id, cardId] });
    queryClient.invalidateQueries({ queryKey: ['card-cost-basis', user.id, cardId] });
    queryClient.invalidateQueries({ queryKey: ['portfolio-summary', user.id] });
  };
}

/** Read the current cost basis for a single card. null = not set. */
export function useCardCostBasis(cardId: string) {
  const { user } = useAuth();
  return useQuery<number | null>({
    queryKey: ['card-cost-basis', user?.id, cardId],
    queryFn: async () => {
      if (!user) return null;
      const db = await getDb();
      const row = await db.getFirstAsync<{ acquired_price: number | null }>(
        `SELECT i.acquired_price
           FROM cloud_collection_items i
           JOIN cloud_collections c ON c.id = i.collection_id
          WHERE c.user_id = ? AND c.kind = 'collection' AND i.card_id = ?`,
        [user.id, cardId],
      );
      return row?.acquired_price ?? null;
    },
    enabled: !!cardId,
  });
}

// ─── Sales / realized P/L ────────────────────────────────────────────────────

export interface Sale {
  id:         string;
  card_id:    string;
  card_name:  string;
  card_set:   string | null;
  cost_basis: number | null;
  sale_price: number;
  sold_at:    number;
}

/**
 * Mark a card as sold: records the sale (with cost-basis snapshot) and removes
 * it from the collection in one transaction.
 */
export function useSellCard() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (card: Card, salePrice: number): Promise<void> => {
    if (!user) throw new Error('Sign in to manage your collection.');
    const collectionId = await getOrCreateDefaultCollection(user.id, 'collection', 'Main');
    await recordSaleAndRemove(user.id, collectionId, card, salePrice);
    queryClient.invalidateQueries({ queryKey: ['collection-entries', user.id] });
    queryClient.invalidateQueries({ queryKey: ['in-collection', user.id, card.id] });
    queryClient.invalidateQueries({ queryKey: ['portfolio-summary', user.id] });
    queryClient.invalidateQueries({ queryKey: ['sales', user.id] });
    queryClient.invalidateQueries({ queryKey: ['portfolio-history', user.id] });
  };
}

/**
 * Copy-aware sale: sell a single physical copy by item id. Snapshots cost basis
 * from that copy's row and removes only that copy.
 */
export function useSellCopy() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (itemId: string, card: Card, salePrice: number): Promise<void> => {
    if (!user) throw new Error('Sign in to manage your collection.');
    await recordSaleAndRemoveById(user.id, itemId, card, salePrice);
    queryClient.invalidateQueries({ queryKey: ['collection-entries', user.id] });
    queryClient.invalidateQueries({ queryKey: ['in-collection', user.id, card.id] });
    queryClient.invalidateQueries({ queryKey: ['collection-copies', user.id, card.id] });
    queryClient.invalidateQueries({ queryKey: ['portfolio-summary', user.id] });
    queryClient.invalidateQueries({ queryKey: ['sales', user.id] });
    queryClient.invalidateQueries({ queryKey: ['portfolio-history', user.id] });
  };
}

/** Sale ledger, newest first. */
export function useSales() {
  const { user } = useAuth();
  return useQuery<Sale[]>({
    queryKey: ['sales', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const db = await getDb();
      const rows = await db.getAllAsync<{
        id: string;
        card_id: string;
        card_name: string;
        card_set: string | null;
        cost_basis: number | null;
        sale_price: number;
        sold_at: number;
      }>(
        `SELECT id, card_id, card_name, card_set, cost_basis, sale_price, sold_at
           FROM cloud_card_sales
          WHERE user_id = ?
          ORDER BY sold_at DESC`,
        [user.id],
      );
      return rows;
    },
  });
}

// ─── Portfolio summary ───────────────────────────────────────────────────────

export interface PortfolioSummary {
  currentValue:   number;   // sum of card.value across collection
  costBasisTotal: number;   // sum of acquired_price across items where set
  unrealized:     number;   // currentValue (of items WITH cost basis) − costBasisTotal
  realizedYtd:    number;   // sum of (sale_price − cost_basis) for sales this year
  itemCount:      number;
  itemsWithBasis: number;
}

/**
 * One-shot portfolio totals for the collection header card. Recomputed when
 * entries or sales change (both invalidated by the relevant mutations).
 */
export function usePortfolioSummary() {
  const { data: entries = [] } = useCollectionEntries();
  const { data: sales   = [] } = useSales();

  const year = new Date().getFullYear();

  let currentValue   = 0;
  let costBasisTotal = 0;
  let basisValueSum  = 0;
  let itemsWithBasis = 0;
  for (const e of entries) {
    currentValue += e.card.value || 0;
    if (e.acquired_price != null) {
      costBasisTotal += e.acquired_price;
      basisValueSum  += e.card.value || 0;
      itemsWithBasis += 1;
    }
  }

  let realizedYtd = 0;
  for (const s of sales) {
    if (new Date(s.sold_at).getFullYear() !== year) continue;
    if (s.cost_basis == null) continue; // can't compute P/L without basis
    realizedYtd += s.sale_price - s.cost_basis;
  }

  return {
    currentValue,
    costBasisTotal,
    unrealized:     basisValueSum - costBasisTotal,
    realizedYtd,
    itemCount:      entries.length,
    itemsWithBasis,
  } satisfies PortfolioSummary;
}

// ─── Visibility (public/private) ─────────────────────────────────────────────

interface VisibilityInfo {
  collectionId: string | null;
  isPublic:     boolean;
}

/**
 * Read visibility for the user's default 'collection' or 'wishlist'. Returns
 * `collectionId: null` if the row doesn't exist yet — the toggle UI should
 * lazily create it via `getOrCreateDefaultCollection` when first flipped on.
 */
export function useCollectionVisibility(kind: 'collection' | 'wishlist') {
  const { user } = useAuth();
  return useQuery<VisibilityInfo>({
    queryKey: ['collection-visibility', user?.id, kind],
    queryFn: async () => {
      if (!user) return { collectionId: null, isPublic: false };
      const db = await getDb();
      const row = await db.getFirstAsync<{ id: string; is_public: number }>(
        `SELECT id, is_public FROM cloud_collections
          WHERE user_id = ? AND kind = ?
          ORDER BY created_at ASC LIMIT 1`,
        [user.id, kind],
      );
      return {
        collectionId: row?.id ?? null,
        isPublic:     row ? row.is_public === 1 : false,
      };
    },
  });
}

/** Read visibility for a specific binder (or any collection by id). */
export function useBinderVisibility(collectionId: string) {
  const { user } = useAuth();
  return useQuery<boolean>({
    queryKey: ['binder-visibility', user?.id, collectionId],
    queryFn: async () => {
      if (!collectionId) return false;
      const db = await getDb();
      const row = await db.getFirstAsync<{ is_public: number }>(
        `SELECT is_public FROM cloud_collections WHERE id = ?`,
        [collectionId],
      );
      return row?.is_public === 1;
    },
    enabled: !!collectionId,
  });
}

/**
 * Flip the public/private flag on any owned collection. For the main
 * collection and wishlist, pass the kind so a row is auto-created when the
 * user hasn't ever opened that surface yet.
 */
export function useSetCollectionVisibility() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (
    args: { collectionId: string } | { kind: 'collection' | 'wishlist' },
    isPublic: boolean,
  ): Promise<void> => {
    if (!user) throw new Error('Sign in to manage your collection.');

    let id: string;
    if ('collectionId' in args) {
      id = args.collectionId;
    } else {
      const name = args.kind === 'wishlist' ? 'Wishlist' : 'Main';
      id = await getOrCreateDefaultCollection(user.id, args.kind, name);
    }
    await setCollectionVisibility(id, isPublic);
    queryClient.invalidateQueries({ queryKey: ['collection-visibility', user.id] });
    queryClient.invalidateQueries({ queryKey: ['binder-visibility', user.id, id] });
  };
}
