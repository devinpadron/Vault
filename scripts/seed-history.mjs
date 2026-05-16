/**
 * seed-history.mjs
 *
 * Backfills card_price_history from the Scrydex API for all cards that
 * already have current prices in card_prices_current.
 *
 * Run this once after seed-catalog.mjs to populate enough history for the
 * price chart sparklines to render. After that, the daily Edge Function
 * cron handles incremental appends.
 *
 * Usage:
 *   SCRYDEX_API_KEY=... SCRYDEX_TEAM_ID=... \
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node --env-file=.env seed-history.mjs [--days 90] [--batch 40]
 *
 * Options:
 *   --days   How many days back to fetch (default: 90)
 *   --batch  Cards fetched in parallel per round (default: 40)
 *            Lower this if you hit Scrydex rate limits.
 */

import { createClient } from '@supabase/supabase-js';

// ─── Config ───────────────────────────────────────────────────────────────────

const SCRYDEX_API_KEY = process.env.SCRYDEX_API_KEY ?? '';
const SCRYDEX_TEAM_ID = process.env.SCRYDEX_TEAM_ID ?? '';
const SUPABASE_URL    = process.env.SUPABASE_URL    ?? '';
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const BASE            = 'https://api.scrydex.com/pokemon/v1';

const args  = process.argv.slice(2);
const DAYS  = Number(argValue(args, '--days')  ?? 90);
const BATCH = Number(argValue(args, '--batch') ?? 40);

// ─── Validation ───────────────────────────────────────────────────────────────

if (!SCRYDEX_API_KEY || !SCRYDEX_TEAM_ID) {
  console.error('✗  SCRYDEX_API_KEY and SCRYDEX_TEAM_ID must be set.');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('✗  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Scrydex ──────────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;

async function fetchHistory(cardId) {
  // Request only NM raw history — avoids fetching LP/MP/DM/graded rows we don't store.
  const url = `${BASE}/cards/${cardId}/price_history?days=${DAYS}&condition=NM&casing=snake`;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      headers: { 'X-Api-Key': SCRYDEX_API_KEY, 'X-Team-ID': SCRYDEX_TEAM_ID, Accept: 'application/json' },
    });
    if (res.ok) return res.json();
    if (res.status === 404) return null; // card not found in Scrydex — skip
    if (res.status < 500 || attempt === MAX_RETRIES) {
      console.warn(`    ↺ Scrydex ${res.status} for ${cardId} (attempt ${attempt}) — skipping`);
      return null;
    }
    await delay(2000 * attempt);
  }
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nPokeVault history seed  ${new Date().toISOString()}`);
  console.log(`Fetching ${DAYS} days of history, ${BATCH} cards at a time\n`);

  // 1. Load all card_variants that have at least one current price, grouped by card_id.
  //    We page through card_variants in chunks of 1000 to avoid Supabase row limits.
  const variantMap = new Map(); // card_id → [{ variantId, variantName }]
  let offset = 0;
  const PAGE = 1000;

  process.stdout.write('Loading variants from DB...');
  while (true) {
    const { data, error } = await supabase
      .from('card_variants')
      .select('id, name, card_id, card_prices_current!inner(variant_id)')
      .range(offset, offset + PAGE - 1);

    if (error) throw new Error(`card_variants fetch: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (!variantMap.has(row.card_id)) variantMap.set(row.card_id, []);
      variantMap.get(row.card_id).push({ variantId: row.id, variantName: row.name });
    }

    offset += data.length;
    if (data.length < PAGE) break;
    process.stdout.write('.');
  }

  const cardIds = [...variantMap.keys()];
  console.log(`\nFound ${variantMap.size} unique cards with prices\n`);

  // 2. Fetch history for each card in parallel batches.
  let totalSnapshots = 0;
  let totalErrors = 0;

  for (let i = 0; i < cardIds.length; i += BATCH) {
    const batchIds = cardIds.slice(i, i + BATCH);
    const batchNum = Math.floor(i / BATCH) + 1;
    const totalBatches = Math.ceil(cardIds.length / BATCH);
    process.stdout.write(`  Batch ${batchNum}/${totalBatches} (cards ${i + 1}–${Math.min(i + BATCH, cardIds.length)})...`);

    const results = await Promise.all(
      batchIds.map(async cardId => {
        const resp = await fetchHistory(cardId);
        if (!resp?.data?.length) return [];

        const variants = variantMap.get(cardId) ?? [];
        // Build a lookup: variant name → UUID
        const variantIdMap = new Map(variants.map(v => [v.variantName, v.variantId]));

        const rows = [];
        for (const entry of resp.data) {
          for (const p of entry.prices ?? []) {
            // variant is a field on each price, not on the date entry
            if (p.type !== 'raw' || p.condition !== 'NM') continue;
            const variantId = variantIdMap.get(p.variant);
            if (!variantId) continue;
            rows.push({
              variant_id:    variantId,
              snapshot_date: entry.date,
              type:          'raw',
              condition:     'NM',
              grader:        '',
              grade:         '',
              is_perfect:    false,
              is_signed:     false,
              is_error:      false,
              low:           p.low    ?? null,
              market:        p.market ?? null,
              currency:      p.currency ?? 'USD',
            });
          }
        }
        return rows;
      }),
    );

    const batchRows = results.flat();
    if (batchRows.length > 0) {
      const { error } = await supabase.rpc('upsert_card_price_history', { rows: batchRows });
      if (error) {
        console.error(`\n    ✗ RPC error: ${error.message}`);
        totalErrors++;
      } else {
        totalSnapshots += batchRows.length;
      }
    }

    console.log(` ${batchRows.length} snapshots`);

    // Brief pause between batches to be polite to Scrydex
    if (i + BATCH < cardIds.length) await delay(300);
  }

  console.log(`\nDone. ${totalSnapshots.toLocaleString()} snapshots written, ${totalErrors} batch errors.`);
  if (totalSnapshots > 0) {
    console.log('Price chart sparklines will now render for cards with market history.');
  }
}

main().catch(err => {
  console.error('\n✗', err.message);
  process.exit(1);
});

// ─── Utilities ────────────────────────────────────────────────────────────────

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : null;
}
