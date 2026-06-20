// Binders API. Each binder is a row in `cloud_collections` with kind='binder';
// its cards live in `cloud_collection_items`. The cloud-sync engine
// (lib/db/cloud-sync.ts) handles the optimistic write + offline queue.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { File } from 'expo-file-system';
import { getDb } from '@/lib/db/database';
import { supabase } from '@/lib/supabase';
import {
  addBinderMedia,
  addItemToCollection,
  BinderMediaKind,
  BinderMediaTransform,
  createCollection,
  deleteCollection,
  ItemDetails,
  MirrorBinderMedia,
  removeBinderMedia,
  removeItemFromCollectionByCard,
  renameCollection,
  reorderBinder,
  setBinderItemPositions,
  setCollectionCover,
  setCollectionRules,
  setCollectionTone,
  SmartBinderRules,
  updateBinderMedia,
} from '@/lib/db/cloud-sync';
import { useAuth } from '@/lib/auth/AuthContext';
import { PLACEHOLDER_CARD } from '@/lib/placeholder-card';
import { Binder, Card, cardNameVariant } from '@/types';

const BINDER_MEDIA_BUCKET = 'binder-media';
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
};

interface BinderRow {
  id: string;
  name: string;
  description: string | null;
  tone_start: string | null;
  tone_end: string | null;
  rules: string | null;
  cover_card_ids: string | null;
  created_at: number;
}

const BINDER_ROW_COLUMNS =
  'id, name, description, tone_start, tone_end, rules, cover_card_ids, created_at';

function parseRules(raw: string | null): SmartBinderRules | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as SmartBinderRules; } catch { return null; }
}

function parseCoverIds(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as string[]) : null;
  } catch { return null; }
}

/**
 * The (up to two) cards shown on a binder's cover: the user's chosen
 * cover_card_ids if set and still present, otherwise the first two `candidates`
 * (already in display order). Falls back to first-two if a chosen id is gone.
 */
function pickCovers(candidates: Card[], coverIds: string[] | null): Card[] {
  if (coverIds && coverIds.length > 0) {
    const byId = new Map(candidates.map(c => [c.id, c]));
    const chosen = coverIds.map(id => byId.get(id)).filter((c): c is Card => !!c);
    if (chosen.length > 0) return chosen.slice(0, 2);
  }
  return candidates.slice(0, 2);
}

