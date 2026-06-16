// Bottom-sheet filter modal for the Collection screen. Internal draft state
// is committed on Apply; backdrop tap / Cancel discards. Live "X cards match"
// preview computed against the same applyFilters used by the screen, so the
// number the user sees on Apply is exactly what they get.

import { useMemo, useState, useEffect } from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Icon } from './Icon';
import { DualRangeSlider } from './DualRangeSlider';
import { Colors, FontFamily, Radius, Spacing } from '@/constants/theme';
import {
  ALL_TYPES, CollectionEntry, CollectionFacets, CollectionFilters,
  DEFAULT_SORT_DIRECTION, EMPTY_FILTERS, SortMode, SORT_LABEL,
  TYPE_LABEL, VALUE_MAX_CAP, applyFilters, facetsFor, formatValue,
  snapValue, sortDirectionLabel,
} from '@/lib/filters/collection';
import { CardType } from '@/types';

interface Props {
  visible:  boolean;
  entries:  CollectionEntry[];
  value:    CollectionFilters;
  onApply:  (next: CollectionFilters) => void;
  onClose:  () => void;
}

const SORT_MODES: SortMode[] = ['recent', 'value', 'name'];

export function FilterSheet({ visible, entries, value, onApply, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<CollectionFilters>(value);

  // Resync the draft each time the sheet opens — otherwise stale draft state
  // from a previous open lingers.
  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  const facets: CollectionFacets = useMemo(() => facetsFor(entries), [entries]);
  const previewCount = useMemo(() => applyFilters(entries, draft).length, [entries, draft]);

  const reset = () => {
    Haptics.selectionAsync();
    // Preserve the current sort — it's a presentation choice rather than a filter.
    setDraft({
      ...EMPTY_FILTERS,
      sortMode: value.sortMode,
      sortDir:  value.sortDir,
    });
  };

  // Tap an inactive mode → activate at its default direction.
  // Tap the active mode → flip direction.
  const tapSortMode = (mode: SortMode) => {
    Haptics.selectionAsync();
    if (draft.sortMode === mode) {
      setDraft({ ...draft, sortDir: draft.sortDir === 'desc' ? 'asc' : 'desc' });
    } else {
      setDraft({ ...draft, sortMode: mode, sortDir: DEFAULT_SORT_DIRECTION[mode] });
    }
  };

  const apply = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onApply(draft);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <TouchableOpacity onPress={reset} accessibilityRole="button">
            <Text style={styles.headerLink}>Reset</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Filters</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={styles.headerLink}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          <Section title="Sort by">
            <View style={styles.chipGrid}>
              {SORT_MODES.map(mode => {
                const active = draft.sortMode === mode;
                return (
                  <TouchableOpacity
                    key={mode}
                    onPress={() => tapSortMode(mode)}
                    style={[styles.chip, active && styles.chipActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={
                      active
                        ? `${SORT_LABEL[mode]} sort, ${sortDirectionLabel(mode, draft.sortDir)}, tap to flip direction`
                        : `Sort by ${SORT_LABEL[mode]}`
                    }
                  >
                    <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                      {SORT_LABEL[mode]}
                      {active && (
                        <Text style={styles.chipDirection}>
                          {'  '}{sortDirectionLabel(mode, draft.sortDir)}
                        </Text>
                      )}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Section>

          <Section title="Type">
            <ChipGrid
              options={ALL_TYPES}
              labels={TYPE_LABEL}
              selected={draft.types}
              onToggle={key => setDraft({ ...draft, types: toggleInSet(draft.types, key as CardType) })}
            />
          </Section>

          <Section title="Value">
            <DualRangeSlider
              min={0}
              max={VALUE_MAX_CAP}
              values={[draft.valueMin, draft.valueMax ?? VALUE_MAX_CAP]}
              snap={snapValue}
              formatLabel={formatValue}
              onChange={([lo, hi]) => setDraft({
                ...draft,
                valueMin: lo,
                // Right thumb at the cap is read as "no upper bound" so
                // cards above the cap stay visible.
                valueMax: hi >= VALUE_MAX_CAP ? null : hi,
              })}
            />
          </Section>

          <Section title="30-day trend">
            <ChipGrid
              options={['all', 'gainers', 'losers'] as const}
              labels={{ all: 'All', gainers: 'Gainers', losers: 'Losers' }}
              selected={new Set([draft.trend])}
              onToggle={key => setDraft({ ...draft, trend: key })}
              singleSelect
            />
          </Section>

          {facets.supertypes.length > 0 && (
            <Section title="Category">
              <ChipGrid
                options={facets.supertypes}
                selected={draft.supertypes}
                onToggle={key => setDraft({ ...draft, supertypes: toggleInSet(draft.supertypes, key) })}
              />
            </Section>
          )}

          {facets.variants.length > 0 && (
            <Section title="Variant">
              <ChipGrid
                options={facets.variants}
                selected={draft.variants}
                onToggle={key => setDraft({ ...draft, variants: toggleInSet(draft.variants, key) })}
              />
            </Section>
          )}

          {facets.rarities.length > 0 && (
            <Section title="Rarity">
              <ChipGrid
                options={facets.rarities}
                selected={draft.rarities}
                onToggle={key => setDraft({ ...draft, rarities: toggleInSet(draft.rarities, key) })}
              />
            </Section>
          )}

          {facets.sets.length > 0 && (
            <Section title={`Set (${facets.sets.length})`}>
              <ChipGrid
                options={facets.sets}
                selected={draft.sets}
                onToggle={key => setDraft({ ...draft, sets: toggleInSet(draft.sets, key) })}
              />
            </Section>
          )}

          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleTitle}>Foil only</Text>
              <Text style={styles.toggleHint}>Holo + reverse-holo + special</Text>
            </View>
            <Switch
              value={draft.foilOnly}
              onValueChange={v => setDraft({ ...draft, foilOnly: v })}
              trackColor={{ true: Colors.gold, false: Colors.lineStrong }}
              thumbColor="#fff"
            />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.applyBtn}
            onPress={apply}
            accessibilityRole="button"
            accessibilityLabel={`Apply filters, ${previewCount} cards match`}
          >
            <Text style={styles.applyBtnText}>
              Apply{previewCount !== entries.length && ` · ${previewCount} of ${entries.length}`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function ChipGrid<T extends string>({
  options, labels, selected, onToggle, singleSelect,
}: {
  options: readonly T[];
  labels?: Record<T, string>;
  selected: Set<T> | Set<string>;
  onToggle: (key: T) => void;
  singleSelect?: boolean;
}) {
  return (
    <View style={styles.chipGrid}>
      {options.map(opt => {
        const active = (selected as Set<string>).has(opt);
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => { Haptics.selectionAsync(); onToggle(opt); }}
            style={[styles.chip, active && styles.chipActive]}
            accessibilityRole={singleSelect ? 'radio' : 'checkbox'}
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
              {labels ? labels[opt] : opt}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function toggleInSet<T>(set: Set<T>, key: T): Set<T> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

// ─── Trigger button (exported helper) ────────────────────────────────────────

export function FilterTriggerButton({
  count, onPress,
}: { count: number; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.triggerBtn}
      accessibilityRole="button"
      accessibilityLabel={`Open filters${count > 0 ? `, ${count} active` : ''}`}
    >
      <Icon name="sort" size={14} color={Colors.text} />
      <Text style={styles.triggerLabel}>Filters</Text>
      {count > 0 && (
        <View style={styles.triggerBadge}>
          <Text style={styles.triggerBadgeText}>{count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    maxHeight: '90%',
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: Colors.line,
  },
  handle: {
    alignSelf: 'center',
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginTop: 8, marginBottom: 6,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: 8, paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: Colors.line,
  },
  headerTitle: { fontFamily: FontFamily.display, fontSize: 18, color: Colors.text },
  headerLink: { fontFamily: FontFamily.body, fontSize: 13, color: Colors.text2 },

  body: { flexGrow: 0 },
  bodyContent: { paddingHorizontal: Spacing.xl, paddingTop: 16, paddingBottom: 8 },

  section: { marginBottom: 22 },
  sectionTitle: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: Colors.text3,
    marginBottom: 10,
  },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  chip: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.glass,
  },
  chipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  chipLabel: { fontFamily: FontFamily.body, fontSize: 12, color: Colors.text },
  chipLabelActive: { color: Colors.bg, fontFamily: FontFamily.bodySemi },
  chipDirection: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    color: Colors.bg,
    letterSpacing: 0.4,
  },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderColor: Colors.line,
    marginBottom: 8,
  },
  toggleTitle: { fontFamily: FontFamily.body, fontSize: 14, color: Colors.text },
  toggleHint: { fontFamily: FontFamily.mono, fontSize: 10, color: Colors.text3, marginTop: 2 },

  footer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: Colors.line,
  },
  applyBtn: {
    paddingVertical: 14,
    borderRadius: Radius.md,
    backgroundColor: Colors.gold,
    alignItems: 'center',
  },
  applyBtnText: { fontFamily: FontFamily.bodySemi, fontSize: 15, color: Colors.bg },

  triggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.glass,
  },
  triggerLabel: { fontFamily: FontFamily.body, fontSize: 12, color: Colors.text },
  triggerBadge: {
    minWidth: 18, height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  triggerBadgeText: { fontFamily: FontFamily.bodySemi, fontSize: 10, color: Colors.bg },
});
