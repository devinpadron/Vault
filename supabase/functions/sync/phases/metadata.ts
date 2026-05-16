// Phase: metadata
// Syncs one expansion's static data: expansions, cards, card_images,
// card_variants, and an initial card_prices_current snapshot.
//
// One invocation handles one expansion + one page of its cards.
// Chain calls by incrementing cardPage until nextCardPage is null.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { ScrydexClient, ScrydexCardBrief, ScrydexVariant } from '../scrydex.ts';

export interface MetadataOpts {
  expansionId: string;
  cardPage?: number;
  cardPageSize?: number;
  force?: boolean; // skip staleness check
}

export interface MetadataResult {
  expansionId: string;
  cardPage: number;
  cardCount: number;
  nextCardPage: number | null;
}

const CARD_PAGE_SIZE = 100;

export async function syncMetadata(
  supabase: SupabaseClient,
  scrydex: ScrydexClient,
  opts: MetadataOpts,
): Promise<MetadataResult> {
  const { expansionId, cardPage = 1, cardPageSize = CARD_PAGE_SIZE, force = false } = opts;

  // ── Staleness check ────────────────────────────────────────────────────────
  if (!force) {
    const { data: policy } = await supabase
      .from('cache_refresh_policy')
      .select('max_age_seconds')
      .eq('resource', 'cards')
      .maybeSingle();

    const { data: exp } = await supabase
      .from('expansions')
      .select('synced_at')
      .eq('id', expansionId)
      .maybeSingle();

    if (exp?.synced_at && policy?.max_age_seconds) {
      const ageSeconds = (Date.now() - new Date(exp.synced_at).getTime()) / 1000;
      if (ageSeconds < policy.max_age_seconds) {
        return { expansionId, cardPage, cardCount: 0, nextCardPage: null };
      }
    }
  }

  // ── Fetch cards for this expansion page ────────────────────────────────────
  const resp = await scrydex.listExpansionCards(
    expansionId,
    cardPage,
    cardPageSize,
    true, // include prices
  );

  if (resp.data.length === 0) {
    return { expansionId, cardPage, cardCount: 0, nextCardPage: null };
  }

  const cards = resp.data;
  const expansion = cards[0].expansion;

  // ── Upsert expansion ───────────────────────────────────────────────────────
  await supabase.from('expansions').upsert(
    {
      id:            expansion.id,
      name:          expansion.name,
      series:        expansion.series ?? null,
      code:          expansion.code ?? null,
      total:         expansion.total ?? null,
      printed_total: expansion.printed_total ?? null,
      language:      expansion.language ?? null,
      language_code: expansion.language_code ?? null,
      release_date:  expansion.release_date
        ? expansion.release_date.replace(/\//g, '-')
        : null,
      is_online_only: expansion.is_online_only ?? false,
      logo_url:       expansion.logo ?? null,
      symbol_url:     expansion.symbol ?? null,
      synced_at:      new Date().toISOString(),
    },
    { onConflict: 'id' },
  );

  // ── Upsert cards ──────────────────────────────────────────────────────────
  const cardRows = cards.map((c: ScrydexCardBrief) => ({
    id:                       c.id,
    expansion_id:             expansion.id,
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
    // Full fields available on ScrydexCardFull — absent on brief
    flavor_text:              (c as unknown as Record<string, unknown>).flavor_text as string ?? null,
    national_pokedex_numbers: (c as unknown as Record<string, unknown>).national_pokedex_numbers as number[] ?? null,
    regulation_mark:          (c as unknown as Record<string, unknown>).regulation_mark as string ?? null,
    abilities:                (c as unknown as Record<string, unknown>).abilities ?? null,
    attacks:                  (c as unknown as Record<string, unknown>).attacks ?? null,
    weaknesses:               (c as unknown as Record<string, unknown>).weaknesses ?? null,
    resistances:              (c as unknown as Record<string, unknown>).resistances ?? null,
    retreat_cost:             (c as unknown as Record<string, unknown>).retreat_cost as string[] ?? null,
    raw_payload:              c as unknown,
    synced_at:                new Date().toISOString(),
  }));

  await supabase.from('cards').upsert(cardRows, { onConflict: 'id' });

  // ── Upsert card_images ────────────────────────────────────────────────────
  const imageRows = cards.flatMap((c: ScrydexCardBrief) =>
    c.images.flatMap(img => [
      img.small  && { card_id: c.id, type: img.type, size: 'small',  url: img.small  },
      img.medium && { card_id: c.id, type: img.type, size: 'medium', url: img.medium },
      img.large  && { card_id: c.id, type: img.type, size: 'large',  url: img.large  },
    ].filter(Boolean)),
  );

  if (imageRows.length > 0) {
    await supabase.from('card_images').upsert(imageRows, { onConflict: 'card_id,type,size' });
  }

  // ── Upsert card_variants + initial prices ─────────────────────────────────
  const cardsWithVariants = cards.filter((c: ScrydexCardBrief) => c.variants && c.variants.length > 0);

  if (cardsWithVariants.length > 0) {
    // 1. Upsert variants to get their UUIDs back
    const variantRows = cardsWithVariants.flatMap((c: ScrydexCardBrief) =>
      (c.variants as ScrydexVariant[]).map(v => ({
        card_id:  c.id,
        name:     v.name,
        synced_at: new Date().toISOString(),
      })),
    );

    const { data: upsertedVariants } = await supabase
      .from('card_variants')
      .upsert(variantRows, { onConflict: 'card_id,name' })
      .select('id, name, card_id');

    if (upsertedVariants && upsertedVariants.length > 0) {
      // Build a lookup: "card_id:variant_name" → uuid
      const variantIdMap = new Map<string, string>(
        (upsertedVariants as { id: string; name: string; card_id: string }[])
          .map(v => [`${v.card_id}:${v.name}`, v.id]),
      );

      // 2. Build price rows
      const now = new Date().toISOString();
      const priceRows = cardsWithVariants.flatMap((c: ScrydexCardBrief) =>
        (c.variants as ScrydexVariant[]).flatMap(v => {
          const variantId = variantIdMap.get(`${c.id}:${v.name}`);
          if (!variantId) return [];
          return v.prices.map(p => ({
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
        await supabase.rpc('upsert_card_prices', { rows: priceRows });
      }
    }
  }

  const totalPages = Math.ceil(resp.total_count / cardPageSize);
  const nextCardPage = cardPage < totalPages ? cardPage + 1 : null;

  return { expansionId, cardPage, cardCount: cards.length, nextCardPage };
}

// ── List all expansion IDs (for orchestration) ─────────────────────────────
export async function listExpansionIds(
  scrydex: ScrydexClient,
  page = 1,
  pageSize = 100,
): Promise<{ ids: string[]; nextPage: number | null; totalCount: number }> {
  const resp = await scrydex.listExpansions(page, pageSize);
  const ids = resp.data.map(e => e.id);
  const totalPages = Math.ceil(resp.total_count / pageSize);
  return { ids, nextPage: page < totalPages ? page + 1 : null, totalCount: resp.total_count };
}
