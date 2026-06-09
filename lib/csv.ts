// CSV export + import for the user's main collection.
//
// Export: serialize CollectionEntry rows to a Vault-native CSV with the columns
// listed below. Writes to a temp file via expo-file-system and opens the share
// sheet via expo-sharing.
//
// Import: parse a CSV picked via expo-document-picker. We support our own
// export format directly (card_id present → exact match) and a "loose" mode
// where (name, set, number) is fuzzy-matched against the cards table. Rows
// that don't resolve are returned as `unresolved` so the caller can show them.

import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { supabase } from '@/lib/supabase';
import { CARD_SELECT, mapRow, SupabaseCardFull } from '@/lib/api/types';
import { CollectionEntry } from '@/lib/filters/collection';
import { Card } from '@/types';

const EXPORT_COLUMNS = [
  'card_id',
  'name',
  'set',
  'no',
  'rarity',
  'market_value',
  'acquired_price',
  'acquired_at',
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // Quote when the cell contains a delimiter, quote, or newline.
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Tiny RFC-4180-ish CSV parser. Handles quoted fields, escaped quotes, and
 *  CRLF / LF line endings. Returns rows as string arrays.  */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      cell += c; i += 1; continue;
    }
    if (c === '"') { inQuotes = true; i += 1; continue; }
    if (c === ',') { row.push(cell); cell = ''; i += 1; continue; }
    if (c === '\r') { i += 1; continue; }
    if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i += 1; continue; }
    cell += c; i += 1;
  }
  // Trailing cell + row (file may not end with \n).
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter(r => !(r.length === 1 && r[0] === ''));
}

// ─── Export ──────────────────────────────────────────────────────────────────

export function entriesToCsv(entries: CollectionEntry[]): string {
  const header = EXPORT_COLUMNS.join(',');
  const lines = entries.map(e => {
    const c = e.card;
    return [
      escapeCell(c.id),
      escapeCell(c.name),
      escapeCell(c.set),
      escapeCell(c.no),
      escapeCell(c.rarity),
      escapeCell(c.value),
      escapeCell(e.acquired_price ?? ''),
      escapeCell(e.acquired_at ? new Date(e.acquired_at).toISOString().slice(0, 10) : ''),
    ].join(',');
  });
  return [header, ...lines].join('\n') + '\n';
}

/**
 * Writes the CSV to a temp file and opens the system share sheet.
 * Returns the file path on success; throws if sharing isn't available.
 */
export async function shareCollectionCsv(entries: CollectionEntry[]): Promise<string> {
  const csv = entriesToCsv(entries);
  const filename = `vault-collection-${new Date().toISOString().slice(0, 10)}.csv`;
  const file = new File(Paths.cache, filename);
  // create({ overwrite }) preps the inode; write() then fills it.
  file.create({ overwrite: true });
  file.write(csv);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    dialogTitle: 'Export Vault collection',
    UTI: 'public.comma-separated-values-text',
  });
  return file.uri;
}

// ─── Import ──────────────────────────────────────────────────────────────────

export interface ImportRow {
  rawIndex: number;
  card_id?: string;
  name?: string;
  set?: string;
  no?: string;
  acquired_price?: number | null;
}

export interface ImportResolution {
  resolved:   { row: ImportRow; card: Card }[];
  unresolved: { row: ImportRow; reason: string }[];
}

const HEADER_ALIASES: Record<string, string> = {
  // Vault native
  card_id:        'card_id',
  name:           'name',
  set:            'set',
  no:             'no',
  acquired_price: 'acquired_price',
  // Common TCGplayer / Collectr exports
  'product name':         'name',
  'set name':             'set',
  'card number':          'no',
  'card #':               'no',
  '#':                    'no',
  'number':               'no',
  'price':                'acquired_price',
  'cost':                 'acquired_price',
  'purchase price':       'acquired_price',
};

/** Pick a CSV file via the document picker. Returns null if the user cancels. */
export async function pickCsvFile(): Promise<{ name: string; uri: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', '*/*'],
    multiple: false,
    copyToCacheDirectory: true,
  });
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  return { name: asset.name, uri: asset.uri };
}

/** Reads + parses a CSV file at `uri` into normalized ImportRow records. */
export async function parseCsvFile(uri: string): Promise<ImportRow[]> {
  const text = await new File(uri).text();
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const headerRow = rows[0].map(h => h.trim().toLowerCase());
  // Map each column index to a known field (or skip).
  const fieldByCol = headerRow.map(h => HEADER_ALIASES[h] ?? null);

  const out: ImportRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    const row: ImportRow = { rawIndex: r };
    for (let c = 0; c < cols.length; c++) {
      const field = fieldByCol[c];
      if (!field) continue;
      const val = cols[c]?.trim();
      if (val === undefined || val === '') continue;
      if (field === 'acquired_price') {
        const n = Number(val.replace(/[$,]/g, ''));
        row.acquired_price = Number.isFinite(n) ? n : null;
      } else {
        (row as unknown as Record<string, string>)[field] = val;
      }
    }
    if (row.card_id || row.name) out.push(row);
  }
  return out;
}

/**
 * Resolve each import row to a real card. Strategy:
 *   1. If card_id present → single lookup in the cards table.
 *   2. Else try (name + set + no). Set is fuzzy-matched on expansion name.
 * Returns a partition of resolved (with Card payload) and unresolved (with
 * the reason it didn't match).
 */
export async function resolveImportRows(rows: ImportRow[]): Promise<ImportResolution> {
  const resolved:   { row: ImportRow; card: Card }[]                  = [];
  const unresolved: { row: ImportRow; reason: string }[]              = [];

  // Group by strategy to batch DB calls.
  const withIds   = rows.filter(r => r.card_id);
  const withMeta  = rows.filter(r => !r.card_id && r.name);

  // (1) ID-based lookups in a single in() query.
  if (withIds.length > 0) {
    const ids = withIds.map(r => r.card_id!).filter(Boolean);
    const { data, error } = await supabase
      .from('cards')
      .select(CARD_SELECT)
      .in('id', ids);
    if (error) {
      // If the bulk lookup fails, surface every row as unresolved.
      for (const r of withIds) unresolved.push({ row: r, reason: error.message });
    } else {
      const byId = new Map<string, SupabaseCardFull>();
      for (const row of (data ?? []) as unknown as SupabaseCardFull[]) {
        byId.set((row as { id: string }).id, row);
      }
      for (const r of withIds) {
        const supRow = byId.get(r.card_id!);
        if (supRow) resolved.push({ row: r, card: mapRow(supRow) });
        else unresolved.push({ row: r, reason: 'card_id not found' });
      }
    }
  }

  // (2) Fuzzy matches — one query per row. Could be optimized, but import is
  // a one-time operation so simplicity wins.
  for (const r of withMeta) {
    let q = supabase.from('cards').select(CARD_SELECT).ilike('name', r.name!);
    if (r.no)  q = q.eq('printed_number', r.no);
    if (r.set) q = q.ilike('expansions.name', `%${r.set}%`);
    const { data, error } = await q.limit(1);
    if (error) { unresolved.push({ row: r, reason: error.message }); continue; }
    const rowArr = (data ?? []) as unknown as SupabaseCardFull[];
    if (rowArr.length === 0) {
      unresolved.push({ row: r, reason: 'no card matched (name + set + number)' });
      continue;
    }
    resolved.push({ row: r, card: mapRow(rowArr[0]) });
  }

  return { resolved, unresolved };
}
