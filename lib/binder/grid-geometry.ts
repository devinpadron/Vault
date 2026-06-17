// Pure geometry for the binder's 3×3 page grid. The single source of truth for
// cell sizing and hit-testing, shared by the renderer (BinderPageGrid), the
// drag-reorder layer, and the tile editor. All functions are worklet-safe
// (number-only, no closures over RN objects) so gesture callbacks can call them
// directly on the UI thread.
//
// These constants mirror the originals in app/binder/[id].tsx; that screen now
// imports from here so the math never drifts between render and gesture.

export const NUM_COLS = 3;
export const NUM_ROWS = 3;
export const PAGE_SIZE = 9; // 3 × 3

export const CONTAINER_MARGIN = 18;  // horizontal margin around the sleeve container, per page
export const CONTAINER_PADDING = 14; // padding inside the sleeve container
export const COL_GAP = 10;           // gap between sleeves (and rows)
export const SLEEVE_PADDING = 4;     // padding inside one sleeve, around the thumb
export const CARD_ASPECT = 1.4;      // card height ÷ width (matches CardThumb)

export interface GridMetrics {
  thumbWidth: number;  // card thumbnail width inside a sleeve
  thumbHeight: number; // card thumbnail height (thumbWidth × CARD_ASPECT)
  sleeveW: number;     // full sleeve box width  (thumbWidth + 2·SLEEVE_PADDING)
  sleeveH: number;     // full sleeve box height (thumbHeight + 2·SLEEVE_PADDING) — portrait
  cellPitchX: number;  // horizontal center-to-center step (sleeveW + COL_GAP)
  cellPitchY: number;  // vertical step (sleeveH + COL_GAP)
  contentX: number;    // x of the grid content box within a page (left sleeve's left edge)
  contentBoxW: number; // width of the 3×3 content box
  contentBoxH: number; // height of the 3×3 content box (taller — cells are portrait)
}

/** Card thumb width for a given screen width — matches the original
 *  getThumbWidth in app/binder/[id].tsx exactly. */
export function getThumbWidth(screenWidth: number): number {
  'worklet';
  const inner = screenWidth - CONTAINER_MARGIN * 2 - CONTAINER_PADDING * 2;
  const sleeveWidth = (inner - COL_GAP * (NUM_COLS - 1)) / NUM_COLS;
  return Math.floor(sleeveWidth - SLEEVE_PADDING * 2);
}

export function gridMetrics(screenWidth: number): GridMetrics {
  'worklet';
  const thumbWidth = getThumbWidth(screenWidth);
  const thumbHeight = Math.round(thumbWidth * CARD_ASPECT);
  const sleeveW = thumbWidth + SLEEVE_PADDING * 2;
  const sleeveH = thumbHeight + SLEEVE_PADDING * 2;
  const cellPitchX = sleeveW + COL_GAP;
  const cellPitchY = sleeveH + COL_GAP;
  const contentX = CONTAINER_MARGIN + CONTAINER_PADDING;
  const contentBoxW = NUM_COLS * sleeveW + (NUM_COLS - 1) * COL_GAP;
  const contentBoxH = NUM_ROWS * sleeveH + (NUM_ROWS - 1) * COL_GAP;
  return {
    thumbWidth, thumbHeight, sleeveW, sleeveH,
    cellPitchX, cellPitchY, contentX, contentBoxW, contentBoxH,
  };
}

export function cellRowCol(cell: number): { row: number; col: number } {
  'worklet';
  return { row: Math.floor(cell / NUM_COLS), col: cell % NUM_COLS };
}

export function rowColToCell(row: number, col: number): number {
  'worklet';
  return row * NUM_COLS + col;
}

/** Rect of a cell relative to the grid content box's top-left (page-local). */
export function cellRect(
  cell: number,
  m: GridMetrics,
): { x: number; y: number; w: number; h: number } {
  'worklet';
  const { row, col } = cellRowCol(cell);
  return { x: col * m.cellPitchX, y: row * m.cellPitchY, w: m.sleeveW, h: m.sleeveH };
}

/**
 * Map a point — given relative to the grid content box's top-left — to a cell
 * index, or -1 if it falls outside the 3×3. Forgiving: a point in the gutter
 * between cells still resolves to the nearer cell's column/row band (so drops
 * land even on a slightly-off finger position).
 */
/** Bounding rectangle (in cells) of a 9-bit cell mask. Empty mask → a 1×1 box
 *  at the origin. Used to fit a "grid"/block photo into its selected rectangle. */
export function maskBounds(
  mask: number,
): { minRow: number; minCol: number; rows: number; cols: number } {
  'worklet';
  let minR = NUM_ROWS, minC = NUM_COLS, maxR = -1, maxC = -1;
  for (let cell = 0; cell < PAGE_SIZE; cell++) {
    if (mask & (1 << cell)) {
      const r = Math.floor(cell / NUM_COLS);
      const c = cell % NUM_COLS;
      if (r < minR) minR = r;
      if (c < minC) minC = c;
      if (r > maxR) maxR = r;
      if (c > maxC) maxC = c;
    }
  }
  if (maxR < 0) return { minRow: 0, minCol: 0, rows: 1, cols: 1 };
  return { minRow: minR, minCol: minC, rows: maxR - minR + 1, cols: maxC - minC + 1 };
}

export function pointToCell(localX: number, localY: number, m: GridMetrics): number {
  'worklet';
  const col = Math.floor(localX / m.cellPitchX);
  const row = Math.floor(localY / m.cellPitchY);
  if (col < 0 || col >= NUM_COLS || row < 0 || row >= NUM_ROWS) return -1;
  return rowColToCell(row, col);
}
