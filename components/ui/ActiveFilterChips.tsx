// Horizontally-scrollable row of removable chips showing which filters are
// currently applied. Tap a chip to remove that one selection. Type is shown
// separately by the pill bar so it's intentionally omitted here.

import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Icon } from './Icon';
import { Colors, FontFamily, Radius } from '@/constants/theme';
import {
  CollectionFilters, TYPE_LABEL,
  isValueRangeActive, valueRangeLabel,
} from '@/lib/filters/collection';
import { CardType } from '@/types';

interface Props {
  filters: CollectionFilters;
  onChange: (next: CollectionFilters) => void;
}

interface ChipDef { label: string; remove: () => CollectionFilters }

export function ActiveFilterChips({ filters, onChange }: Props) {
  const chips: ChipDef[] = [];

  for (const t of filters.types) {
    chips.push({
      label: TYPE_LABEL[t as CardType],
      remove: () => withoutFromSet(filters, 'types', t),
    });
  }
  for (const s of filters.sets) {
    chips.push({ label: s, remove: () => withoutFromSet(filters, 'sets', s) });
  }
  for (const r of filters.rarities) {
    chips.push({ label: r, remove: () => withoutFromSet(filters, 'rarities', r) });
  }
  for (const s of filters.supertypes) {
    chips.push({ label: s, remove: () => withoutFromSet(filters, 'supertypes', s) });
  }
  for (const v of filters.variants) {
    chips.push({ label: v, remove: () => withoutFromSet(filters, 'variants', v) });
  }
  if (isValueRangeActive(filters)) {
    chips.push({
      label:  valueRangeLabel(filters),
      remove: () => ({ ...filters, valueMin: 0, valueMax: null }),
    });
  }
  if (filters.trend !== 'all') {
    chips.push({
      label: filters.trend === 'gainers' ? '30d gainers' : '30d losers',
      remove: () => ({ ...filters, trend: 'all' }),
    });
  }
  if (filters.foilOnly) {
    chips.push({ label: 'Foil only', remove: () => ({ ...filters, foilOnly: false }) });
  }

  if (chips.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {chips.map((c, i) => (
        <TouchableOpacity
          key={`${c.label}-${i}`}
          onPress={() => onChange(c.remove())}
          style={styles.chip}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${c.label} filter`}
        >
          <Text style={styles.chipLabel} numberOfLines={1}>{c.label}</Text>
          <Icon name="close" size={12} color={Colors.text2} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function withoutFromSet<K extends 'types' | 'sets' | 'rarities' | 'supertypes' | 'variants'>(
  filters: CollectionFilters,
  key: K,
  value: string,
): CollectionFilters {
  const next = new Set(filters[key] as Set<string>);
  next.delete(value);
  return { ...filters, [key]: next } as CollectionFilters;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 22,
    paddingVertical: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.4)',
    backgroundColor: 'rgba(255,215,0,0.08)',
  },
  chipLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    color: Colors.gold,
    maxWidth: 140,
  },
});
