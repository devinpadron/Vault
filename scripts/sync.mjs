#!/usr/bin/env node
/**
 * PokeVault Weekly Sync
 *
 * Phase 1 — Remove TCG Pocket cards (digital-only)
 * Phase 2 — Sync all TCGDex physical sets into Supabase
 * Phase 3 — Fill missing images via pokemontcg.io
 *
 * Usage:
 *   node sync.mjs                  # full sync
 *   node sync.mjs --dry-run        # preview, no DB writes
 *   node sync.mjs --verbose        # per-card detail
 *   node sync.mjs --phase 3        # run one phase only (1, 2, or 3)
 *   node sync.mjs --set swsh1      # Phase 2 for one set (debug)
 */

import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────
// Env
// ─────────────────────────────────────────────────────────────

function loadDotenv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!Object.hasOwn(process.env, key)) process.env[key] = val;
  }
}

loadDotenv(join(__dirname, '.env'));

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? '';
const PTCGIO_KEY   = process.env.PTCGIO_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in scripts/.env');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────

const argv      = process.argv.slice(2);
const DRY_RUN   = argv.includes('--dry-run');
const VERBOSE   = argv.includes('--verbose');
const SET_FILTER = argv.includes('--set') ? argv[argv.indexOf('--set') + 1] : null;
const PHASE_ARG  = argv.includes('--phase') ? argv[argv.indexOf('--phase') + 1] : null;
const RUN_PHASES = PHASE_ARG
  ? new Set(PHASE_ARG.split(',').map(Number))
  : new Set([1, 2, 3]);

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

const TABLE        = 'pokemon_cards';
const TCGDEX_BASE  = 'https://api.tcgdex.net/v2/en';
const TCGDEX_CDN   = 'https://assets.tcgdex.net/en';
const PTCGIO_BASE  = 'https://api.pokemontcg.io/v2';
const PTCGIO_HDR   = PTCGIO_KEY ? { 'X-Api-Key': PTCGIO_KEY } : {};
const UPSERT_BATCH = 150;
const SYNC_CONCUR  = 20;  // parallel card-detail fetches (Phase 2)
const IMG_CONCUR   = 5;   // parallel image lookups (Phase 3)

const RARITY_VARIANTS = {
  'Special Illustration Rare': 'EX ★', 'Hyper Rare': '★★',
  'Shiny Ultra Rare': 'Shiny ★',       'Illustration Rare': '★',
  'Ultra Rare': 'V',                   'Double Rare': 'ex',
  'VMAX Rare': 'VMAX',                 'VSTAR Rare': 'VSTAR',
  'Amazing Rare': '★A',                'Radiant Rare': 'Radiant',
  'Shiny Rare': 'Shiny',              'ACE SPEC Rare': 'ACE',
  'Rare Holo': 'Holo',               'Rare': '—',
  'Uncommon': '—',                   'Common': '—',
};

// ─────────────────────────────────────────────────────────────
// Supabase client
// ─────────────────────────────────────────────────────────────

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─────────────────────────────────────────────────────────────
// Shared utilities
// ─────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJSON(url, headers = {}, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    } catch {
      if (attempt === retries) return null;
      await sleep(500 * attempt);
      continue;
    }
    if (res.status === 404) return null;
    if (res.status === 429) {
      const wait = parseInt(res.headers.get('Retry-After') ?? '60', 10) * 1000;
      process.stdout.write(`\n  [rate limit] waiting ${wait / 1000}s... `);
      await sleep(wait);
      continue;
    }
    if (!res.ok) {
      if (attempt === retries) return null;
      await sleep(600 * attempt);
      continue;
    }
    return res.json().catch(() => null);
  }
  return null;
}

async function headOk(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8_000) });
    return res.ok;
  } catch { return false; }
}

async function withConcurrency(items, fn, limit) {
  const results = new Array(items.length);
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (idx < items.length) {
        const i = idx++;
        try { results[i] = await fn(items[i], i); }
        catch (err) { results[i] = { _err: err.message }; }
      }
    }),
  );
  return results;
}

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─────────────────────────────────────────────────────────────
// Phase 1 — Remove TCG Pocket cards
// ─────────────────────────────────────────────────────────────

