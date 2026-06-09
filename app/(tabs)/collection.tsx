import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Card3D } from '@/components/cards/Card3D';
import { SkeletonCardCell } from '@/components/ui/SkeletonCard';
import { Icon } from '@/components/ui/Icon';
import { ActiveFilterChips } from '@/components/ui/ActiveFilterChips';
import { FilterSheet, FilterTriggerButton } from '@/components/ui/FilterSheet';
import {
  useCollectionEntries,
  usePortfolioSummary,
  useCollectionVisibility,
  useSetCollectionVisibility,
  useRemoveFromCollection,
} from '@/lib/db/collection';
import { useBinders, useAddCardToBinder } from '@/lib/api/binders';
import { VisibilityChip } from '@/components/ui/VisibilityChip';
import { useSetCompletion, SetCompletion } from '@/lib/db/sets';
import {
  CollectionFilters, EMPTY_FILTERS,
  activeFilterCount, applyFilters,
} from '@/lib/filters/collection';
import { fmt } from '@/lib/format';
import { useAuth } from '@/lib/auth/AuthContext';
import { Colors, FontFamily, Radius, Spacing } from '@/constants/theme';
import { Card, cardBaseName, cardNameVariant } from '@/types';

function signed(n: number): string {
  if (n === 0) return `$${fmt(0)}`;
  return `${n > 0 ? '+' : '−'}$${fmt(Math.abs(n))}`;
}

