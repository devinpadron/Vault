import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Card3D } from '@/components/cards/Card3D';
import { SkeletonCardCell } from '@/components/ui/SkeletonCard';
import { Icon } from '@/components/ui/Icon';
import { ActiveFilterChips } from '@/components/ui/ActiveFilterChips';
import { FilterSheet, FilterTriggerButton } from '@/components/ui/FilterSheet';
import { useCollectionEntries } from '@/lib/db/collection';
import {
  CollectionFilters, EMPTY_FILTERS,
  activeFilterCount, applyFilters,
} from '@/lib/filters/collection';
import { fmt } from '@/lib/format';
import { Colors, FontFamily, Spacing } from '@/constants/theme';
import { Card, cardBaseName, cardNameVariant } from '@/types';

function CardCell({ card, index }: { card: Card; index: number }) {
  return (
    <Animated.View
      entering={FadeInDown.delay(index * 20).duration(280)}
      style={styles.cellWrapper}
    >
      <Card3D
        card={card}
        width={158}
        onPress={() => router.push(`/card/${card.id}`)}
      />
      <View style={styles.cellMeta}>
        <Text style={styles.cardName} numberOfLines={1}>
          {cardBaseName(card.name)}
          {cardNameVariant(card.name) && (
            <Text style={styles.cardVariant}> {cardNameVariant(card.name)}</Text>
          )}
        </Text>
        <Text style={styles.cardSet} numberOfLines={1}>{card.set}</Text>
        <View style={styles.priceRow}>
          {card.value > 0 ? (
            <>
              <Text style={styles.price}>${fmt(card.value)}</Text>
              {card.trend30d != null && card.trend30d !== 0 && (
                <Text style={[styles.trend, { color: card.trend30d > 0 ? Colors.up : Colors.down }]}>
                  {card.trend30d > 0 ? '↑' : '↓'}{Math.abs(card.trend30d).toFixed(1)}%
                </Text>
              )}
            </>
          ) : (
            <Text style={[styles.price, { color: Colors.text3 }]}>&mdash;</Text>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

export default function CollectionScreen() {
  const [filters, setFilters] = useState<CollectionFilters>(EMPTY_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { data: entries = [], isLoading } = useCollectionEntries();

  const visible = useMemo(() => applyFilters(entries, filters), [entries, filters]);
  const cards   = useMemo(() => visible.map(e => e.card), [visible]);

  const pairs: [Card, Card | null][] = [];
  for (let i = 0; i < cards.length; i += 2) {
    pairs.push([cards[i], cards[i + 1] ?? null]);
  }

  const activeCount = activeFilterCount(filters);
  const headerCount = isLoading
    ? 'Loading…'
    : activeCount > 0
      ? `${cards.length} of ${entries.length} cards`
      : `${entries.length} cards · ${new Set(entries.map(e => e.card.set)).size} sets`;

  return (
    <>
      <FlatList
        data={isLoading ? [] : pairs}
        keyExtractor={(_, i) => String(i)}
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !isLoading && cards.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>
                {entries.length === 0 ? 'No cards yet' : 'No matches'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {entries.length === 0
                  ? 'Search for cards and tap "Add to collection" to start building your vault.'
                  : 'No cards match these filters. Try clearing some.'}
              </Text>
              {entries.length > 0 && (
                <TouchableOpacity
                  style={styles.emptyResetBtn}
                  onPress={() => setFilters({
                    ...EMPTY_FILTERS,
                    sortMode: filters.sortMode,
                    sortDir:  filters.sortDir,
                  })}
                >
                  <Text style={styles.emptyResetText}>CLEAR FILTERS</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null
        }
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.eyebrow}>{headerCount}</Text>
                <Text style={styles.title}>
                  Your{' '}
                  <Text style={styles.titleAccent}>collection</Text>
                </Text>
              </View>
              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={styles.bindersBtn}
                  onPress={() => router.push('/wishlist')}
                  accessibilityLabel="Open wishlist"
                >
                  <Icon name="heart" size={18} color={Colors.text} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.bindersBtn}
                  onPress={() => router.push('/(tabs)/binders')}
                  accessibilityLabel="Open binders"
                >
                  <Icon name="binders" size={18} color={Colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.filterRow}>
              <FilterTriggerButton count={activeCount} onPress={() => setSheetOpen(true)} />
            </View>

            {activeCount > 0 && (
              <ActiveFilterChips filters={filters} onChange={setFilters} />
            )}

            {isLoading && (
              <>
                {Array.from({ length: 6 }, (_, i) => (
                  <View key={i} style={styles.row}>
                    <SkeletonCardCell width={158} />
                    <SkeletonCardCell width={158} />
                  </View>
                ))}
              </>
            )}
          </>
        }
        renderItem={({ item: [left, right], index }) => (
          <View style={styles.row}>
            <CardCell card={left} index={index * 2} />
            {right ? (
              <CardCell card={right} index={index * 2 + 1} />
            ) : (
              <View style={styles.cellWrapper} />
            )}
          </View>
        )}
      />

      <FilterSheet
        visible={sheetOpen}
        entries={entries}
        value={filters}
        onApply={setFilters}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    paddingHorizontal: Spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerText: { flex: 1 },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  bindersBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  eyebrow: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: Colors.text3,
    marginBottom: 6,
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 38,
    color: Colors.text,
    lineHeight: 40,
  },
  titleAccent: {
    fontFamily: FontFamily.displayItalic,
    color: Colors.gold,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    marginTop: 14,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyTitle: {
    fontFamily: FontFamily.display,
    fontSize: 22,
    color: Colors.text3,
  },
  emptySubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: Colors.text3,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyResetBtn: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  emptyResetText: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: Colors.gold,
  },
  row: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 14,
  },
  cellWrapper: { flex: 1, gap: 8 },
  cellMeta: { paddingLeft: 2 },
  cardName: {
    fontFamily: FontFamily.display,
    fontSize: 14,
    color: Colors.text,
    lineHeight: 16,
  },
  cardVariant: {
    fontFamily: FontFamily.display,
    fontSize: 12,
    color: Colors.text3,
  },
  cardSet: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 0.6,
    color: Colors.text3,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  price: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    color: Colors.gold,
  },
  trend: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
  },
});
