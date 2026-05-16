/**
 * seed-catalog.mjs
 *
 * One-time full catalog import from the Scrydex API into Supabase.
 * Run this locally before the app goes live; after that, the sync Edge Function
 * handles daily incremental updates.
 *
 * Usage:
 *   SCRYDEX_API_KEY=... SCRYDEX_TEAM_ID=... \
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node seed-catalog.mjs [--language EN] [--dry-run] [--expansion sv4pt5]
 *
 * Options:
 *   --language  Filter by language_code (default: EN). Pass "all" for every language.
 *   --expansion Seed a single expansion by ID (skips the full catalog loop).
 *   --dry-run   Fetch from Scrydex but skip all Supabase writes.
 *   --verbose   Log each card as it is processed.
 */

import { createClient } from '@supabase/supabase-js';

// ─── Config ──────────────────────────────────────────────────────────────────

const SCRYDEX_API_KEY  = process.env.SCRYDEX_API_KEY  ?? '';
const SCRYDEX_TEAM_ID  = process.env.SCRYDEX_TEAM_ID  ?? '';
const SUPABASE_URL     = process.env.SUPABASE_URL     ?? '';
const SUPABASE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const BASE             = 'https://api.scrydex.com/pokemon/v1';

const args        = process.argv.slice(2);
const DRY_RUN     = args.includes('--dry-run');
const VERBOSE     = args.includes('--verbose');
const LANG_FILTER = argValue(args, '--language') ?? 'EN';
const ONLY_EXP    = argValue(args, '--expansion');

const PAGE_SIZE   = 100;
const BATCH_DELAY = 150; // ms between Scrydex requests — be polite
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // ms before retrying a 5xx

// ─── Validation ──────────────────────────────────────────────────────────────

if (!SCRYDEX_API_KEY || !SCRYDEX_TEAM_ID) {
  console.error('✗  SCRYDEX_API_KEY and SCRYDEX_TEAM_ID must be set.');
  process.exit(1);
}
if (!DRY_RUN && (!SUPABASE_URL || !SUPABASE_KEY)) {
  console.error('✗  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (or pass --dry-run).');
  process.exit(1);
}

const supabase = DRY_RUN ? null : createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Scrydex helpers ──────────────────────────────────────────────────────────

async function scrydexGet(path, params = {}) {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url.toString(), {
      headers: { 'X-Api-Key': SCRYDEX_API_KEY, 'X-Team-ID': SCRYDEX_TEAM_ID, Accept: 'application/json' },
    });
    if (res.ok) return res.json();
    // Retry on transient 5xx errors; fail fast on 4xx
    if (res.status < 500 || attempt === MAX_RETRIES) {
      throw new Error(`Scrydex ${res.status}: ${path}`);
    }
    if (VERBOSE) console.log(`    ↺ Scrydex ${res.status} on attempt ${attempt}, retrying in ${RETRY_DELAY}ms…`);
    await delay(RETRY_DELAY * attempt);
  }
}

async function* paginateExpansions() {
  let page = 1;
  while (true) {
    const resp = await scrydexGet('/expansions', { page, page_size: PAGE_SIZE, casing: 'snake' });
    for (const exp of resp.data) {
      if (LANG_FILTER !== 'all' && exp.language_code !== LANG_FILTER) continue;
      yield exp;
    }
    if (page >= Math.ceil(resp.total_count / PAGE_SIZE)) break;
    page++;
    await delay(BATCH_DELAY);
  }
}

async function* paginateExpansionCards(expansionId) {
  let page = 1;
  while (true) {
    const resp = await scrydexGet(`/expansions/${expansionId}/cards`, {
      page, page_size: PAGE_SIZE, include: 'prices', casing: 'snake',
    });
    for (const card of resp.data) yield card;
    if (page >= Math.ceil(resp.total_count / PAGE_SIZE)) break;
    page++;
    await delay(BATCH_DELAY);
  }
}

// ─── Supabase upsert helpers ──────────────────────────────────────────────────

