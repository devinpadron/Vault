// Renders a single binder page: an optional full-page background image, then a
// 3×3 grid whose cells are each a photo-tile slice, a card sleeve, or an empty
// pad. Geometry comes from lib/binder/grid-geometry so the renderer, the drag
// layer, and the tile editor all agree on cell rects.
//
// Tile slices: a tile's image is laid across the whole page content box and each
// occupied cell shows its slice (offset by the cell's position), so a scattered
// / L-shaped tile composites into one continuous photo.

import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { CardThumb } from '@/components/cards/CardThumb';
import { Icon } from '@/components/ui/Icon';
import { BinderMediaItem } from '@/lib/api/binders';
import {
  cellRowCol,
  gridMetrics,
  maskBounds,
  NUM_COLS,
  COL_GAP,
  SLEEVE_PADDING,
} from '@/lib/binder/grid-geometry';
import { Colors, FontFamily, Radius } from '@/constants/theme';
import { Card } from '@/types';

export type RenderCell =
  | { kind: 'tile'; media: BinderMediaItem; cell: number }
  | { kind: 'card'; card: Card | null; itemId?: string };

interface Props {
  cells: RenderCell[];            // exactly 9
  background?: BinderMediaItem | null;
  tone: [string, string];
  screenWidth: number;
  pageWidth: number;             // width of the page container (paging width)
  editing?: boolean;
  /** Item id currently being dragged — its sleeve renders empty (the floating
   *  preview stands in for it). */
  draggingItemId?: string | null;
  onPressCard?: (card: Card) => void;
  onRemoveCard?: (cell: RenderCell & { kind: 'card' }) => void;
  /** Reports the grid content box's window Y once measured (for hit-testing). */
  onGridLayout?: (e: import('react-native').LayoutChangeEvent) => void;
}

export const BinderPageGrid = memo(function BinderPageGrid({
  cells, background, tone, screenWidth, pageWidth,
  editing = false, draggingItemId = null,
  onPressCard, onRemoveCard, onGridLayout,
}: Props) {
  const m = gridMetrics(screenWidth);
  const isEmpty = cells.every(c => c.kind === 'card' && c.card == null) && !background;

  return (
    <View style={{ width: pageWidth }}>
      <View style={[styles.sleeveContainer, { marginHorizontal: 18 }]}>
        <LinearGradient
          colors={tone}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {background && (
          <Image
            source={{ uri: background.url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={background.id}
          />
        )}

        {isEmpty ? (
          <View style={styles.emptyGrid}>
            <Text style={styles.emptyTitle}>No cards yet</Text>
            <Text style={styles.emptySubtitle}>Tap + to add cards</Text>
          </View>
        ) : (
          <View style={styles.grid} onLayout={onGridLayout}>
            {[0, 1, 2].map(rowIdx => (
              <View
                key={rowIdx}
                style={[styles.gridRow, rowIdx < 2 && { marginBottom: COL_GAP }]}
              >
                {cells
                  .slice(rowIdx * NUM_COLS, rowIdx * NUM_COLS + NUM_COLS)
                  .map((cell, colIdx) => (
                    <Cell
                      key={colIdx}
                      cell={cell}
                      m={m}
                      editing={editing}
                      draggingItemId={draggingItemId}
                      onPressCard={onPressCard}
                      onRemoveCard={onRemoveCard}
                    />
                  ))}
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
});

function Cell({
  cell, m, editing, draggingItemId, onPressCard, onRemoveCard,
}: {
  cell: RenderCell;
  m: ReturnType<typeof gridMetrics>;
  editing: boolean;
  draggingItemId: string | null;
  onPressCard?: (card: Card) => void;
  onRemoveCard?: (cell: RenderCell & { kind: 'card' }) => void;
}) {
  const sleeveBox = { width: m.sleeveW, height: m.sleeveH };

  if (cell.kind === 'tile') {
    const { row, col } = cellRowCol(cell.cell);
    // 'bbox' (grid/block) fits the whole photo into the selection's bounding
    // rectangle; default ('page') windows a page-sized image (mosaic slices).
    const isBlock = cell.media.transform?.fitMode === 'bbox';
    let imgW: number, imgH: number, imgLeft: number, imgTop: number;
    if (isBlock) {
      const b = maskBounds(cell.media.cellMask);
      imgW = b.cols * m.sleeveW + (b.cols - 1) * COL_GAP;
      imgH = b.rows * m.sleeveH + (b.rows - 1) * COL_GAP;
      imgLeft = -((col - b.minCol) * m.cellPitchX);
      imgTop = -((row - b.minRow) * m.cellPitchY);
    } else {
      imgW = m.contentBoxW;
      imgH = m.contentBoxH;
      imgLeft = -(col * m.cellPitchX);
      imgTop = -(row * m.cellPitchY);
    }
    return (
      <View style={[styles.tileSleeve, sleeveBox]}>
        <Image
          source={{ uri: cell.media.url }}
          style={{ position: 'absolute', width: imgW, height: imgH, left: imgLeft, top: imgTop }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={cell.media.id}
        />
      </View>
    );
  }

  // card cell
  const card = cell.card;
  const isDragging = !!cell.itemId && cell.itemId === draggingItemId;

  if (!card) {
    return <View style={[styles.sleeve, sleeveBox]}><View style={styles.emptyThumb} /></View>;
  }

  return (
    <View style={[styles.sleeve, sleeveBox]}>
      <TouchableOpacity
        onPress={editing ? undefined : () => onPressCard?.(card)}
        activeOpacity={0.85}
        disabled={editing}
        accessibilityRole="button"
        accessibilityLabel={card.name}
        style={isDragging ? { opacity: 0 } : undefined}
      >
        <CardThumb card={card} width={m.thumbWidth} />
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.18)', 'transparent',
            'transparent', 'rgba(255,255,255,0.08)',
          ]}
          locations={[0, 0.3, 0.7, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: Radius.sm }]}
          pointerEvents="none"
        />
      </TouchableOpacity>
      {editing && !isDragging && cell.itemId && (
        <TouchableOpacity
          style={styles.removeBadge}
          onPress={() => onRemoveCard?.(cell)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityLabel={`Remove ${card.name} from binder`}
        >
          <Icon name="close" size={11} color="#0A0A0C" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sleeveContainer: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  grid: { flexDirection: 'column' },
  gridRow: { flexDirection: 'row', justifyContent: 'space-between' },
  sleeve: {
    padding: SLEEVE_PADDING,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(0,0,0,0.35)',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tileSleeve: {
    borderRadius: Radius.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  emptyThumb: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 4,
  },
  removeBadge: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.bg,
  },
  emptyGrid: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: {
    fontFamily: FontFamily.display,
    fontSize: 18,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
});
