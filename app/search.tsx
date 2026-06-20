import { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { CardThumb } from '@/components/cards/CardThumb';
import { SkeletonCard } from '@/components/ui/SkeletonCard';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import { Icon } from '@/components/ui/Icon';
import { useSearchCards, useSearchCount, useExpansionNames, SortField, SortDir } from '@/lib/api/cards';
import { useAddToCollection } from '@/lib/db/collection';
import { ItemDetails } from '@/lib/db/cloud-sync';
import { useBinders, useAddCardToBinder } from '@/lib/api/binders';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { fmt } from '@/lib/format';
import { Card } from '@/types';
import { Colors, FontFamily, PressOpacity, Radius, Spacing } from '@/constants/theme';

const FILTERS = ['All', 'Name', 'Set/Pack', 'Artist', 'Rarity'];

// Quick-add files a NM copy; for a multi-printing card the holofoil printing is
// the default (falling back to the top-priced printing the card exposes).
const HOLO_VARIANT_NAMES = new Set(['holofoil', 'unlimitedHolofoil']);
function defaultVariantId(card: Card): string | undefined {
  const variants = card.variantPrices ?? [];
  const holo = variants.find(v => HOLO_VARIANT_NAMES.has(v.name));
  return (holo ?? variants[0])?.id;
}

const GRID_COLS = 3;
const GRID_GAP = 10;

const SORT_OPTIONS: { field: SortField; dir: SortDir; label: string; icon: 'arrow-up' | 'arrow-down' }[] = [
  { field: 'price',   dir: 'desc', label: 'Price: High → Low', icon: 'arrow-down' },
  { field: 'price',   dir: 'asc',  label: 'Price: Low → High', icon: 'arrow-up'   },
  { field: 'release', dir: 'desc', label: 'Release: Newest',   icon: 'arrow-down' },
  { field: 'release', dir: 'asc',  label: 'Release: Oldest',   icon: 'arrow-up'   },
  { field: 'number',  dir: 'asc',  label: 'Card #: Ascending', icon: 'arrow-up'   },
  { field: 'number',  dir: 'desc', label: 'Card #: Descending',icon: 'arrow-down' },
];

const ResultCell = memo(function ResultCell({ card, index, width, onQuickAdd }: { card: Card; index: number; width: number; onQuickAdd: (card: Card) => void }) {
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index % 24, 12) * 25).duration(260)}>
      <TouchableOpacity
        style={[styles.gridCell, { width }]}
        activeOpacity={PressOpacity}
        onPress={() => router.push(`/card/${card.id}`)}
      >
        <View>
          <CardThumb card={card} width={width} />
          <TouchableOpacity
            style={styles.quickAddBtn}
            onPress={() => onQuickAdd(card)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={`Quick add ${card.name}`}
          >
            <Icon name="plus" size={14} color={Colors.gold} />
          </TouchableOpacity>
        </View>
        <Text style={styles.gridName} numberOfLines={1}>{card.name}</Text>
        <Text style={styles.gridSet} numberOfLines={1}>{card.set}</Text>
        <View style={styles.gridPriceRow}>
          <Text style={[styles.gridPrice, card.value === 0 && { color: Colors.text3 }]}>
            {card.value > 0 ? `$${fmt(card.value)}` : '—'}
          </Text>
          {card.value > 0 && card.trend30d != null && card.trend30d !== 0 && (
            <Text style={[styles.gridTrend, { color: card.trend30d > 0 ? Colors.up : Colors.down }]}>
              {card.trend30d > 0 ? '↑' : '↓'}{Math.abs(card.trend30d).toFixed(1)}%
            </Text>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({ field: 'relevance', dir: 'desc' });
  const [sortOpen, setSortOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();

  // Quick-add: file a search result straight into the collection or a binder
  // without opening the card page. `quickAddCard` drives a bottom sheet; the
  // *Added sets track what's been filed this session so the rows show feedback.
  const [quickAddCard, setQuickAddCard] = useState<Card | null>(null);
  const [collAdded, setCollAdded] = useState(false);
  const [binderAdded, setBinderAdded] = useState<Set<string>>(new Set());
  // Chosen printing for the quick-add (defaults to holofoil). Condition is
  // always NM for quick-add — no condition picker here by design.
  const [quickVariantId, setQuickVariantId] = useState<string | undefined>(undefined);

  const addToCollection = useAddToCollection();
  const { data: binders = [] } = useBinders();
  const addCardToBinder = useAddCardToBinder();
  // Virtual smart binders mirror the collection, so they can't take manual adds.
  const quickBinders = useMemo(() => binders.filter(b => !b.rules || b.rules.autoAdd), [binders]);

  const openQuickAdd = useCallback((card: Card) => {
    Haptics.selectionAsync();
    setQuickAddCard(card);
    setCollAdded(false);
    setBinderAdded(new Set());
    setQuickVariantId(defaultVariantId(card));
  }, []);
  const closeQuickAdd = useCallback(() => setQuickAddCard(null), []);

  // Picking a different printing means a distinct copy, so reset the "added"
  // feedback — the new printing can still be filed.
  const selectQuickVariant = useCallback((id: string | undefined) => {
    setQuickVariantId(id);
    setCollAdded(false);
    setBinderAdded(new Set());
  }, []);

  const quickVariants = quickAddCard?.variantPrices ?? [];
  const quickVariant = quickVariants.find(v => v.id === quickVariantId);

  // The copy to file: chosen printing (or standard), always NM, value snapshot
  // from the selected printing's price.
  function quickDetails(): ItemDetails {
    return {
      variantId:   quickVariant?.id ?? null,
      variantName: quickVariant?.displayName ?? null,
      condition:   'NM',
      value:       quickVariant?.price ?? quickAddCard?.value ?? null,
    };
  }

  async function quickAddToCollection() {
    if (!quickAddCard) return;
    try {
      await addToCollection(quickAddCard, quickDetails());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCollAdded(true);
    } catch (e) {
      Alert.alert('Could not add', (e as Error).message);
    }
  }
  async function quickAddToBinder(binderId: string) {
    if (!quickAddCard) return;
    try {
      await addCardToBinder(binderId, quickAddCard, quickDetails());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setBinderAdded(prev => new Set(prev).add(binderId));
    } catch (e) {
      Alert.alert('Could not add', (e as Error).message);
    }
  }

  // Three columns that fill the row: split the content width (screen minus the
  // horizontal screen padding) evenly, accounting for the inter-column gaps.
  const cellWidth = useMemo(
    () => Math.floor((screenW - Spacing.lg * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS),
    [screenW],
  );

  // Debounce so a query fires once per pause in typing, not per keystroke.
  const debouncedQuery = useDebouncedValue(query, 250);

  // Known set names power the smart dual search (e.g. name + set in one query).
  const { data: expansionNames = [] } = useExpansionNames();

  const {
    data,
    error,
    isFetching,
    isFetchingNextPage,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
  } = useSearchCards(debouncedQuery, activeFilter, sort, expansionNames);

  // Exact total found, independent of how many pages have loaded so far.
  const { data: totalCount } = useSearchCount(debouncedQuery, activeFilter, expansionNames);

  // Dedupe across pages — pagination can repeat a row if the result set
  // shifts between fetches, and FlatList keys must be unique.
  const results = useMemo(() => {
    const flat = data?.pages.flat() ?? [];
    const seen = new Set<string>();
    return flat.filter(c => (seen.has(c.id) ? false : (seen.add(c.id), true)));
  }, [data]);

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
            placeholder="Search name, set, artist, rarity…"
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

      <FlatList
        data={sortedResults}
        keyExtractor={card => card.id}
        numColumns={3}
        columnWrapperStyle={styles.gridRow}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        windowSize={7}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        renderItem={({ item, index }) => <ResultCell card={item} index={index} width={cellWidth} onQuickAdd={openQuickAdd} />}
        ListHeaderComponent={
          <>
            {isError && <ErrorPanel error={error} onRetry={refetch} />}

            <View style={styles.resultsHeader}>
              <Text style={styles.sectionLabel}>
                {query.trim().length >= 2
                  ? `${(totalCount ?? results.length).toLocaleString()} results`
                  : 'Start typing to search'}
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
                {[0, 1, 2].map(i => <SkeletonCard key={i} width={cellWidth} />)}
              </View>
            )}

            {/* Empty state — query entered, no results, not fetching */}
            {!isFetching && !isError && query.trim().length >= 2 && results.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No cards match</Text>
                <Text style={styles.emptySubtitle}>
                  Try a different name, set, or filter.
                </Text>
              </View>
            )}
          </>
        }
        ListFooterComponent={
          isFetchingNextPage
            ? <ActivityIndicator style={styles.loadingMore} color={Colors.gold} />
            : null
        }
      />

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

      {/* Quick-add sheet — file a result into the collection or a binder */}
      <Modal visible={!!quickAddCard} transparent animationType="slide" onRequestClose={closeQuickAdd}>
        <Pressable style={styles.overlay} onPress={closeQuickAdd} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Quick add</Text>
          {quickAddCard && (
            <Text style={styles.quickCardName} numberOfLines={1}>
              {quickAddCard.name}
            </Text>
          )}

          {/* Printing picker — only when the card has multiple. Always filed NM. */}
          {quickVariants.length > 1 && (
            <>
              <Text style={styles.quickSectionLabel}>Printing · NM</Text>
              <View style={styles.quickVariantWrap}>
                {quickVariants.map(v => {
                  const active = v.id === quickVariantId;
                  return (
                    <TouchableOpacity
                      key={v.id ?? 'standard'}
                      style={[styles.quickVariantPill, active && styles.quickVariantPillActive]}
                      onPress={() => selectQuickVariant(v.id)}
                    >
                      <Text style={[styles.quickVariantText, active && styles.quickVariantTextActive]}>
                        {v.displayName}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          <ScrollView style={styles.quickList} keyboardShouldPersistTaps="handled">
            <TouchableOpacity
              style={[styles.quickRow, collAdded && styles.quickRowDone]}
              onPress={quickAddToCollection}
              disabled={collAdded}
            >
              <View style={[styles.quickSwatch, { backgroundColor: Colors.goldFaint }]}>
                <Icon name={collAdded ? 'check' : 'plus'} size={14} color={Colors.gold} />
              </View>
              <Text style={styles.quickRowText}>
                {collAdded ? 'Added to collection' : 'Add to collection'}
              </Text>
            </TouchableOpacity>

            {quickBinders.length > 0 && <Text style={styles.quickSectionLabel}>Binders</Text>}
            {quickBinders.map(b => {
              const done = binderAdded.has(b.id);
              return (
                <TouchableOpacity
                  key={b.id}
                  style={[styles.quickRow, done && styles.quickRowDone]}
                  onPress={() => quickAddToBinder(b.id)}
                  disabled={done}
                >
                  <View style={[styles.quickSwatch, { backgroundColor: b.tone[0] }]} />
                  <Text style={styles.quickRowText} numberOfLines={1}>{b.name}</Text>
                  <Icon name={done ? 'check' : 'plus'} size={14} color={done ? Colors.gold : Colors.text3} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
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
    borderColor: Colors.goldBorder,
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
  gridRow: {
    gap: GRID_GAP,
    marginBottom: 10,
  },
  gridCell: {
    // width is set dynamically so three columns fill the row edge-to-edge
  },
  gridName: {
    fontFamily: FontFamily.display,
    fontSize: 11,
    color: Colors.text,
    marginTop: 6,
    lineHeight: 13,
  },
  gridSet: {
    fontFamily: FontFamily.mono,
    fontSize: 8,
    letterSpacing: 0.5,
    color: Colors.text3,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  gridPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  gridPrice: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    color: Colors.gold,
  },
  gridTrend: {
    fontFamily: FontFamily.mono,
    fontSize: 8,
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
    borderColor: Colors.goldBorder,
    backgroundColor: Colors.goldFaint,
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
    backgroundColor: Colors.scrim,
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
  quickAddBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,10,12,0.72)',
    borderWidth: 1,
    borderColor: Colors.goldBorder,
  },
  quickCardName: {
    fontFamily: FontFamily.display,
    fontSize: 18,
    color: Colors.text,
    marginBottom: 12,
  },
  quickList: {
    maxHeight: 360,
  },
  quickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  quickRowDone: {
    opacity: 0.6,
  },
  quickRowText: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: Colors.text,
  },
  quickSwatch: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.line,
  },
  quickSectionLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: Colors.text3,
    marginTop: 16,
    marginBottom: 4,
  },
  quickVariantWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
    marginBottom: 4,
  },
  quickVariantPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.surface,
  },
  quickVariantPillActive: { borderColor: Colors.gold, backgroundColor: Colors.goldTint },
  quickVariantText: { fontFamily: FontFamily.bodySemi, fontSize: 13, color: Colors.text2 },
  quickVariantTextActive: { color: Colors.gold },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontFamily: FontFamily.display,
    fontSize: 22,
    color: Colors.text3,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: Colors.text3,
    textAlign: 'center',
  },
});