async function upsertExpansion(exp) {
  if (DRY_RUN) return;
  const { error } = await supabase.from('expansions').upsert({
    id:            exp.id,
    name:          exp.name,
    series:        exp.series ?? null,
    code:          exp.code ?? null,
    total:         exp.total ?? null,
    printed_total: exp.printed_total ?? null,
    language:      exp.language ?? null,
    language_code: exp.language_code ?? null,
    release_date:  exp.release_date ? exp.release_date.replace(/\//g, '-') : null,
    is_online_only: exp.is_online_only ?? false,
    logo_url:       exp.logo ?? null,
    symbol_url:     exp.symbol ?? null,
    synced_at:      new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) throw new Error(`expansions upsert: ${error.message}`);
}

async function upsertCards(cards) {
  if (DRY_RUN || cards.length === 0) return;
  const rows = cards.map(c => ({
    id:                       c.id,
    expansion_id:             c.expansion.id,
    name:                     c.name,
    supertype:                c.supertype ?? null,
    subtypes:                 c.subtypes ?? null,
    types:                    c.types ?? null,
    hp:                       c.hp ?? null,
    number:                   c.number,
    printed_number:           c.printed_number ?? null,
    rarity:                   c.rarity ?? null,
    rarity_code:              c.rarity_code ?? null,
    artist:                   c.artist ?? null,
    expansion_sort_order:     c.expansion_sort_order ?? null,
    language_code:            c.language_code ?? null,
    flavor_text:              c.flavor_text ?? null,
    national_pokedex_numbers: c.national_pokedex_numbers ?? null,
    regulation_mark:          c.regulation_mark ?? null,
    abilities:                c.abilities ?? null,
    attacks:                  c.attacks ?? null,
    weaknesses:               c.weaknesses ?? null,
    resistances:              c.resistances ?? null,
    retreat_cost:             c.retreat_cost ?? null,
    converted_retreat_cost:   c.converted_retreat_cost != null
      ? parseInt(c.converted_retreat_cost, 10) || null
      : null,
    raw_payload:              c,
    synced_at:                new Date().toISOString(),
  }));
  const { error } = await supabase.from('cards').upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(`cards upsert: ${error.message}`);
}

async function upsertImages(cards) {
  if (DRY_RUN || cards.length === 0) return;
  const rows = cards.flatMap(c =>
    (c.images ?? []).flatMap(img => [
      img.small  && { card_id: c.id, type: img.type, size: 'small',  url: img.small  },
      img.medium && { card_id: c.id, type: img.type, size: 'medium', url: img.medium },
      img.large  && { card_id: c.id, type: img.type, size: 'large',  url: img.large  },
    ].filter(Boolean)),
  );
  if (rows.length === 0) return;
  const { error } = await supabase.from('card_images').upsert(rows, { onConflict: 'card_id,type,size' });
  if (error) throw new Error(`card_images upsert: ${error.message}`);
}

async function upsertVariantsAndPrices(cards) {
  if (DRY_RUN) return;
  const cardsWithVariants = cards.filter(c => c.variants?.length > 0);
  if (cardsWithVariants.length === 0) return;

  const variantRows = cardsWithVariants.flatMap(c =>
    c.variants.map(v => ({ card_id: c.id, name: v.name, synced_at: new Date().toISOString() })),
  );

  const { data: upserted, error: ve } = await supabase
    .from('card_variants')
    .upsert(variantRows, { onConflict: 'card_id,name' })
    .select('id, name, card_id');
  if (ve) throw new Error(`card_variants upsert: ${ve.message}`);

  const variantIdMap = new Map(
    (upserted ?? []).map(v => [`${v.card_id}:${v.name}`, v.id]),
  );

  const now = new Date().toISOString();
  const priceRows = cardsWithVariants.flatMap(c =>
    c.variants.flatMap(v => {
      const variantId = variantIdMap.get(`${c.id}:${v.name}`);
      if (!variantId) return [];
      return (v.prices ?? []).map(p => ({
        variant_id:       variantId,
        type:             p.type,
        condition:        p.condition || '',
        grader:           '',
        grade:            '',
        is_perfect:       p.is_perfect,
        is_signed:        p.is_signed,
        is_error:         p.is_error,
        low:              p.low ?? null,
        market:           p.market ?? null,
        mid:              null,
        high:             null,
        currency:         p.currency ?? 'USD',
        trend_1d_change:  p.trends?.days_1?.price_change ?? null,
        trend_1d_pct:     p.trends?.days_1?.percent_change ?? null,
        trend_7d_change:  p.trends?.days_7?.price_change ?? null,
        trend_7d_pct:     p.trends?.days_7?.percent_change ?? null,
        trend_30d_change: p.trends?.days_30?.price_change ?? null,
        trend_30d_pct:    p.trends?.days_30?.percent_change ?? null,
        trend_90d_change: p.trends?.days_90?.price_change ?? null,
        trend_90d_pct:    p.trends?.days_90?.percent_change ?? null,
        raw_payload:      p,
        synced_at:        now,
      }));
    }),
  );

  if (priceRows.length > 0) {
    const { error: pe } = await supabase.rpc('upsert_card_prices', { rows: priceRows });
    if (pe) throw new Error(`upsert_card_prices RPC: ${pe.message}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seedExpansion(expansion) {
  console.log(`\n  ▶ ${expansion.id}  "${expansion.name}"  (${expansion.language_code})`);
  await upsertExpansion(expansion);

  const batch = [];
  let total   = 0;

  for await (const card of paginateExpansionCards(expansion.id)) {
    batch.push(card);
    if (VERBOSE) process.stdout.write(`    ${card.id}\r`);

    if (batch.length >= 50) {
      await upsertCards(batch);
      await upsertImages(batch);
      await upsertVariantsAndPrices(batch);
      total += batch.length;
      batch.length = 0;
      process.stdout.write(`    ${total} cards written...\r`);
    }
  }

  if (batch.length > 0) {
    await upsertCards(batch);
    await upsertImages(batch);
    await upsertVariantsAndPrices(batch);
    total += batch.length;
  }

  console.log(`    ✓ ${total} cards`);
  return total;
}

async function main() {
  console.log(`\nPokeVault catalog seed  ${DRY_RUN ? '[DRY RUN] ' : ''}${new Date().toISOString()}`);

  if (ONLY_EXP) {
    // Single expansion mode — endpoint wraps in { data: {...} }
    const resp = await scrydexGet(`/expansions/${ONLY_EXP}`, { casing: 'snake' });
    await seedExpansion(resp.data ?? resp);
  } else {
    let expansionCount = 0;
    let cardCount      = 0;
    for await (const expansion of paginateExpansions()) {
      cardCount += await seedExpansion(expansion);
      expansionCount++;
      await delay(BATCH_DELAY);
    }
    console.log(`\nDone. ${expansionCount} expansions, ${cardCount} cards.`);
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
