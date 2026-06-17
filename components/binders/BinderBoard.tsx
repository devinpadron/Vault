// The interactive binder board: a horizontal paged grid of BinderPageGrid pages
// plus a drag-to-reorder overlay used in edit mode. Browsing (not editing) keeps
// the native paging FlatList; in edit mode paging-swipe is disabled and a single
// Pan gesture owns the screen — long-press a card to pick it up, drag to a slot
// (or to a screen edge to flip pages) to drop. Geometry + slot math come from
// lib/binder/{grid-geometry,reorder-model}.

import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { CardThumb } from '@/components/cards/CardThumb';
import { BinderPageGrid, RenderCell } from './BinderPageGrid';
import { BinderMediaItem, BinderItem } from '@/lib/api/binders';
import {
  CONTAINER_MARGIN,
  CONTAINER_PADDING,
  gridMetrics,
  PAGE_SIZE,
  pointToCell,
} from '@/lib/binder/grid-geometry';
import { binderPageCount, pageCellToSlot } from '@/lib/binder/reorder-model';
import { Colors, Radius } from '@/constants/theme';
import { Card } from '@/types';

const EDGE_ZONE = 52;        // px from a screen edge that triggers a page flip
const EDGE_FLIP_MS = 480;    // debounce between auto-flips
const LONG_PRESS_MS = 300;

interface Props {
  items: BinderItem[];               // ordered cards with their item ids ([] allowed)
  media: BinderMediaItem[];
  tone: [string, string];
  editing: boolean;
  activePage: number;
  onPageChange: (page: number) => void;
  onPressCard: (card: Card) => void;
  onRemoveCard: (card: Card) => void;
  /** Free-placement: set explicit slot positions for the moved (and swapped) card(s). */
  onSetPositions: (updates: { itemId: string; position: number }[]) => void;
}

