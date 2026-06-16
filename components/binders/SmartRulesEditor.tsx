// Reusable rules editor for smart binders. Used by the create-binder sheet
// and the post-creation rules editor on the binder detail screen.
//
// The component is controlled: it never owns the canonical rules object —
// callers pass `value` and listen to `onChange`. Local state is limited to
// ephemeral text-input scratch (so users can type "1." without it being
// rejected as not-a-number mid-keystroke).

import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SmartBinderRules } from '@/lib/db/cloud-sync';
import { Colors, FontFamily, Radius } from '@/constants/theme';

const SUPERTYPES = ['Pokémon', 'Trainer', 'Energy'] as const;
const VARIANTS   = ['EX', 'V', 'VMAX', 'VSTAR', 'GX', 'V-UNION'] as const;

interface Props {
  value:                SmartBinderRules | null;
  onChange:             (next: SmartBinderRules) => void;
  /** Top sets the user owns, ordered most-owned first. */
  availableSets:        string[];
  /** Distinct rarities present in the user's collection. */
  availableRarities:    string[];
}

const EMPTY_RULES: SmartBinderRules = { match: 'all' };

function ensureRules(value: SmartBinderRules | null): SmartBinderRules {
  return value ?? { ...EMPTY_RULES };
}

function toggleListItem<T>(list: T[] | undefined, item: T): T[] {
  const current = list ?? [];
  return current.includes(item) ? current.filter(x => x !== item) : [...current, item];
}

