// Free-placement binder layout. Each card occupies an explicit *slot* —
// slot = page·PAGE_SIZE + cell (cell 0..8) — so cards can sit in any cell with
// empty gaps between them. A card's `position` IS its slot. Photo tiles are
// page-pinned obstacles (a card can't share a tile's cell). Dense positions
// 0..n-1 (the legacy gap-free case) render identically — slot k == (page,cell)
// for the k-th cell — so no data migration is needed.
//
// Pure: no React, no RN, no I/O.

import { PAGE_SIZE } from './grid-geometry';

export function pageCellToSlot(page: number, cell: number): number {
  return page * PAGE_SIZE + cell;
}

export function slotToPageCell(slot: number): { page: number; cell: number } {
  return { page: Math.floor(slot / PAGE_SIZE), cell: slot % PAGE_SIZE };
}

/**
 * How many pages the binder spans: enough to show the furthest card slot and the
 * furthest decorated page. Always at least one page.
 * `maxCardSlot` is the largest card position (-1 when there are no cards);
 * `maxMediaPage` is the largest page index carrying a tile/background.
 */
export function binderPageCount(maxCardSlot: number, maxMediaPage: number): number {
  const cardPages = maxCardSlot >= 0 ? Math.floor(maxCardSlot / PAGE_SIZE) + 1 : 0;
  return Math.max(1, cardPages, maxMediaPage + 1);
}