export function BinderBoard({
  items, media, tone, editing,
  activePage, onPageChange,
  onPressCard, onRemoveCard, onSetPositions,
}: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const pageWidth = screenWidth;
  const m = useMemo(() => gridMetrics(screenWidth), [screenWidth]);

  const listRef = useRef<FlatList>(null);
  const boardRef = useRef<View>(null);

  // Per-page tile occupancy + background + cell→media map.
  const byPage = useMemo(() => {
    const map = new Map<number, { occ: number; background?: BinderMediaItem; cellMedia: Map<number, BinderMediaItem> }>();
    let maxPage = 0;
    for (const md of media) {
      maxPage = Math.max(maxPage, md.pageNum);
      let entry = map.get(md.pageNum);
      if (!entry) { entry = { occ: 0, cellMedia: new Map() }; map.set(md.pageNum, entry); }
      if (md.kind === 'background') {
        entry.background = md;
      } else {
        entry.occ |= md.cellMask & 0x1ff;
        for (let c = 0; c < 9; c++) if (md.cellMask & (1 << c)) entry.cellMedia.set(c, md);
      }
    }
    return { map, maxPage };
  }, [media]);

  const occupiedByPage = useCallback((p: number) => byPage.map.get(p)?.occ ?? 0, [byPage]);

  // Cards keyed by their absolute slot (position = page·9 + cell). Gaps allowed.
  const cardBySlot = useMemo(() => {
    const map = new Map<number, BinderItem>();
    for (const it of items) map.set(it.position, it);
    return map;
  }, [items]);

  const maxCardSlot = useMemo(
    () => items.reduce((mx, it) => Math.max(mx, it.position), -1),
    [items],
  );
  const pageCount = binderPageCount(maxCardSlot, byPage.maxPage);

  // Each page's 9 cells resolved to a tile slice, the card sitting in that exact
  // slot, or an empty sleeve.
  const resolvedPages: RenderCell[][] = useMemo(() => {
    const pages: RenderCell[][] = [];
    for (let p = 0; p < pageCount; p++) {
      const entry = byPage.map.get(p);
      const occ = entry?.occ ?? 0;
      const cells: RenderCell[] = [];
      for (let cell = 0; cell < PAGE_SIZE; cell++) {
        if (occ & (1 << cell)) {
          const md = entry?.cellMedia.get(cell);
          cells.push(md ? { kind: 'tile', media: md, cell } : { kind: 'card', card: null });
        } else {
          const it = cardBySlot.get(pageCellToSlot(p, cell));
          cells.push({ kind: 'card', card: it?.card ?? null, itemId: it?.itemId });
        }
      }
      pages.push(cells);
    }
    return pages;
  }, [pageCount, byPage, cardBySlot]);

  // ── Drag state (shared values) ──────────────────────────────────────────
  const dragging = useSharedValue(0);     // 0/1
  const dragAbsX = useSharedValue(0);
  const dragAbsY = useSharedValue(0);
  const boardX = useSharedValue(0);
  const boardY = useSharedValue(0);
  const gridWinY = useSharedValue(0);
  const activePageSV = useSharedValue(activePage);
  activePageSV.value = activePage;

  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [previewCard, setPreviewCard] = useState<Card | null>(null);
  const flipArmed = useRef(false);

  const measureBoard = useCallback(() => {
    boardRef.current?.measureInWindow((x, y) => {
      boardX.value = x;
      boardY.value = y;
      // Grid content top = board top + container border(1) + padding.
      gridWinY.value = y + CONTAINER_PADDING + 1;
    });
  }, [boardX, boardY, gridWinY]);

  // (page, cell) for a window point, using the active page (paging is locked
  // while dragging so the visible page == activePage).
  const cellAtPoint = useCallback((absX: number, absY: number): number => {
    const localX = absX - (CONTAINER_MARGIN + CONTAINER_PADDING);
    const localY = absY - gridWinY.value;
    return pointToCell(localX, localY, m);
  }, [m, gridWinY]);

  const beginDrag = useCallback((absX: number, absY: number) => {
    const page = activePageSV.value;
    const cell = cellAtPoint(absX, absY);
    if (cell < 0) return;
    const occ = occupiedByPage(page);
    if (occ & (1 << cell)) return;                 // tile cell — not grabbable
    const it = cardBySlot.get(pageCellToSlot(page, cell));
    if (!it) return;                               // empty cell — nothing to grab
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    dragging.value = 1;
    setDraggingItemId(it.itemId);
    setPreviewCard(it.card);
    setScrollEnabled(false);
  }, [activePageSV, cellAtPoint, occupiedByPage, cardBySlot, dragging]);

  const flipPage = useCallback((dir: -1 | 1) => {
    const next = Math.max(0, Math.min(pageCount - 1, activePageSV.value + dir));
    if (next === activePageSV.value) return;
    listRef.current?.scrollToIndex({ index: next, animated: true });
    onPageChange(next);
  }, [pageCount, activePageSV, onPageChange]);

  const maybeEdgeFlip = useCallback((absX: number) => {
    if (flipArmed.current) return;
    const dir: -1 | 1 | 0 =
      absX < EDGE_ZONE ? -1 : absX > screenWidth - EDGE_ZONE ? 1 : 0;
    if (dir === 0) return;
    flipArmed.current = true;
    flipPage(dir);
    setTimeout(() => { flipArmed.current = false; }, EDGE_FLIP_MS);
  }, [screenWidth, flipPage]);

  const endDrag = useCallback((absX: number, absY: number) => {
    const itemId = draggingItemId;
    dragging.value = 0;
    setDraggingItemId(null);
    setPreviewCard(null);
    setScrollEnabled(true);
    if (!itemId) return;
    const page = activePageSV.value;
    const cell = cellAtPoint(absX, absY);
    if (cell < 0) return;
    const occ = occupiedByPage(page);
    if (occ & (1 << cell)) return;                 // dropped on a tile — cancel
    const dragged = items.find(i => i.itemId === itemId);
    if (!dragged) return;
    const targetSlot = pageCellToSlot(page, cell);
    if (dragged.position === targetSlot) return;   // dropped on itself
    const occupant = cardBySlot.get(targetSlot);
    // Empty cell → move there (leaving a gap behind). Occupied → swap the two
    // cards' slots. Either way only the affected card(s) move; gaps are kept.
    const updates = occupant && occupant.itemId !== itemId
      ? [{ itemId, position: targetSlot }, { itemId: occupant.itemId, position: dragged.position }]
      : [{ itemId, position: targetSlot }];
    Haptics.selectionAsync();
    onSetPositions(updates);
  }, [draggingItemId, dragging, activePageSV, cellAtPoint, occupiedByPage, items, cardBySlot, onSetPositions]);

  const pan = useMemo(() => Gesture.Pan()
    .enabled(editing)
    .activateAfterLongPress(LONG_PRESS_MS)
    .onStart(e => { runOnJS(beginDrag)(e.absoluteX, e.absoluteY); })
    .onUpdate(e => {
      dragAbsX.value = e.absoluteX;
      dragAbsY.value = e.absoluteY;
      if (dragging.value === 1) runOnJS(maybeEdgeFlip)(e.absoluteX);
    })
    .onEnd(e => { runOnJS(endDrag)(e.absoluteX, e.absoluteY); })
    .onFinalize(() => {
      if (dragging.value === 1) {
        dragging.value = 0;
        runOnJS(setDraggingItemId)(null);
        runOnJS(setPreviewCard)(null);
        runOnJS(setScrollEnabled)(true);
      }
    }),
    [editing, beginDrag, endDrag, maybeEdgeFlip, dragAbsX, dragAbsY, dragging],
  );

  const previewStyle = useAnimatedStyle(() => ({
    opacity: dragging.value,
    transform: [
      { translateX: dragAbsX.value - boardX.value - m.thumbWidth / 2 },
      { translateY: dragAbsY.value - boardY.value - m.thumbHeight / 2 },
      { scale: withSpring(dragging.value ? 1.06 : 1, { damping: 16, stiffness: 200 }) },
    ],
  }));

  return (
    <View ref={boardRef} onLayout={measureBoard} style={styles.root}>
      <GestureDetector gesture={pan}>
        <FlatList
          ref={listRef}
          data={resolvedPages}
          keyExtractor={(_, i) => `page-${i}`}
          horizontal
          pagingEnabled
          scrollEnabled={scrollEnabled}
          showsHorizontalScrollIndicator={false}
          getItemLayout={(_, i) => ({ length: pageWidth, offset: pageWidth * i, index: i })}
          onMomentumScrollEnd={e => {
            const i = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
            onPageChange(Math.max(0, Math.min(pageCount - 1, i)));
          }}
          renderItem={({ item: cells, index }) => {
            const entry = byPage.map.get(index);
            return (
              <BinderPageGrid
                cells={cells}
                background={entry?.background ?? null}
                tone={tone}
                screenWidth={screenWidth}
                pageWidth={pageWidth}
                editing={editing}
                draggingItemId={draggingItemId}
                onPressCard={onPressCard}
                onRemoveCard={(c) => c.card && onRemoveCard(c.card)}
              />
            );
          }}
        />
      </GestureDetector>

      {/* Floating drag preview */}
      {previewCard && (
        <Animated.View pointerEvents="none" style={[styles.preview, previewStyle]}>
          <CardThumb card={previewCard} width={m.thumbWidth} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'relative' },
  preview: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderRadius: Radius.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 16,
    borderWidth: 1,
    borderColor: Colors.gold,
  },
});