function hydrateBinder(row: BinderRow, covers: Card[], count: number): Binder {
  return {
    id:       row.id,
    name:     row.name,
    subtitle: row.description ?? '',
    count,
    cover:    covers[0] ?? PLACEHOLDER_CARD,
    covers,
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
  const nameNeedle = rules.nameMatch?.trim().toLowerCase();
  if (nameNeedle) {
    checks.push(card.name.toLowerCase().includes(nameNeedle));
  }
  if (rules.minValue != null) checks.push(card.value >= rules.minValue);
  if (rules.maxValue != null) checks.push(card.value <= rules.maxValue);
  if (rules.foilOnly)         checks.push(card.foil === true);

  if (checks.length === 0) return false;
  return rules.match === 'any' ? checks.some(Boolean) : checks.every(Boolean);
}

/**
 * A binder reads its contents as a *live virtual filter* over the collection
 * only when it has rules AND those rules aren't in auto-add mode. Auto-add
 * binders (and rules-less manual binders) own real, persistent item rows, so
 * they read from `cloud_collection_items` like any manual binder.
 */
function isVirtualSmart(rules: SmartBinderRules | null): boolean {
  return !!rules && !rules.autoAdd;
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

/** Occupied card slots + per-page tile masks for a binder, for slot math. */
async function binderOccupancy(binderId: string): Promise<{
  cardSlots: Set<number>;
  tileMaskByPage: Map<number, number>;
}> {
  const db = await getDb();
  const cardRows = await db.getAllAsync<{ position: number }>(
    `SELECT position FROM cloud_collection_items WHERE collection_id = ?`,
    [binderId],
  );
  const cardSlots = new Set(cardRows.map(r => r.position));
  const tileRows = await db.getAllAsync<{ page_num: number; cell_mask: number; kind: string }>(
    `SELECT page_num, cell_mask, kind FROM cloud_binder_media WHERE binder_id = ?`,
    [binderId],
  );
  const tileMaskByPage = new Map<number, number>();
  for (const t of tileRows) {
    if (t.kind === 'background') continue;
    tileMaskByPage.set(t.page_num, (tileMaskByPage.get(t.page_num) ?? 0) | (t.cell_mask & 0x1ff));
  }
  return { cardSlots, tileMaskByPage };
}

function slotIsTile(slot: number, tileMaskByPage: Map<number, number>): boolean {
  const mask = tileMaskByPage.get(Math.floor(slot / 9)) ?? 0;
  return !!(mask & (1 << (slot % 9)));
}

/**
 * Lowest free slot for a new card: skips slots already holding a card AND slots
 * covered by a photo tile, so an added/auto-filed card is never hidden behind a
 * tile (and fills earlier gaps before extending to new pages).
 */
async function nextBinderPosition(binderId: string): Promise<number> {
  const { cardSlots, tileMaskByPage } = await binderOccupancy(binderId);
  for (let slot = 0; ; slot++) {
    if (cardSlots.has(slot)) continue;
    if (slotIsTile(slot, tileMaskByPage)) continue;
    return slot;
  }
}

/**
 * Move any card whose slot is covered by a tile to the lowest free non-tile
 * slot, so cards hidden behind tiles (e.g. auto-filed onto tile cells before
 * tile-aware placement) become visible again. Returns true if anything moved.
 */
export async function reconcileBinderTileCollisions(binderId: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; position: number }>(
    `SELECT id, position FROM cloud_collection_items WHERE collection_id = ? ORDER BY position ASC`,
    [binderId],
  );
  const { tileMaskByPage } = await binderOccupancy(binderId);
  const displaced = rows.filter(r => slotIsTile(r.position, tileMaskByPage));
  if (displaced.length === 0) return false;
  const used = new Set(rows.filter(r => !slotIsTile(r.position, tileMaskByPage)).map(r => r.position));
  const updates: { itemId: string; position: number }[] = [];
  let cursor = 0;
  for (const d of displaced) {
    while (used.has(cursor) || slotIsTile(cursor, tileMaskByPage)) cursor++;
    used.add(cursor);
    updates.push({ itemId: d.id, position: cursor });
    cursor++;
  }
  await setBinderItemPositions(updates);
  return true;
}

/** Hook wrapper for reconcileBinderTileCollisions; invalidates on change. */
export function useReconcileBinderTiles() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (binderId: string): Promise<void> => {
    if (!user) return;
    const changed = await reconcileBinderTileCollisions(binderId);
    if (changed) {
      queryClient.invalidateQueries({ queryKey: ['binder-items', user.id, binderId] });
      queryClient.invalidateQueries({ queryKey: ['binder-cards', user.id, binderId] });
      queryClient.invalidateQueries({ queryKey: ['binder', user.id, binderId] });
      queryClient.invalidateQueries({ queryKey: ['binders', user.id] });
    }
  };
}

/**
 * File a newly-collected card into every auto-add binder whose rules it
 * matches. Call this right after a card lands in the main collection. Returns
 * the ids of the binders it was filed into so callers can invalidate the right
 * query caches. A no-op for binders that already hold the card —
 * addItemToCollection dedups on the copy tuple and returns null.
 */
export async function autoFileCardIntoBinders(userId: string, card: Card): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; rules: string | null }>(
    `SELECT id, rules FROM cloud_collections WHERE user_id = ? AND kind = 'binder'`,
    [userId],
  );
  const filed: string[] = [];
  for (const row of rows) {
    const rules = parseRules(row.rules);
    if (!rules?.autoAdd || !cardMatchesRules(card, rules)) continue;
    const position = await nextBinderPosition(row.id);
    const added = await addItemToCollection(row.id, card, undefined, position);
    if (added) filed.push(row.id);
  }
  return filed;
}

