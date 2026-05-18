/**
 * seed-listings.mjs
 *
 * Backfills card_listings from /cards/{id}/listings for every card that has
 * a current price in card_prices_current. This is the only Scrydex endpoint
 * that exposes company + grade fields, so it's the canonical source of
 * graded pricing data in this system.
 *
 * Run once after seed-catalog.mjs. After that, the daily sync Edge Function
 * keeps it warm.
 *
 * Usage:
 *   SCRYDEX_API_KEY=... SCRYDEX_TEAM_ID=... \
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node --env-file=.env seed-listings.mjs [--days 90] [--batch 25]
 *
 * Options:
 *   --days   How many days back to fetch per card (default: 90)
 *   --batch  Cards fetched in parallel per round (default: 25)
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
const BATCH = Number(argValue(args, '--batch') ?? 25);

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
const MAX_RETRIES = 3;

// ─── Scrydex ──────────────────────────────────────────────────────────────────

async function fetchListings(cardId) {
  const url = `${BASE}/cards/${cardId}/listings?days=${DAYS}&page_size=100&casing=snake`;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      headers: { 'X-Api-Key': SCRYDEX_API_KEY, 'X-Team-ID': SCRYDEX_TEAM_ID, Accept: 'application/json' },
    });
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    if (res.status < 500 || attempt === MAX_RETRIES) {
      console.warn(`    ↺ Scrydex ${res.status} for ${cardId} (attempt ${attempt}) — skipping`);
      return null;
    }
    await delay(2000 * attempt);
  }
  return null;
}

function mapRow(cardId, l) {
  return {
    id:          l.id,
    card_id:     cardId,
    source:      l.source,
    title:       l.title ?? null,
    url:         l.url ?? null,
    variant:     l.variant ?? null,
    company:     l.company ?? null,
    grade:       l.grade ?? null,
    is_perfect:  l.is_perfect ?? false,
    is_signed:   l.is_signed ?? false,
    is_error:    l.is_error ?? false,
    price:       l.price,
    currency:    l.currency ?? 'USD',
    sold_at:     l.sold_at ? l.sold_at.replace(/\//g, '-') : null,
    raw_payload: l,
    synced_at:   new Date().toISOString(),
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nPokeVault listings seed  ${new Date().toISOString()}`);
  console.log(`Fetching ${DAYS} days of sold listings, ${BATCH} cards at a time\n`);

  // Load every card that has a current price so we don't burn API calls on
  // cards Scrydex has no data on.
  const cardIds = new Set();
  let offset = 0;
  const PAGE = 1000;

  process.stdout.write('Loading cards from DB...');
  while (true) {
    const { data, error } = await supabase
      .from('cards')
      .select('id, card_variants!inner(card_prices_current!inner(variant_id))')
      .range(offset, offset + PAGE - 1);

    if (error) throw new Error(`cards fetch: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) cardIds.add(row.id);

    offset += data.length;
    if (data.length < PAGE) break;
    process.stdout.write('.');
  }

  const ids = [...cardIds];
  console.log(`\nFound ${ids.length} cards with prices\n`);

  let totalListings = 0;
  let totalErrors   = 0;

  for (let i = 0; i < ids.length; i += BATCH) {
    const batchIds = ids.slice(i, i + BATCH);
    const batchNum = Math.floor(i / BATCH) + 1;
    const totalBatches = Math.ceil(ids.length / BATCH);
    process.stdout.write(`  Batch ${batchNum}/${totalBatches} (cards ${i + 1}–${Math.min(i + BATCH, ids.length)})...`);

    const results = await Promise.all(
      batchIds.map(async cardId => {
        const resp = await fetchListings(cardId);
        if (!resp?.data?.length) return [];
        return resp.data.map(l => mapRow(cardId, l));
      }),
    );

    const rows = results.flat();
    if (rows.length > 0) {
      const { error } = await supabase
        .from('card_listings')
        .upsert(rows, { onConflict: 'id' });
      if (error) {
        console.error(`\n    ✗ upsert error: ${error.message}`);
        totalErrors++;
      } else {
        totalListings += rows.length;
      }
    }

    console.log(` ${rows.length} listings`);
    if (i + BATCH < ids.length) await delay(300);
  }

  console.log(`\nDone. ${totalListings.toLocaleString()} listings written, ${totalErrors} batch errors.`);
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
