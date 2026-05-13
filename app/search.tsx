import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { CardThumb } from '@/components/cards/CardThumb';
import { SkeletonCard } from '@/components/ui/SkeletonCard';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import { Icon } from '@/components/ui/Icon';
import { useSearchCards, SortField, SortDir } from '@/lib/api/cards';
import { Colors, FontFamily, Radius, Spacing } from '@/constants/theme';

const FILTERS = ['Name', 'Set/Pack', 'Artist', 'Rarity'];

const SORT_OPTIONS: { field: SortField; dir: SortDir; label: string; icon: 'arrow-up' | 'arrow-down' }[] = [
  { field: 'price',   dir: 'desc', label: 'Price: High → Low', icon: 'arrow-down' },
  { field: 'price',   dir: 'asc',  label: 'Price: Low → High', icon: 'arrow-up'   },
  { field: 'release', dir: 'desc', label: 'Release: Newest',   icon: 'arrow-down' },
  { field: 'release', dir: 'asc',  label: 'Release: Oldest',   icon: 'arrow-up'   },
  { field: 'number',  dir: 'asc',  label: 'Card #: Ascending', icon: 'arrow-up'   },
  { field: 'number',  dir: 'desc', label: 'Card #: Descending',icon: 'arrow-down' },
];

function fmt(n: number) {
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n.toFixed(2);
}

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('Name');
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({ field: 'relevance', dir: 'desc' });
  const [sortOpen, setSortOpen] = useState(false);
  const insets = useSafeAreaInsets();

  const {
    data,
    isFetching,
    isFetchingNextPage,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
  } = useSearchCards(query, activeFilter, sort);

  const results = useMemo(() => data?.pages.flat() ?? [], [data]);

  // release/number/relevance are sorted server-side; only price needs client-side sort
  const sortedResults = useMemo(() => {
    if (sort.field !== 'price' || !results.length) return results;
    return [...results].sort((a, b) => {
      const cmp = a.value - b.value;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [results, sort]);

  const activeSortOption = SORT_OPTIONS.find(o => o.field === sort.field && o.dir === sort.dir);
  const sortLabel = activeSortOption
    ? activeSortOption.label.split(':')[0]
    : 'Sort';

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 16 }]}>
      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.inputWrap}>
          <Icon name="search" size={16} color={Colors.text3} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search cards, sets, artists…"
            placeholderTextColor={Colors.text3}
            style={styles.input}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Icon name="close" size={14} color={Colors.text3} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.pillsScroll}
        contentContainerStyle={styles.pillsRow}
      >
        {FILTERS.map(f => {
          const active = activeFilter === f;
          return (
            <TouchableOpacity
              key={f}
              onPress={() => setActiveFilter(f)}
              style={[styles.pill, active && styles.pillActive]}
            >
              {active && <Icon name="check" size={10} color={Colors.gold} />}
              <Text style={[styles.pillText, active && styles.pillTextActive]}>{f}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        scrollEventThrottle={200}
        onScroll={({ nativeEvent: { layoutMeasurement, contentOffset, contentSize } }) => {
          const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
          if (distanceFromBottom < 300 && hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
      >
        {isError && <ErrorPanel onRetry={refetch} />}

        {/* Results header */}
        <View style={styles.resultsHeader}>
          <Text style={styles.sectionLabel}>
            {query.trim().length >= 2 ? `${results.length} results` : 'Start typing to search'}
          </Text>
          <View style={styles.headerRight}>
            {isFetching && query.trim().length >= 2 && (
              <Text style={styles.live}>● LIVE</Text>
            )}
            <TouchableOpacity
              onPress={() => { Haptics.selectionAsync(); setSortOpen(true); }}
              style={[styles.sortPill, sort.field !== 'relevance' && styles.sortPillActive]}
            >
              <Icon name="sort" size={10} color={sort.field !== 'relevance' ? Colors.gold : Colors.text2} />
              <Text style={[styles.sortPillText, sort.field !== 'relevance' && styles.sortPillTextActive]}>
                {sortLabel}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Skeleton while loading */}
        {isFetching && query.trim().length >= 2 && results.length === 0 && (
          <View style={styles.grid}>
            {[0, 1, 2].map(i => <SkeletonCard key={i} width={104} />)}
          </View>
        )}

        {/* Results grid */}
        {sortedResults.length > 0 && (
          <View style={styles.grid}>
            {sortedResults.map((card, i) => (
              <TouchableOpacity
                key={`${card.id}-${i}`}
                style={styles.gridCell}
                onPress={() => router.push(`/card/${card.id}`)}
              >
                <CardThumb card={card} width={104} />
                <Text style={styles.gridName} numberOfLines={1}>{card.name}</Text>
                <Text style={styles.gridPrice}>${fmt(card.value)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {isFetchingNextPage && (
          <ActivityIndicator style={styles.loadingMore} color={Colors.gold} />
        )}
      </ScrollView>

      {/* Sort modal */}
      <Modal visible={sortOpen} transparent animationType="slide" onRequestClose={() => setSortOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setSortOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Sort Results</Text>

          <TouchableOpacity
            style={[styles.sheetOption, sort.field === 'relevance' && styles.sheetOptionActive]}
            onPress={() => { Haptics.selectionAsync(); setSort({ field: 'relevance', dir: 'desc' }); setSortOpen(false); }}
          >
            <Text style={[styles.sheetOptionText, sort.field === 'relevance' && styles.sheetOptionTextActive]}>
              Relevance
            </Text>
            {sort.field === 'relevance' && <Icon name="check" size={12} color={Colors.gold} />}
          </TouchableOpacity>

          {SORT_OPTIONS.map(opt => {
            const active = sort.field === opt.field && sort.dir === opt.dir;
            return (
              <TouchableOpacity
                key={`${opt.field}-${opt.dir}`}
                style={[styles.sheetOption, active && styles.sheetOptionActive]}
                onPress={() => { Haptics.selectionAsync(); setSort({ field: opt.field, dir: opt.dir }); setSortOpen(false); }}
              >
                <View style={styles.sheetOptionLeft}>
                  <Icon name={opt.icon} size={12} color={active ? Colors.gold : Colors.text3} />
                  <Text style={[styles.sheetOptionText, active && styles.sheetOptionTextActive]}>
                    {opt.label}
                  </Text>
                </View>
                {active && <Icon name="check" size={12} color={Colors.gold} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: Spacing.lg,
    marginBottom: 14,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.lineStrong,
    backgroundColor: Colors.surface,
  },
  input: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: Colors.text,
  },
  cancel: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: Colors.text2,
  },
  pillsScroll: {
    height: 52,
    flexShrink: 0,
    flexGrow: 0,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 16,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  pillActive: {
    borderColor: 'rgba(255,215,0,0.4)',
    backgroundColor: 'rgba(255,215,0,0.1)',
  },
  pillText: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Colors.text2,
  },
  pillTextActive: {
    color: Colors.gold,
  },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: Colors.text3,
  },
  live: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    color: Colors.gold,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridCell: {
    width: 104,
  },
  gridName: {
    fontFamily: FontFamily.display,
    fontSize: 11,
    color: Colors.text,
    marginTop: 6,
    lineHeight: 13,
  },
  gridPrice: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    color: Colors.gold,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sortPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  sortPillActive: {
    borderColor: 'rgba(255,215,0,0.4)',
    backgroundColor: 'rgba(255,215,0,0.08)',
  },
  sortPillText: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: Colors.text2,
  },
  sortPillTextActive: {
    color: Colors.gold,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: Spacing.lg,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.line,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: Colors.text3,
    marginBottom: 12,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  sheetOptionActive: {
    borderBottomColor: 'rgba(255,215,0,0.15)',
  },
  sheetOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sheetOptionText: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: Colors.text2,
  },
  sheetOptionTextActive: {
    color: Colors.gold,
    fontFamily: FontFamily.bodySemi,
  },
  loadingMore: {
    marginTop: 24,
  },
});