async function phase1() {
  console.log('\n── Phase 1: Remove TCG Pocket cards ─────────────────────');

  const { count } = await db
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('set_series', 'Pokémon TCG Pocket');

  if (!count) {
    console.log('  No Pocket cards in DB.');
    return;
  }

  if (DRY_RUN) {
    console.log(`  [dry-run] Would delete ${count} Pocket cards.`);
    return;
  }

  const { error } = await db.from(TABLE).delete().eq('set_series', 'Pokémon TCG Pocket');
  if (error) throw new Error(`Phase 1 delete failed: ${error.message}`);
  console.log(`  Deleted ${count} Pocket cards.`);
}

// ─────────────────────────────────────────────────────────────
// Phase 2 — Sync TCGDex sets
// ─────────────────────────────────────────────────────────────

function buildRow(card, set, imageUrl, imageSource) {
  const total      = set.cardCount?.official ?? set.cardCount?.total ?? 0;
  const cardNumber = total > 0 ? `${card.localId}/${total}` : String(card.localId ?? '?');
  return {
    id:                    card.id,
    name:                  card.name ?? 'Unknown',
    image_url:             imageUrl,
    artist:                card.illustrator ?? null,
    set_id:                set.id,
    set_name:              set.name ?? 'Unknown Set',
    set_series:            set.serie?.name ?? null,
    release_date:          set.releaseDate ?? null,
    card_number:           cardNumber,
    rarity:                card.rarity ?? null,
    variant:               card.suffix ?? RARITY_VARIANTS[card.rarity] ?? null,
    category:              card.category ?? null,
    hp:                    card.hp ?? null,
    types:                 Array.isArray(card.types) ? card.types : null,
    description:           card.description ?? null,
    variant_first_edition: card.variants?.firstEdition ?? false,
    variant_holo:          card.variants?.holo ?? false,
    variant_normal:        card.variants?.normal ?? false,
    variant_reverse:       card.variants?.reverse ?? false,
    variant_wpromo:        card.variants?.wPromo ?? false,
    image_source:          imageSource,
    language:              'en',
    updated_at:            new Date().toISOString(),
  };
}

async function syncSet(setData, ptcgHeaders) {
  const briefs = setData.cards ?? [];
  if (!briefs.length) return { rows: [], errors: 0 };

  const fullCards = await withConcurrency(
    briefs,
    b => fetchJSON(`${TCGDEX_BASE}/cards/${b.id}`),
    SYNC_CONCUR,
  );

  const rows = [];
  const needPtcg = [];
  let errors = 0;

  for (const card of fullCards) {
    if (!card || card._err) { errors++; continue; }
    const imageUrl = card.image ? `${card.image}/high.webp` : null;
    if (imageUrl) {
      rows.push(buildRow(card, setData, imageUrl, 'tcgdex'));
    } else {
      needPtcg.push({ card, idx: rows.length });
      rows.push(null);
    }
  }

  if (needPtcg.length) {
    await withConcurrency(needPtcg, async ({ card, idx }) => {
      const q = `name:"${card.name}" set.name:"${setData.name}"`;
      const data = await fetchJSON(
        `${PTCGIO_BASE}/cards?q=${encodeURIComponent(q)}&pageSize=1&select=images`,
        ptcgHeaders,
      );
      const url = data?.data?.[0]?.images?.large ?? null;
      rows[idx] = buildRow(card, setData, url, url ? 'ptcgio' : 'none');
    }, 5);
  }

  return { rows: rows.filter(Boolean), errors };
}

