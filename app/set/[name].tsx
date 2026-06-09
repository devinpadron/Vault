// Set completion drill-down. Reached from Collection > Sets > tap a row.
// Shows owned cards + the cards in the set the user is still missing.
// Missing-card lookup hits Supabase; owned comes from the local mirror.

import { useMemo } from 'react';
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardThumb } from '@/components/cards/CardThumb';
import { Icon } from '@/components/ui/Icon';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import { useSetDrilldown } from '@/lib/db/sets';
import { Colors, FontFamily, NavButtonStyle, Radius, Spacing } from '@/constants/theme';
import { Card } from '@/types';

const NUM_COLS = 3;
const COL_GAP = 12;

function getThumbWidth(screenWidth: number) {
  const inner = screenWidth - Spacing.xl * 2;
  return Math.floor((inner - COL_GAP * (NUM_COLS - 1)) / NUM_COLS);
}

type GridRow =
  | { kind: 'section'; title: string; subtitle: string }
  | { kind: 'cards';   cards: (Card | null)[]; section: 'owned' | 'missing' };

function chunk(cards: Card[], size: number): (Card | null)[][] {
  if (cards.length === 0) return [];
  const rows: (Card | null)[][] = [];
  for (let i = 0; i < cards.length; i += size) {
    const slice = cards.slice(i, i + size) as (Card | null)[];
    while (slice.length < size) slice.push(null);
    rows.push(slice);
  }
  return rows;
}

export default function SetDetailScreen() {
  const params = useLocalSearchParams<{ name: string; expId?: string }>();
  const setName = decodeURIComponent(params.name ?? '');
  const expansionId = params.expId && params.expId.length > 0 ? params.expId : null;
  const insets = useSafeAreaInsets();
  const thumbWidth = getThumbWidth(Dimensions.get('window').width);

  const { data, isLoading, isError, error, refetch } = useSetDrilldown(setName, expansionId);
  const owned   = useMemo(() => data?.owned   ?? [], [data?.owned]);
  const missing = useMemo(() => data?.missing ?? [], [data?.missing]);

  const rows = useMemo<GridRow[]>(() => {
    const out: GridRow[] = [];
    if (owned.length > 0) {
      out.push({
        kind: 'section',
        title: 'Owned',
        subtitle: `${owned.length} card${owned.length === 1 ? '' : 's'}`,
      });
      for (const c of chunk(owned, NUM_COLS)) out.push({ kind: 'cards', cards: c, section: 'owned' });
    }
    if (missing.length > 0) {
      out.push({
        kind: 'section',
        title: 'Missing',
        subtitle: `${missing.length} card${missing.length === 1 ? '' : 's'}`,
      });
      for (const c of chunk(missing, NUM_COLS)) out.push({ kind: 'cards', cards: c, section: 'missing' });
    }
    return out;
  }, [owned, missing]);

  const total = owned.length + missing.length;
  const percent = total > 0 ? Math.round((owned.length / total) * 100) : 0;

  return (
    <View style={styles.root}>
      <FlatList<GridRow>
        data={rows}
        keyExtractor={(item, i) => (item.kind === 'section' ? `s-${item.title}` : `r-${i}`)}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <View style={styles.navBar}>
              <TouchableOpacity style={styles.navBtn} onPress={() => router.back()}>
                <Icon name="chevron-left" size={18} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.eyebrow}>SET</Text>
            <Text style={styles.title}>{setName}</Text>

            <View style={styles.summaryCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.summaryLabel}>COMPLETION</Text>
                <Text style={styles.summaryValue}>{percent}%</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={{ flex: 1 }}>
                <Text style={styles.summaryLabel}>OWNED</Text>
                <Text style={styles.summaryValue}>{owned.length}<Text style={styles.summaryOf}> / {total}</Text></Text>
              </View>
            </View>

            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${percent}%` }]} />
            </View>

            {isLoading && (
              <Text style={styles.loadingText}>Loading set…</Text>
            )}
            {isError && (
              <View style={{ marginTop: 16 }}>
                <ErrorPanel message="Couldn't load this set" error={error as Error} onRetry={refetch} />
              </View>
            )}
            {!isLoading && !isError && total === 0 && (
              <Text style={styles.emptyText}>
                No cards found for this set. The card metadata may still be syncing.
              </Text>
            )}
          </>
        }
        renderItem={({ item }) => {
          if (item.kind === 'section') {
            return (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{item.title}</Text>
                <Text style={styles.sectionSubtitle}>{item.subtitle}</Text>
              </View>
            );
          }
          return (
            <View style={styles.gridRow}>
              {item.cards.map((c, i) => (
                <View key={i} style={{ width: thumbWidth }}>
                  {c ? (
                    <TouchableOpacity
                      onPress={() => router.push(`/card/${c.id}`)}
                      accessibilityRole="button"
                      accessibilityLabel={c.name}
                    >
                      <CardThumb card={c} width={thumbWidth} />
                      <Text style={styles.gridCardName} numberOfLines={1}>
                        {c.name}
                      </Text>
                      <Text style={styles.gridCardNumber} numberOfLines={1}>
                        {c.no}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    paddingHorizontal: Spacing.xl,
  },
  navBar: {
    flexDirection: 'row',
    paddingBottom: 12,
  },
  navBtn: NavButtonStyle,
  eyebrow: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    color: Colors.text3,
    marginBottom: 6,
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 32,
    color: Colors.text,
    lineHeight: 34,
    marginBottom: 20,
  },
  summaryCard: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,215,0,0.04)',
    marginBottom: 12,
  },
  summaryLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 1.6,
    color: Colors.text3,
    marginBottom: 4,
  },
  summaryValue: {
    fontFamily: FontFamily.display,
    fontSize: 26,
    color: Colors.gold,
    lineHeight: 30,
  },
  summaryOf: {
    fontFamily: FontFamily.mono,
    fontSize: 14,
    color: Colors.text3,
  },
  summaryDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: Colors.line,
    marginHorizontal: 18,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    marginBottom: 24,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.gold,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: FontFamily.display,
    fontSize: 22,
    color: Colors.text,
  },
  sectionSubtitle: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    color: Colors.text3,
  },
  gridRow: {
    flexDirection: 'row',
    gap: COL_GAP,
    marginBottom: 16,
  },
  gridCardName: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: Colors.text,
    marginTop: 6,
  },
  gridCardNumber: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 0.5,
    color: Colors.text3,
    marginTop: 1,
  },
  loadingText: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    color: Colors.text3,
    marginTop: 16,
    textAlign: 'center',
  },
  emptyText: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: Colors.text3,
    marginTop: 16,
    textAlign: 'center',
  },
});
