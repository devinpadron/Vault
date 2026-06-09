// Set completion hooks. Reads the user's owned-by-set tallies from the local
// mirror, then joins against the expansions table for the totals (and logo
// art). The drill-down (missing cards) is a Supabase query — heavier, so it's
// only fetched on demand.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getDb } from './database';
import { useAuth } from '@/lib/auth/AuthContext';
import { Card } from '@/types';
import { CARD_SELECT, mapRow, SupabaseCardFull } from '@/lib/api/types';

export interface SetCompletion {
  expansionId:  string | null;
  setName:      string;            // upper-cased, matches card.set
  series:       string | null;
  total:        number;            // expansions.total (incl. secrets)
  printedTotal: number | null;
  owned:        number;
  percent:      number;            // 0..100
  logoUrl:      string | null;
  symbolUrl:    string | null;
  releaseDate:  string | null;
}

/**
 * Per-set completion for every set the user owns at least one card from.
 * Sorted by percent complete descending, then by owned count.
 */
export function useSetCompletion() {
  const { user } = useAuth();
  return useQuery<SetCompletion[]>({
    queryKey: ['set-completion', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const db = await getDb();
      const rows = await db.getAllAsync<{ card_json: string }>(
        `SELECT i.card_json
           FROM cloud_collection_items i
           JOIN cloud_collections c ON c.id = i.collection_id
          WHERE c.user_id = ? AND c.kind = 'collection'`,
        [user.id],
      );

      // Tally owned by uppercase set name (matches mapRow's normalization).
      const ownedBySet = new Map<string, number>();
      for (const r of rows) {
        try {
          const card = JSON.parse(r.card_json) as Card;
          if (!card.set) continue;
          const key = card.set.toUpperCase();
          ownedBySet.set(key, (ownedBySet.get(key) ?? 0) + 1);
        } catch { /* skip bad row */ }
      }
      if (ownedBySet.size === 0) return [];

      // Pull expansion metadata for those names. Compare against UPPER(name)
      // to be insensitive to the casing in the source table.
      const names = Array.from(ownedBySet.keys());
      const { data, error } = await supabase
        .from('expansions')
        .select('id, name, series, total, printed_total, logo_url, symbol_url, release_date');
      if (error) throw new Error(`set-completion expansions: ${error.message}`);

      const byUpperName = new Map<string, {
        id: string; name: string; series: string | null; total: number | null;
        printed_total: number | null; logo_url: string | null; symbol_url: string | null;
        release_date: string | null;
      }>();
      for (const e of (data ?? []) as Array<{
        id: string; name: string; series: string | null; total: number | null;
        printed_total: number | null; logo_url: string | null; symbol_url: string | null;
        release_date: string | null;
      }>) {
        byUpperName.set(e.name.toUpperCase(), e);
      }

      const out: SetCompletion[] = names.map(setName => {
        const owned = ownedBySet.get(setName) ?? 0;
        const meta  = byUpperName.get(setName) ?? null;
        const total = meta?.total ?? owned;  // fall back so percent is sensible
        const percent = total > 0 ? Math.min(100, Math.round((owned / total) * 100)) : 0;
        return {
          expansionId:  meta?.id ?? null,
          setName,
          series:       meta?.series ?? null,
          total,
          printedTotal: meta?.printed_total ?? null,
          owned,
          percent,
          logoUrl:      meta?.logo_url ?? null,
          symbolUrl:    meta?.symbol_url ?? null,
          releaseDate:  meta?.release_date ?? null,
        };
      });

      out.sort((a, b) =>
        b.percent - a.percent || b.owned - a.owned || a.setName.localeCompare(b.setName)
      );
      return out;
    },
    enabled: !!user?.id,
  });
}

export interface SetDrilldown {
  owned:   Card[];
  missing: Card[];
}

/**
 * Drill-down for one set: lists owned (from local mirror) and missing cards.
 * Missing comes from Supabase filtered by expansion_id. If expansion_id is
 * null we resolve it from the upper-cased name first.
 */
export function useSetDrilldown(setName: string, expansionId: string | null) {
  const { user } = useAuth();
  return useQuery<SetDrilldown>({
    queryKey: ['set-drilldown', user?.id, setName, expansionId],
    queryFn: async () => {
      if (!user) return { owned: [], missing: [] };

      // 1. Owned cards from local mirror.
      const db = await getDb();
      const rows = await db.getAllAsync<{ card_json: string; card_id: string }>(
        `SELECT i.card_json, i.card_id
           FROM cloud_collection_items i
           JOIN cloud_collections c ON c.id = i.collection_id
          WHERE c.user_id = ? AND c.kind = 'collection'`,
        [user.id],
      );
      const owned: Card[] = [];
      const ownedIds = new Set<string>();
      const upper = setName.toUpperCase();
      for (const r of rows) {
        try {
          const card = JSON.parse(r.card_json) as Card;
          if ((card.set || '').toUpperCase() !== upper) continue;
          owned.push(card);
          ownedIds.add(card.id);
        } catch { /* skip bad row */ }
      }

      // 2. Resolve expansion_id if not provided.
      let expId = expansionId;
      if (!expId) {
        const { data, error } = await supabase
          .from('expansions')
          .select('id')
          .ilike('name', setName)
          .limit(1);
        if (error) throw new Error(`set-drilldown expansion lookup: ${error.message}`);
        expId = (data?.[0] as { id: string } | undefined)?.id ?? null;
      }
      if (!expId) return { owned, missing: [] };

      // 3. All cards in the set from Supabase, filtered to those not owned.
      const { data, error } = await supabase
        .from('cards')
        .select(CARD_SELECT)
        .eq('expansion_id', expId)
        .order('printed_number', { ascending: true });
      if (error) throw new Error(`set-drilldown cards: ${error.message}`);

      const missing: Card[] = [];
      for (const row of (data ?? []) as unknown as SupabaseCardFull[]) {
        const c = mapRow(row);
        if (!ownedIds.has(c.id)) missing.push(c);
      }
      return { owned, missing };
    },
    enabled: !!setName,
  });
}