/**
 * One-time sweep filing every matching card already in the user's collection
 * into an auto-add binder. Runs when a binder first gains auto-add rules so it
 * isn't left empty. Returns the count of cards newly filed.
 */
export async function backfillAutoAddBinder(
  userId: string,
  binderId: string,
  rules: SmartBinderRules,
): Promise<number> {
  if (!rules.autoAdd) return 0;
  const cards = await getMainCollectionCards(userId);
  let position = await nextBinderPosition(binderId);
  let filed = 0;
  for (const card of cards) {
    if (!cardMatchesRules(card, rules)) continue;
    const added = await addItemToCollection(binderId, card, undefined, position);
    if (added) { position++; filed++; }
  }
  return filed;
}

export function useBinders() {
  const { user } = useAuth();
  return useQuery<Binder[]>({
    queryKey: ['binders', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const db = await getDb();
      const rows = await db.getAllAsync<BinderRow>(
        `SELECT ${BINDER_ROW_COLUMNS}
           FROM cloud_collections
          WHERE user_id = ? AND kind = 'binder'
          ORDER BY created_at DESC`,
        [user.id],
      );
      // Pull main collection once if any binder is a live virtual filter —
      // saves N queries. Auto-add binders read real rows, so they don't need it.
      const anyVirtual = rows.some(r => isVirtualSmart(parseRules(r.rules)));
      const mainCards = anyVirtual ? await getMainCollectionCards(user.id) : [];

      return Promise.all(rows.map(async row => {
        const rules = parseRules(row.rules);
        const coverIds = parseCoverIds(row.cover_card_ids);
        const countRow = await db.getFirstAsync<{ count: number }>(
          `SELECT COUNT(*) as count FROM cloud_collection_items WHERE collection_id = ?`,
          [row.id],
        );
        const realCount = countRow?.count ?? 0;
        // Live-filter (virtual) only when it has rules, isn't auto-add, AND owns
        // no real rows. An ex-auto binder keeps its rows → stays editable.
        if (isVirtualSmart(rules) && realCount === 0) {
          const matched = materialize(rules!, mainCards);
          return hydrateBinder(row, pickCovers(matched, coverIds), matched.length);
        }
        const coverRows = await db.getAllAsync<{ card_json: string }>(
          coverIds
            ? `SELECT card_json FROM cloud_collection_items WHERE collection_id = ? ORDER BY position ASC`
            : `SELECT card_json FROM cloud_collection_items WHERE collection_id = ? ORDER BY position ASC LIMIT 2`,
          [row.id],
        );
        const candidates = coverRows.map(r => JSON.parse(r.card_json) as Card);
        return hydrateBinder(row, pickCovers(candidates, coverIds), realCount);
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
        `SELECT ${BINDER_ROW_COLUMNS}
           FROM cloud_collections
          WHERE id = ? AND user_id = ? AND kind = 'binder'`,
        [id, user.id],
      );
      if (!row) return null;

      const rules = parseRules(row.rules);
      const coverIds = parseCoverIds(row.cover_card_ids);
      const countRow = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM cloud_collection_items WHERE collection_id = ?`,
        [id],
      );
      const realCount = countRow?.count ?? 0;
      if (isVirtualSmart(rules) && realCount === 0) {
        const matched = materialize(rules!, await getMainCollectionCards(user.id));
        return hydrateBinder(row, pickCovers(matched, coverIds), matched.length);
      }

      const coverRows = await db.getAllAsync<{ card_json: string }>(
        coverIds
          ? `SELECT card_json FROM cloud_collection_items WHERE collection_id = ? ORDER BY position ASC`
          : `SELECT card_json FROM cloud_collection_items WHERE collection_id = ? ORDER BY position ASC LIMIT 2`,
        [id],
      );
      const candidates = coverRows.map(r => JSON.parse(r.card_json) as Card);
      return hydrateBinder(row, pickCovers(candidates, coverIds), realCount);
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
      const rows = await db.getAllAsync<{ card_json: string }>(
        `SELECT card_json FROM cloud_collection_items
          WHERE collection_id = ? ORDER BY position ASC`,
        [binderId],
      );
      // Real rows win; a binder only materializes a live filter when it owns no
      // rows (a pure smart filter). An ex-auto binder keeps its real cards.
      if (rows.length > 0) return rows.map(r => JSON.parse(r.card_json) as Card);
      const rules = parseRules(rulesRow?.rules ?? null);
      if (isVirtualSmart(rules)) {
        return materialize(rules!, await getMainCollectionCards(user.id));
      }
      return [];
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
    const created = await createCollection({
      userId:    user.id,
      kind:      'binder',
      name,
      toneStart,
      toneEnd,
      rules,
    });
    // Auto-add binders start by absorbing everything already in the collection.
    if (rules?.autoAdd) await backfillAutoAddBinder(user.id, created.id, rules);
    queryClient.invalidateQueries({ queryKey: ['binders', user.id] });
    queryClient.invalidateQueries({ queryKey: ['binder-cards', user.id, created.id] });
  };
}

export function useUpdateBinderRules() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (binderId: string, rules: SmartBinderRules | null): Promise<void> => {
    if (!user) throw new Error('Sign in to edit binders.');
    await setCollectionRules(binderId, rules);
    // Turning auto-add on (or editing an auto-add binder's rules) sweeps the
    // collection so newly-matching cards are filed immediately. Backfill dedups,
    // so re-running on an edit only files cards that newly match.
    if (rules?.autoAdd) await backfillAutoAddBinder(user.id, binderId, rules);
    queryClient.invalidateQueries({ queryKey: ['binders', user.id] });
    queryClient.invalidateQueries({ queryKey: ['binder', user.id, binderId] });
    queryClient.invalidateQueries({ queryKey: ['binder-cards', user.id, binderId] });
  };
}

export function useAddCardToBinder() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (binderId: string, card: Card, details?: ItemDetails): Promise<void> => {
    if (!user) throw new Error('Sign in to add cards.');
    // Find current max position so the new card lands at the end.
    const db = await getDb();
    const maxRow = await db.getFirstAsync<{ max_pos: number | null }>(
      `SELECT MAX(position) as max_pos FROM cloud_collection_items WHERE collection_id = ?`,
      [binderId],
    );
    const position = (maxRow?.max_pos ?? -1) + 1;
    await addItemToCollection(binderId, card, details, position);
    queryClient.invalidateQueries({ queryKey: ['binder-cards', user.id, binderId] });
    queryClient.invalidateQueries({ queryKey: ['binder-items', user.id, binderId] });
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
    // Edit-mode board reads binder-items; the page/list read binder-cards.
    queryClient.invalidateQueries({ queryKey: ['binder-cards', user.id, binderId] });
    queryClient.invalidateQueries({ queryKey: ['binder-items', user.id, binderId] });
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
    queryClient.invalidateQueries({ queryKey: ['binder-cards', user.id, binderId] });
    queryClient.invalidateQueries({ queryKey: ['binder-items', user.id, binderId] });
  };
}

// ─── Reorder ─────────────────────────────────────────────────────────────────

/** Persist a new card ordering. `orderedItemIds` is the binder's full item-id
 *  list in the desired order (see useBinderItems for the id↔card mapping). */
export function useReorderBinder() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (binderId: string, orderedItemIds: string[]): Promise<void> => {
    if (!user) throw new Error('Sign in to reorder binders.');
    await reorderBinder(binderId, orderedItemIds);
    queryClient.invalidateQueries({ queryKey: ['binder-cards', user.id, binderId] });
    queryClient.invalidateQueries({ queryKey: ['binder-items', user.id, binderId] });
    queryClient.invalidateQueries({ queryKey: ['binder', user.id, binderId] });
    queryClient.invalidateQueries({ queryKey: ['binders', user.id] });
  };
}

/** Free-placement drag-and-drop: set explicit slot positions for one or two
 *  items (move into an empty cell, or swap two cards' slots) without disturbing
 *  the rest. `position` is the absolute slot = page·9 + cell. */
export function useSetBinderItemPositions() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (binderId: string, updates: { itemId: string; position: number }[]): Promise<void> => {
    if (!user) throw new Error('Sign in to rearrange binders.');
    await setBinderItemPositions(updates);
    queryClient.invalidateQueries({ queryKey: ['binder-cards', user.id, binderId] });
    queryClient.invalidateQueries({ queryKey: ['binder-items', user.id, binderId] });
    queryClient.invalidateQueries({ queryKey: ['binder', user.id, binderId] });
    queryClient.invalidateQueries({ queryKey: ['binders', user.id] });
  };
}

/** Choose the binder's cover cards (up to two card ids), or pass null/[] to
 *  fall back to the first two cards by position. */
export function useSetBinderCover() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (binderId: string, cardIds: string[] | null): Promise<void> => {
    if (!user) throw new Error('Sign in to customize binders.');
    await setCollectionCover(binderId, cardIds);
    queryClient.invalidateQueries({ queryKey: ['binder', user.id, binderId] });
    queryClient.invalidateQueries({ queryKey: ['binders', user.id] });
  };
}

/** Recolor a binder's gradient tone (the [start, end] pair behind every page). */
export function useSetBinderTone() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (binderId: string, tone: [string, string]): Promise<void> => {
    if (!user) throw new Error('Sign in to customize binders.');
    await setCollectionTone(binderId, tone[0], tone[1]);
    queryClient.invalidateQueries({ queryKey: ['binder', user.id, binderId] });
    queryClient.invalidateQueries({ queryKey: ['binders', user.id] });
  };
}

/** Binder cards paired with their item id + position, ordered by position. The
 *  drag-reorder layer needs the item ids; useBinderCards stays card-only. */
export interface BinderItem {
  itemId: string;
  position: number;
  card: Card;
}

export function useBinderItems(binderId: string) {
  const { user } = useAuth();
  return useQuery<BinderItem[]>({
    queryKey: ['binder-items', user?.id, binderId],
    queryFn: async () => {
      if (!binderId) return [];
      const db = await getDb();
      const rows = await db.getAllAsync<{ id: string; position: number; card_json: string }>(
        `SELECT id, position, card_json FROM cloud_collection_items
          WHERE collection_id = ? ORDER BY position ASC`,
        [binderId],
      );
      return rows.map(r => ({
        itemId: r.id,
        position: r.position,
        card: JSON.parse(r.card_json) as Card,
      }));
    },
    enabled: !!binderId,
  });
}

// ─── Binder media (tiles / backgrounds) ──────────────────────────────────────

// A page's solid background colour is stored as a `background` media row whose
// url is this sentinel + a hex colour (e.g. "color:#1A1530") instead of an
// uploaded image URL. Lets page colours ride the existing media sync/RLS path
// with no schema change; renderers branch on this prefix.
export const PAGE_COLOR_PREFIX = 'color:';

/** The hex colour of a page-colour background media row, or null if it's an
 *  image background (or not a background). */
export function pageColorOf(media: { kind: BinderMediaKind; url: string }): string | null {
  return media.kind === 'background' && media.url.startsWith(PAGE_COLOR_PREFIX)
    ? media.url.slice(PAGE_COLOR_PREFIX.length)
    : null;
}

export interface BinderMediaItem {
  id: string;
  binderId: string;
  pageNum: number;
  kind: BinderMediaKind;
  cellMask: number;          // bits 0..8 = occupied cells (tiles); 0 for backgrounds
  url: string;               // public image URL
  transform: BinderMediaTransform | null;
}

function parseTransform(raw: string | null): BinderMediaTransform | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as BinderMediaTransform; } catch { return null; }
}

/** A binder's photo tiles + backgrounds (owner's local mirror), grouped-ready
 *  by page. Friend/public binders read media via the friends API (later). */
export function useBinderMedia(binderId: string) {
  const { user } = useAuth();
  return useQuery<BinderMediaItem[]>({
    queryKey: ['binder-media', user?.id, binderId],
    queryFn: async () => {
      if (!binderId) return [];
      const db = await getDb();
      const rows = await db.getAllAsync<{
        id: string; binder_id: string; page_num: number; kind: string;
        cell_mask: number; storage_key: string; transform: string | null;
      }>(
        `SELECT id, binder_id, page_num, kind, cell_mask, storage_key, transform
           FROM cloud_binder_media WHERE binder_id = ?
          ORDER BY page_num ASC, created_at ASC`,
        [binderId],
      );
      return rows.map(r => ({
        id: r.id,
        binderId: r.binder_id,
        pageNum: r.page_num,
        kind: (r.kind === 'background' ? 'background' : 'tile') as BinderMediaKind,
        cellMask: r.cell_mask,
        url: r.storage_key,
        transform: parseTransform(r.transform),
      }));
    },
    enabled: !!binderId,
  });
}

export interface UploadBinderImageInput {
  userId: string;
  binderId: string;
  uri: string;
  mimeType?: string;
}

/** Upload a locally-picked image to the binder-media bucket; returns its public
 *  URL. Unique filename per upload so the CDN URL changes (no stale cache). */
export async function uploadBinderImage(input: UploadBinderImageInput): Promise<string> {
  const contentType = input.mimeType ?? 'image/jpeg';
  const ext = EXT_BY_MIME[contentType] ?? 'jpg';
  const path = `${input.userId}/${input.binderId}/${Date.now()}.${ext}`;
  const bytes = await new File(input.uri).bytes();
  const { error } = await supabase.storage
    .from(BINDER_MEDIA_BUCKET)
    .upload(path, bytes, { contentType });
  if (error) throw error;
  return supabase.storage.from(BINDER_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

export interface AddBinderMediaArgs {
  binderId: string;
  pageNum: number;
  kind: BinderMediaKind;
  cellMask: number;
  storageKey: string;        // public URL from uploadBinderImage
  transform?: BinderMediaTransform | null;
}

export function useAddBinderMedia() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (args: AddBinderMediaArgs): Promise<MirrorBinderMedia> => {
    if (!user) throw new Error('Sign in to customize binders.');
    const row = await addBinderMedia({ userId: user.id, ...args });
    queryClient.invalidateQueries({ queryKey: ['binder-media', user.id, args.binderId] });
    queryClient.invalidateQueries({ queryKey: ['binder', user.id, args.binderId] });
    queryClient.invalidateQueries({ queryKey: ['binders', user.id] });
    return row;
  };
}

export function useUpdateBinderMedia() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (
    binderId: string,
    id: string,
    patch: { pageNum?: number; cellMask?: number; transform?: BinderMediaTransform | null },
  ): Promise<void> => {
    if (!user) throw new Error('Sign in to customize binders.');
    await updateBinderMedia(id, patch);
    queryClient.invalidateQueries({ queryKey: ['binder-media', user.id, binderId] });
  };
}

export function useRemoveBinderMedia() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return async (binderId: string, id: string): Promise<void> => {
    if (!user) throw new Error('Sign in to customize binders.');
    await removeBinderMedia(id);
    queryClient.invalidateQueries({ queryKey: ['binder-media', user.id, binderId] });
    queryClient.invalidateQueries({ queryKey: ['binder', user.id, binderId] });
    queryClient.invalidateQueries({ queryKey: ['binders', user.id] });
  };
}

/**
 * Set (or clear, with `color: null`) a binder page's solid background colour.
 * A page has at most one background, so any existing background rows on the page
 * (`replaceMediaIds`) are removed first — page colour and a background photo are
 * mutually exclusive.
 */
export function useSetPageColor() {
  const addMedia = useAddBinderMedia();
  const removeMedia = useRemoveBinderMedia();
  return async (
    binderId: string,
    pageNum: number,
    color: string | null,
    replaceMediaIds: string[],
  ): Promise<void> => {
    for (const id of replaceMediaIds) await removeMedia(binderId, id);
    if (color) {
      await addMedia({
        binderId,
        pageNum,
        kind: 'background',
        cellMask: 0,
        storageKey: `${PAGE_COLOR_PREFIX}${color}`,
      });
    }
  };
}