async function phase2() {
  console.log('\n── Phase 2: Sync TCGDex sets ─────────────────────────────');

  const ptcgHeaders = PTCGIO_KEY ? { 'X-Api-Key': PTCGIO_KEY } : {};

  // Fetch all TCGDex sets
  const allSets = await fetchJSON(`${TCGDEX_BASE}/sets`);
  if (!Array.isArray(allSets)) throw new Error('Failed to fetch TCGDex set list');

  // Fetch which set_ids are already in Supabase
  const { data: existing } = await db.from(TABLE).select('set_id').order('set_id');
  const syncedIds = new Set((existing ?? []).map(r => r.set_id));

  // Filter: skip Pocket, skip already-synced, apply optional set filter
  const pending = allSets.filter(s =>
    !syncedIds.has(s.id) &&
    (!SET_FILTER || s.id === SET_FILTER),
  );

  console.log(`  ${allSets.length} sets total, ${syncedIds.size} already in DB, ${pending.length} pending.`);
  if (!pending.length) { console.log('  Nothing to sync.'); return 0; }

  let totalCards = 0, totalErrors = 0, setsSkipped = 0;

  for (let si = 0; si < pending.length; si++) {
    const brief = pending[si];
    const label = `[${si + 1}/${pending.length}] ${brief.name} (${brief.id})`;

    const setData = await fetchJSON(`${TCGDEX_BASE}/sets/${brief.id}`);
    if (!setData) { console.log(`  ${label} — fetch failed, skipping`); continue; }

    // Skip TCG Pocket series
    if (setData.serie?.id === 'tcgp') {
      if (VERBOSE) console.log(`  ${label} — SKIP (TCG Pocket)`);
      setsSkipped++;
      continue;
    }

    process.stdout.write(`  ${label} — ${setData.cards?.length ?? 0} cards... `);

    if (DRY_RUN) { console.log('[dry-run]'); continue; }

    const { rows, errors } = await syncSet(setData, ptcgHeaders);

    for (const batch of chunks(rows, UPSERT_BATCH)) {
      const { error } = await db.from(TABLE).upsert(batch, { onConflict: 'id' });
      if (error) throw new Error(`Upsert failed: ${error.message}`);
    }

    const ptcgCount = rows.filter(r => r.image_source === 'ptcgio').length;
    const noImg     = rows.filter(r => !r.image_url).length;
    const note      = [ptcgCount && `${ptcgCount} ptcgio`, noImg && `${noImg} no image`].filter(Boolean).join(', ');
    console.log(`✓ ${rows.length} upserted${note ? ` (${note})` : ''}`);

    totalCards  += rows.length;
    totalErrors += errors;
  }

  console.log(`\n  Synced: ${totalCards} cards across ${pending.length - setsSkipped} sets. Errors: ${totalErrors}.`);
  return totalCards;
}

// ─────────────────────────────────────────────────────────────
// Phase 3 — Fix missing images
// ─────────────────────────────────────────────────────────────

// Cache: tcgdex_set_id → { serieId, ptcgSetId }
const setInfoCache = new Map();

async function getSetInfo(setId, setName) {
  if (setInfoCache.has(setId)) return setInfoCache.get(setId);

  const [tcgSet, ptcgDirect, ptcgByName] = await Promise.all([
    fetchJSON(`${TCGDEX_BASE}/sets/${setId}`),
    fetchJSON(`${PTCGIO_BASE}/sets/${setId}?select=id`, PTCGIO_HDR),
    fetchJSON(
      `${PTCGIO_BASE}/sets?q=${encodeURIComponent(`name:"${setName}"`)}&select=id`,
      PTCGIO_HDR,
    ),
  ]);

  const info = {
    serieId:   tcgSet?.serie?.id ?? null,
    ptcgSetId: ptcgDirect?.data?.id ?? ptcgByName?.data?.[0]?.id ?? null,
  };
  setInfoCache.set(setId, info);
  return info;
}

function extractLocalId(cardNumber, cardId) {
  if (cardNumber && cardNumber !== '?') return cardNumber.split('/')[0];
  const parts = cardId.split('-');
  return parts[parts.length - 1];
}

async function lookupImage(card) {
  const { id, name, set_id, set_name, card_number } = card;
  const localId = extractLocalId(card_number, id);
  const { serieId, ptcgSetId } = await getSetInfo(set_id, set_name);

  // Strategy 1: TCGDex CDN URL (HEAD verify)
  if (serieId) {
    const cdnUrl = `${TCGDEX_CDN}/${serieId}/${set_id}/${localId}/high.webp`;
    if (await headOk(cdnUrl)) return { url: cdnUrl, source: 'tcgdex', s: 1 };
  }

  // Strategy 2: pokemontcg.io direct (same set ID + card number variants)
  if (ptcgSetId) {
    const stripped  = String(parseInt(localId, 10));
    const noSuffix  = localId.replace(/[A-Za-z]+$/, '');
    const variants  = [...new Set([localId, stripped, noSuffix].filter(v => v && v !== 'NaN'))];

    for (const v of variants) {
      const data = await fetchJSON(`${PTCGIO_BASE}/cards/${ptcgSetId}-${v}?select=images`, PTCGIO_HDR);
      const url  = data?.data?.images?.large ?? null;
      if (url) return { url, source: 'ptcgio', s: 2 };
    }
  }

  // Strategy 3: pokemontcg.io name + set search
  const setQ   = ptcgSetId ? `name:"${name}" set.id:"${ptcgSetId}"` : `name:"${name}" set.name:"${set_name}"`;
  const search = await fetchJSON(`${PTCGIO_BASE}/cards?q=${encodeURIComponent(setQ)}&pageSize=3&select=images`, PTCGIO_HDR);
  const sUrl   = search?.data?.[0]?.images?.large ?? null;
  if (sUrl) return { url: sUrl, source: 'ptcgio', s: 3 };

  return null;
}