function PortfolioSummaryCard({
  currentValue, unrealized, realizedYtd, itemsWithBasis, itemCount,
}: {
  currentValue: number;
  unrealized: number;
  realizedYtd: number;
  itemsWithBasis: number;
  itemCount: number;
}) {
  const allBasisSet = itemsWithBasis === itemCount;
  return (
    <View style={styles.portfolioCard}>
      <View style={styles.portfolioMain}>
        <Text style={styles.portfolioLabel}>CURRENT VALUE</Text>
        <Text style={styles.portfolioValue}>${fmt(currentValue)}</Text>
      </View>
      <View style={styles.portfolioStats}>
        <View style={styles.portfolioStat}>
          <Text style={styles.portfolioStatLabel}>UNREALIZED</Text>
          <Text
            style={[
              styles.portfolioStatValue,
              { color: unrealized >= 0 ? Colors.up : Colors.down },
            ]}
          >
            {signed(unrealized)}
          </Text>
          {!allBasisSet && (
            <Text style={styles.portfolioStatHint}>
              {itemsWithBasis}/{itemCount} priced
            </Text>
          )}
        </View>
        <View style={styles.portfolioStatDivider} />
        <View style={styles.portfolioStat}>
          <Text style={styles.portfolioStatLabel}>REALIZED YTD</Text>
          <Text
            style={[
              styles.portfolioStatValue,
              { color: realizedYtd >= 0 ? Colors.up : Colors.down },
            ]}
          >
            {signed(realizedYtd)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function ViewToggleButton({
  label, active, onPress,
}: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.viewToggleBtn, active && styles.viewToggleBtnActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.viewToggleText, active && styles.viewToggleTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SetProgressRow({ set }: { set: SetCompletion }) {
  return (
    <TouchableOpacity
      style={styles.setRow}
      onPress={() => router.push({
        // Typed routes regenerate when the dev server runs; this cast is just
        // to satisfy the stale type union for the freshly-added set route.
        pathname: '/set/[name]' as never,
        params: { name: set.setName, expId: set.expansionId ?? '' },
      })}
      accessibilityRole="button"
      accessibilityLabel={`${set.setName}, ${set.owned} of ${set.total}`}
    >
      <View style={styles.setInfo}>
        <Text style={styles.setName} numberOfLines={1}>{set.setName}</Text>
        {set.series && (
          <Text style={styles.setSeries} numberOfLines={1}>{set.series}</Text>
        )}
        <View style={styles.setProgressTrack}>
          <View style={[styles.setProgressFill, { width: `${set.percent}%` }]} />
        </View>
      </View>
      <View style={styles.setNumbers}>
        <Text style={styles.setPercent}>{set.percent}%</Text>
        <Text style={styles.setCount}>{set.owned}/{set.total}</Text>
      </View>
    </TouchableOpacity>
  );
}

function BulkActionBar({
  count,
  onMoveToBinder,
  onDelete,
  onCancel,
  bottomInset,
}: {
  count: number;
  onMoveToBinder: () => void;
  onDelete: () => void;
  onCancel: () => void;
  bottomInset: number;
}) {
  return (
    <View
      style={[
        styles.bulkBar,
        { paddingBottom: Math.max(bottomInset, 12) },
      ]}
    >
      <View style={styles.bulkBarInner}>
        <TouchableOpacity
          onPress={onCancel}
          style={styles.bulkClose}
          accessibilityRole="button"
          accessibilityLabel="Clear selection"
        >
          <Icon name="close" size={18} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.bulkCount}>
          {count} {count === 1 ? 'card' : 'cards'}
        </Text>
        <View style={styles.bulkActions}>
          <TouchableOpacity
            style={styles.bulkAction}
            onPress={onMoveToBinder}
            accessibilityRole="button"
            accessibilityLabel="Move to binder"
          >
            <Icon name="binders" size={18} color={Colors.text} />
            <Text style={styles.bulkActionLabel}>MOVE</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.bulkAction}
            onPress={onDelete}
            accessibilityRole="button"
            accessibilityLabel="Delete selected"
          >
            <Icon name="trash" size={18} color={Colors.down} />
            <Text style={[styles.bulkActionLabel, { color: Colors.down }]}>DELETE</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

interface CardCellProps {
  card: Card;
  index: number;
  selected: boolean;
  selectionMode: boolean;
  onPress: (card: Card) => void;
  onLongPress: (card: Card) => void;
}

function CardCell({ card, index, selected, selectionMode, onPress, onLongPress }: CardCellProps) {
  return (
    <Animated.View
      entering={FadeInDown.delay(index * 20).duration(280)}
      style={styles.cellWrapper}
    >
      <View style={styles.cardSlot}>
        <Card3D
          card={card}
          width={158}
          onPress={() => onPress(card)}
          onLongPress={() => onLongPress(card)}
        />
        {selectionMode && (
          <View
            pointerEvents="none"
            style={[styles.selectionOverlay, selected && styles.selectionOverlaySelected]}
          >
            <View style={[styles.selectionBadge, selected && styles.selectionBadgeSelected]}>
              {selected && <Icon name="check" size={14} color="#0A0A0C" />}
            </View>
          </View>
        )}
      </View>
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

type ViewMode = 'cards' | 'sets';

export default function CollectionScreen() {
  const [filters, setFilters] = useState<CollectionFilters>(EMPTY_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const insets = useSafeAreaInsets();
  const { data: entries = [], isLoading } = useCollectionEntries();
  const portfolio = usePortfolioSummary();
  const { data: setRows = [], isLoading: setsLoading } = useSetCompletion();
  const { data: visibility } = useCollectionVisibility('collection');
  const setVisibility = useSetCollectionVisibility();
  const { data: binderList = [] } = useBinders();
  const addToBinder = useAddCardToBinder();
  const removeFromCollection = useRemoveFromCollection();
  const { mirrorSync, retryMirrorSync } = useAuth();

  // ── Bulk selection state ───────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [binderPickerOpen, setBinderPickerOpen] = useState(false);
  const selectionMode = selectedIds.size > 0;

  const handleCardPress = useCallback((card: Card) => {
    if (selectionMode) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(card.id)) next.delete(card.id);
        else next.add(card.id);
        return next;
      });
    } else {
      router.push(`/card/${card.id}`);
    }
  }, [selectionMode]);

  const handleCardLongPress = useCallback((card: Card) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.add(card.id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  async function handleBulkMoveToBinder(binderId: string) {
    const ids = Array.from(selectedIds);
    const cardsById = new Map(entries.map(e => [e.card.id, e.card]));
    setBinderPickerOpen(false);
    let added = 0;
    for (const id of ids) {
      const card = cardsById.get(id);
      if (!card) continue;
      try {
        await addToBinder(binderId, card);
        added += 1;
      } catch { /* idempotent — already-in-binder is a no-op upstream */ }
    }
    clearSelection();
    Alert.alert('Moved', `Added ${added} card${added === 1 ? '' : 's'} to the binder.`);
  }

  function confirmBulkDelete() {
    const n = selectedIds.size;
    Alert.alert(
      `Remove ${n} card${n === 1 ? '' : 's'}?`,
      'They\'ll be removed from your collection. Sales history isn\'t recorded — use single-card "Sold" if you want realized P/L.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const ids = Array.from(selectedIds);
            for (const id of ids) {
              try { await removeFromCollection(id); } catch { /* swallow */ }
            }
            clearSelection();
          },
        },
      ],
    );
  }

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

  type Row =
    | { kind: 'card'; pair: [Card, Card | null]; index: number }
    | { kind: 'set';  set: SetCompletion };

  const rows: Row[] = viewMode === 'cards'
    ? pairs.map((pair, index) => ({ kind: 'card' as const, pair, index }))
    : setRows.map(set => ({ kind: 'set' as const, set }));

  const listLoading = viewMode === 'cards' ? isLoading : setsLoading;
  const portfolioVisible = portfolio.itemCount > 0;

  return (
    <>
      <FlatList<Row>
        data={listLoading ? [] : rows}
        keyExtractor={(row, i) =>
          row.kind === 'set' ? `set-${row.set.setName}` : `card-${i}`
        }
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !listLoading && rows.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>
                {viewMode === 'sets'
                  ? entries.length === 0 ? 'No sets yet' : 'No sets'
                  : entries.length === 0 ? 'No cards yet' : 'No matches'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {entries.length === 0
                  ? 'Search for cards and tap "Add to collection" to start building your vault.'
                  : viewMode === 'sets'
                    ? 'Your cards aren’t matching any known set yet.'
                    : 'No cards match these filters. Try clearing some.'}
              </Text>
              {viewMode === 'cards' && entries.length > 0 && (
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
                <View style={styles.visibilityRow}>
                  <VisibilityChip
                    isPublic={visibility?.isPublic ?? false}
                    surfaceLabel="your collection"
                    onToggle={() => setVisibility({ kind: 'collection' }, !(visibility?.isPublic ?? false))}
                  />
                </View>
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

            {mirrorSync.state === 'error' && (
              <View style={styles.syncBanner}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.syncBannerLabel}>SYNC FAILED</Text>
                  <Text style={styles.syncBannerText}>
                    Couldn&apos;t pull your collection from the cloud. Cards added on other devices may not show.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.syncBannerBtn}
                  onPress={retryMirrorSync}
                  accessibilityRole="button"
                  accessibilityLabel="Retry sync"
                >
                  <Text style={styles.syncBannerBtnText}>RETRY</Text>
                </TouchableOpacity>
              </View>
            )}

            {portfolioVisible && (
              <PortfolioSummaryCard
                currentValue={portfolio.currentValue}
                unrealized={portfolio.unrealized}
                realizedYtd={portfolio.realizedYtd}
                itemsWithBasis={portfolio.itemsWithBasis}
                itemCount={portfolio.itemCount}
              />
            )}

            <View style={styles.viewToggleRow}>
              <ViewToggleButton
                label="CARDS"
                active={viewMode === 'cards'}
                onPress={() => setViewMode('cards')}
              />
              <ViewToggleButton
                label="SETS"
                active={viewMode === 'sets'}
                onPress={() => setViewMode('sets')}
              />
            </View>

            {viewMode === 'cards' && (
              <>
                <View style={styles.filterRow}>
                  <FilterTriggerButton count={activeCount} onPress={() => setSheetOpen(true)} />
                </View>

                {activeCount > 0 && (
                  <View style={styles.chipsWrapper}>
                    <ActiveFilterChips filters={filters} onChange={setFilters} />
                  </View>
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
            )}
          </>
        }
        renderItem={({ item }) => {
          if (item.kind === 'set') {
            return <SetProgressRow set={item.set} />;
          }
          const [left, right] = item.pair;
          return (
            <View style={styles.row}>
              <CardCell
                card={left}
                index={item.index * 2}
                selected={selectedIds.has(left.id)}
                selectionMode={selectionMode}
                onPress={handleCardPress}
                onLongPress={handleCardLongPress}
              />
              {right ? (
                <CardCell
                  card={right}
                  index={item.index * 2 + 1}
                  selected={selectedIds.has(right.id)}
                  selectionMode={selectionMode}
                  onPress={handleCardPress}
                  onLongPress={handleCardLongPress}
                />
              ) : (
                <View style={styles.cellWrapper} />
              )}
            </View>
          );
        }}
      />

      {/* Floating bottom action bar — visible only when 1+ cards selected. */}
      {selectionMode && (
        <BulkActionBar
          count={selectedIds.size}
          onMoveToBinder={() => setBinderPickerOpen(true)}
          onDelete={confirmBulkDelete}
          onCancel={clearSelection}
          bottomInset={insets.bottom}
        />
      )}

      {/* Binder picker for bulk move. */}
      <Modal
        visible={binderPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setBinderPickerOpen(false)}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setBinderPickerOpen(false)}
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetGrabber} />
          <Text style={styles.sheetEyebrow}>
            {selectedIds.size} {selectedIds.size === 1 ? 'card' : 'cards'} selected
          </Text>
          <Text style={styles.sheetTitle}>Move to which binder?</Text>
          {binderList.length === 0 ? (
            <Text style={styles.sheetEmpty}>
              No binders yet. Create one from the Binders tab.
            </Text>
          ) : (
            binderList.filter(b => !b.rules).map(b => (
              <TouchableOpacity
                key={b.id}
                style={styles.binderRow}
                onPress={() => handleBulkMoveToBinder(b.id)}
                accessibilityRole="button"
                accessibilityLabel={`Move to ${b.name}`}
              >
                <LinearGradient
                  colors={b.tone}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.binderThumb}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.binderName}>{b.name}</Text>
                  <Text style={styles.binderCount}>{b.count} CARDS</Text>
                </View>
                <Icon name="chevron-right" size={16} color={Colors.text3} />
              </TouchableOpacity>
            ))
          )}
        </View>
      </Modal>

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
  visibilityRow: {
    flexDirection: 'row',
    marginTop: 8,
    marginBottom: 10,
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
    marginBottom: 18,
    marginTop: 14,
  },
  chipsWrapper: {
    marginTop: -12,
    marginBottom: 10,
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
  cardSlot: { position: 'relative' },
  // Tinted overlay + corner badge that appears in selection mode.
  selectionOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 10,
  },
  selectionOverlaySelected: {
    backgroundColor: 'rgba(255,215,0,0.18)',
    borderWidth: 2,
    borderColor: Colors.gold,
  },
  selectionBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionBadgeSelected: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
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
  // Cloud-mirror sync failure banner — sits above the filter row when
  // pullCollectionsFromCloud bombs out (offline, RLS error, etc.).
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    marginTop: 10,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,92,92,0.3)',
    backgroundColor: 'rgba(255,92,92,0.08)',
  },
  syncBannerLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 1.6,
    color: Colors.down,
    marginBottom: 4,
  },
  syncBannerText: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: Colors.text,
    lineHeight: 16,
  },
  syncBannerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,92,92,0.4)',
  },
  syncBannerBtnText: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    color: Colors.down,
  },
  // Portfolio summary header card — total value + unrealized + realized YTD.
  portfolioCard: {
    marginTop: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,215,0,0.04)',
  },
  portfolioMain: {
    marginBottom: 14,
  },
  portfolioLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 1.6,
    color: Colors.text3,
    marginBottom: 4,
  },
  portfolioValue: {
    fontFamily: FontFamily.display,
    fontSize: 30,
    color: Colors.gold,
    lineHeight: 32,
  },
  portfolioStats: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  portfolioStat: {
    flex: 1,
  },
  portfolioStatDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: Colors.line,
    marginHorizontal: 14,
  },
  portfolioStatLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 1.4,
    color: Colors.text3,
    marginBottom: 4,
  },
  portfolioStatValue: {
    fontFamily: FontFamily.mono,
    fontSize: 14,
  },
  portfolioStatHint: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 0.8,
    color: Colors.text3,
    marginTop: 4,
  },
  // Cards / Sets segmented toggle
  viewToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
  },
  viewToggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  viewToggleBtnActive: {
    backgroundColor: 'rgba(255,215,0,0.12)',
    borderColor: 'rgba(255,215,0,0.4)',
  },
  viewToggleText: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    color: Colors.text3,
  },
  viewToggleTextActive: {
    color: Colors.gold,
  },
  // Set completion row
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  setInfo: {
    flex: 1,
  },
  setName: {
    fontFamily: FontFamily.display,
    fontSize: 18,
    color: Colors.text,
    lineHeight: 22,
  },
  setSeries: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 0.6,
    color: Colors.text3,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  setProgressTrack: {
    marginTop: 10,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  setProgressFill: {
    height: '100%',
    backgroundColor: Colors.gold,
  },
  setNumbers: {
    alignItems: 'flex-end',
  },
  setPercent: {
    fontFamily: FontFamily.mono,
    fontSize: 16,
    color: Colors.gold,
  },
  setCount: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    color: Colors.text3,
    marginTop: 2,
  },
  // ── Bulk selection action bar (floating, bottom of screen) ─────────────
  bulkBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 12,
    paddingHorizontal: Spacing.xl,
    backgroundColor: Colors.elevated,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  bulkBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  bulkClose: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  bulkCount: {
    flex: 1,
    fontFamily: FontFamily.mono,
    fontSize: 12,
    letterSpacing: 0.8,
    color: Colors.text,
  },
  bulkActions: {
    flexDirection: 'row',
    gap: 8,
  },
  bulkAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  bulkActionLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    color: Colors.text,
  },
  // ── Binder picker sheet (reused styling pattern) ──────────────────────
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.elevated,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: Spacing.xl,
    paddingTop: 10,
  },
  sheetGrabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.line,
    marginBottom: 16,
  },
  sheetEyebrow: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    color: Colors.text3,
    marginBottom: 6,
  },
  sheetTitle: {
    fontFamily: FontFamily.display,
    fontSize: 26,
    color: Colors.text,
    marginBottom: 16,
  },
  sheetEmpty: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: Colors.text3,
    paddingVertical: 12,
  },
  binderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  binderThumb: {
    width: 36,
    height: 48,
    borderRadius: 6,
  },
  binderName: {
    fontFamily: FontFamily.display,
    fontSize: 17,
    color: Colors.text,
  },
  binderCount: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 1.2,
    color: Colors.text3,
    marginTop: 2,
  },
});