export function SmartRulesEditor({
  value, onChange, availableSets, availableRarities,
}: Props) {
  const rules = ensureRules(value);

  // Text-input scratch state for the numeric value range. Synced to props
  // when the parent resets `value` (e.g. opening the sheet for a different
  // binder). Emits onChange only when the parsed value is a valid number
  // or the field is empty.
  const [minText, setMinText] = useState<string>(
    rules.minValue != null ? String(rules.minValue) : '',
  );
  const [maxText, setMaxText] = useState<string>(
    rules.maxValue != null ? String(rules.maxValue) : '',
  );
  useEffect(() => {
    setMinText(rules.minValue != null ? String(rules.minValue) : '');
    setMaxText(rules.maxValue != null ? String(rules.maxValue) : '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function patch(next: Partial<SmartBinderRules>) {
    onChange({ ...rules, ...next });
  }

  function commitMin(text: string) {
    setMinText(text);
    if (text.trim() === '') {
      patch({ minValue: undefined });
      return;
    }
    const n = Number(text);
    if (Number.isFinite(n) && n >= 0) patch({ minValue: n });
  }
  function commitMax(text: string) {
    setMaxText(text);
    if (text.trim() === '') {
      patch({ maxValue: undefined });
      return;
    }
    const n = Number(text);
    if (Number.isFinite(n) && n >= 0) patch({ maxValue: n });
  }

  const ruleCount = useMemo(() => {
    let n = 0;
    if (rules.sets?.length)        n += 1;
    if (rules.rarities?.length)    n += 1;
    if (rules.supertypes?.length)  n += 1;
    if (rules.variants?.length)    n += 1;
    if (rules.minValue != null)    n += 1;
    if (rules.maxValue != null)    n += 1;
    if (rules.foilOnly)            n += 1;
    return n;
  }, [rules]);

  return (
    <View>
      {/* Match-mode segmented control */}
      <Text style={styles.label}>MATCH</Text>
      <View style={styles.segmented}>
        <TouchableOpacity
          onPress={() => patch({ match: 'all' })}
          style={[styles.segment, rules.match === 'all' && styles.segmentActive]}
        >
          <Text style={[styles.segmentText, rules.match === 'all' && styles.segmentTextActive]}>
            All conditions
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => patch({ match: 'any' })}
          style={[styles.segment, rules.match === 'any' && styles.segmentActive]}
        >
          <Text style={[styles.segmentText, rules.match === 'any' && styles.segmentTextActive]}>
            Any condition
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.helpText}>
        {rules.match === 'all'
          ? 'A card must satisfy every filter you set below.'
          : 'A card needs to satisfy just one of the filters below.'}
      </Text>

      {/* Sets */}
      {availableSets.length > 0 && (
        <>
          <Text style={styles.label}>SETS</Text>
          <View style={styles.chipRow}>
            {availableSets.map(s => {
              const on = rules.sets?.includes(s) ?? false;
              return (
                <TouchableOpacity
                  key={s}
                  onPress={() => patch({ sets: toggleListItem(rules.sets, s) })}
                  style={[styles.chip, on && styles.chipActive]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextActive]}>{s}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {/* Rarities */}
      {availableRarities.length > 0 && (
        <>
          <Text style={styles.label}>RARITY</Text>
          <View style={styles.chipRow}>
            {availableRarities.map(r => {
              const on = rules.rarities?.includes(r) ?? false;
              return (
                <TouchableOpacity
                  key={r}
                  onPress={() => patch({ rarities: toggleListItem(rules.rarities, r) })}
                  style={[styles.chip, on && styles.chipActive]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextActive]}>{r}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {/* Supertypes */}
      <Text style={styles.label}>SUPERTYPE</Text>
      <View style={styles.chipRow}>
        {SUPERTYPES.map(s => {
          const on = rules.supertypes?.includes(s) ?? false;
          return (
            <TouchableOpacity
              key={s}
              onPress={() => patch({ supertypes: toggleListItem(rules.supertypes, s) })}
              style={[styles.chip, on && styles.chipActive]}
            >
              <Text style={[styles.chipText, on && styles.chipTextActive]}>{s}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Variants */}
      <Text style={styles.label}>VARIANT</Text>
      <View style={styles.chipRow}>
        {VARIANTS.map(v => {
          const on = rules.variants?.includes(v) ?? false;
          return (
            <TouchableOpacity
              key={v}
              onPress={() => patch({ variants: toggleListItem(rules.variants, v) })}
              style={[styles.chip, on && styles.chipActive]}
            >
              <Text style={[styles.chipText, on && styles.chipTextActive]}>{v}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Value range */}
      <Text style={styles.label}>MARKET VALUE</Text>
      <View style={styles.rangeRow}>
        <View style={styles.rangeField}>
          <Text style={styles.rangePrefix}>$</Text>
          <TextInput
            value={minText}
            onChangeText={commitMin}
            placeholder="min"
            placeholderTextColor={Colors.text3}
            keyboardType="decimal-pad"
            style={styles.rangeInput}
          />
        </View>
        <Text style={styles.rangeSep}>—</Text>
        <View style={styles.rangeField}>
          <Text style={styles.rangePrefix}>$</Text>
          <TextInput
            value={maxText}
            onChangeText={commitMax}
            placeholder="max"
            placeholderTextColor={Colors.text3}
            keyboardType="decimal-pad"
            style={styles.rangeInput}
          />
        </View>
      </View>

      {/* Foil only */}
      <TouchableOpacity
        onPress={() => patch({ foilOnly: !rules.foilOnly })}
        style={[styles.toggleRow, rules.foilOnly && styles.toggleRowActive]}
        accessibilityRole="switch"
        accessibilityState={{ checked: !!rules.foilOnly }}
      >
        <Text style={[styles.toggleLabel, rules.foilOnly && styles.toggleLabelActive]}>
          Foil only
        </Text>
        <View style={[styles.toggleDot, rules.foilOnly && styles.toggleDotActive]} />
      </TouchableOpacity>

      <Text style={styles.summary}>
        {ruleCount === 0
          ? 'No filters set yet — add at least one.'
          : `${ruleCount} ${ruleCount === 1 ? 'filter' : 'filters'} configured.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 1.4,
    color: Colors.text3,
    marginBottom: 6,
    marginTop: 14,
  },
  helpText: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: Colors.text3,
    marginTop: 6,
  },
  segmented: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.full,
    overflow: 'hidden',
    backgroundColor: Colors.glass,
  },
  segment: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: Colors.goldTint,
  },
  segmentText: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 0.6,
    color: Colors.text2,
  },
  segmentTextActive: {
    color: Colors.gold,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.glass,
  },
  chipActive: {
    borderColor: 'rgba(255,215,0,0.45)',
    backgroundColor: 'rgba(255,215,0,0.10)',
  },
  chipText: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.6,
    color: Colors.text2,
  },
  chipTextActive: {
    color: Colors.gold,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rangeField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    backgroundColor: Colors.glass,
  },
  rangePrefix: {
    fontFamily: FontFamily.mono,
    fontSize: 13,
    color: Colors.text3,
    marginRight: 4,
  },
  rangeInput: {
    flex: 1,
    paddingVertical: 10,
    fontFamily: FontFamily.mono,
    fontSize: 13,
    color: Colors.text,
  },
  rangeSep: {
    fontFamily: FontFamily.mono,
    fontSize: 14,
    color: Colors.text3,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.glass,
    marginTop: 14,
  },
  toggleRowActive: {
    borderColor: 'rgba(255,215,0,0.45)',
    backgroundColor: Colors.goldFaint,
  },
  toggleLabel: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: Colors.text,
  },
  toggleLabelActive: {
    color: Colors.gold,
  },
  toggleDot: {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 1, borderColor: Colors.line,
    backgroundColor: 'transparent',
  },
  toggleDotActive: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  summary: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.6,
    color: Colors.text3,
    marginTop: 18,
    textAlign: 'center',
  },
});

/** Helper: derive available sets + rarities from a card collection. */
export function deriveRuleOptions(cards: { set: string; rarity: string }[]): {
  sets: string[];
  rarities: string[];
} {
  const setCounts = new Map<string, number>();
  const rarityCounts = new Map<string, number>();
  for (const c of cards) {
    const s = (c.set || '').toUpperCase();
    if (s) setCounts.set(s, (setCounts.get(s) ?? 0) + 1);
    if (c.rarity) rarityCounts.set(c.rarity, (rarityCounts.get(c.rarity) ?? 0) + 1);
  }
  const ranked = (m: Map<string, number>) =>
    Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return {
    sets:     ranked(setCounts).slice(0, 24),
    rarities: ranked(rarityCounts).slice(0, 16),
  };
}

/** True when the rules object has at least one active filter. */
export function rulesHaveAtLeastOneFilter(r: SmartBinderRules | null): boolean {
  if (!r) return false;
  return (
    (r.sets?.length ?? 0) > 0 ||
    (r.rarities?.length ?? 0) > 0 ||
    (r.supertypes?.length ?? 0) > 0 ||
    (r.variants?.length ?? 0) > 0 ||
    r.minValue != null ||
    r.maxValue != null ||
    !!r.foilOnly
  );
}