const STRAT = { 1: 'tcgdex-cdn', 2: 'ptcgio-direct', 3: 'ptcgio-search' };

async function phase3() {
  console.log('\n── Phase 3: Fix missing images ───────────────────────────');

  const { count } = await db
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .is('image_url', null);

  console.log(`  Cards with no image: ${count}`);
  if (!count) { console.log('  Nothing to fix.'); return 0; }

  // Pre-load set info for all affected sets (minimises redundant API calls)
  const { data: affectedSets } = await db
    .from(TABLE)
    .select('set_id, set_name')
    .is('image_url', null);

  const uniqueSets = [...new Map((affectedSets ?? []).map(r => [r.set_id, r])).values()];
  process.stdout.write(`  Pre-loading ${uniqueSets.length} set info records... `);
  await withConcurrency(uniqueSets, ({ set_id, set_name }) => getSetInfo(set_id, set_name), 8);
  console.log('done\n');

  let offset = 0, processed = 0;
  const tally = { fixed: 0, noMatch: 0, errors: 0, byStrategy: { 1: 0, 2: 0, 3: 0 } };

  while (processed < count) {
    const { data: batch, error } = await db
      .from(TABLE)
      .select('id, name, set_id, set_name, card_number')
      .is('image_url', null)
      .range(offset, offset + 499)
      .order('set_id').order('id');

    if (error) throw new Error(`Phase 3 query: ${error.message}`);
    if (!batch?.length) break;

    await withConcurrency(batch, async (card, bi) => {
      const n = processed + bi + 1;
      if (VERBOSE) process.stdout.write(`  [${n}/${count}] ${card.name} (${card.set_id})... `);

      let result = null;
      try { result = await lookupImage(card); }
      catch (err) { tally.errors++; if (VERBOSE) console.log(`ERROR: ${err.message}`); return; }

      if (!result) {
        tally.noMatch++;
        if (VERBOSE) console.log('✗ no match');
        return;
      }

      if (!DRY_RUN) {
        const { error: upErr } = await db
          .from(TABLE)
          .update({ image_url: result.url, image_source: result.source, language: 'en', updated_at: new Date().toISOString() })
          .eq('id', card.id);
        if (upErr) { tally.errors++; if (VERBOSE) console.log(`ERROR: ${upErr.message}`); return; }
      }

      tally.fixed++;
      tally.byStrategy[result.s]++;
      if (VERBOSE) console.log(`✓ ${STRAT[result.s]}`);
    }, IMG_CONCUR);

    processed += batch.length;
    offset    += batch.length;
  }

  const { 1: s1, 2: s2, 3: s3 } = tally.byStrategy;
  console.log(`  Fixed: ${tally.fixed} (cdn:${s1} direct:${s2} search:${s3})  No match: ${tally.noMatch}  Errors: ${tally.errors}`);
  return tally.fixed;
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  const start = Date.now();

  console.log('╔══════════════════════════════════════════╗');
  console.log('║   PokeVault Weekly Sync                  ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`  Date    : ${new Date().toISOString().slice(0, 10)}`);
  console.log(`  Phases  : ${[...RUN_PHASES].join(', ')}`);
  console.log(`  Dry run : ${DRY_RUN ? 'yes' : 'no'}`);
  console.log(`  ptcgio  : ${PTCGIO_KEY ? 'key set' : 'no key (free tier)'}`);

  if (RUN_PHASES.has(1)) await phase1();
  if (RUN_PHASES.has(2)) await phase2();
  if (RUN_PHASES.has(3)) await phase3();

  const secs = Math.round((Date.now() - start) / 1000);
  console.log(`\n  Done in ${Math.floor(secs / 60)}m ${secs % 60}s.`);
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
