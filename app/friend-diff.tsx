// Friend collection diff. Reached from a friend's profile > "Compare collections".
// Shows what you both own, what only you own, and what only they own. Your cards
// come from the local mirror; theirs from Supabase under RLS (public main
// collection only).

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
import { EmptyState } from '@/components/ui/EmptyState';
import { useFriendCollectionDiff } from '@/lib/api/friends';
import { Colors, FontFamily, NavButtonStyle, PressOpacity, Radius, Spacing } from '@/constants/theme';
import { Card } from '@/types';

const NUM_COLS = 3;
const COL_GAP = 12;

function getThumbWidth(screenWidth: number) {
  const inner = screenWidth - Spacing.xl * 2;
  return Math.floor((inner - COL_GAP * (NUM_COLS - 1)) / NUM_COLS);
}

type Section = 'onlyTheirs' | 'onlyMine' | 'mutual';

type GridRow =
  | { kind: 'section'; title: string; subtitle: string }
  | { kind: 'cards'; cards: (Card | null)[]; section: Section };

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

function countLabel(n: number) {
  return `${n} card${n === 1 ? '' : 's'}`;
}

export default function FriendDiffScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const friendId = params.id ?? '';
  const friendName = params.name ? decodeURIComponent(params.name) : 'them';
  const insets = useSafeAreaInsets();
  const thumbWidth = getThumbWidth(Dimensions.get('window').width);

  const { data, isLoading, isError, error, refetch } = useFriendCollectionDiff(friendId);
  const onlyTheirs = useMemo(() => data?.onlyTheirs ?? [], [data?.onlyTheirs]);
  const onlyMine   = useMemo(() => data?.onlyMine   ?? [], [data?.onlyMine]);
  const mutual     = useMemo(() => data?.mutual     ?? [], [data?.mutual]);
  const isPrivate  = data?.private ?? false;

  const rows = useMemo<GridRow[]>(() => {
    const out: GridRow[] = [];
    const push = (section: Section, title: string, cards: Card[]) => {
      if (cards.length === 0) return;
      out.push({ kind: 'section', title, subtitle: countLabel(cards.length) });
      for (const c of chunk(cards, NUM_COLS)) out.push({ kind: 'cards', cards: c, section });
    };
    push('onlyTheirs', `${friendName} has · you don't`, onlyTheirs);
    push('onlyMine', `You have · ${friendName} doesn't`, onlyMine);
    push('mutual', 'You both have', mutual);
    return out;
  }, [onlyTheirs, onlyMine, mutual, friendName]);

  const showEmpty = !isLoading && !isError && !isPrivate && rows.length === 0;

  return (
    <View style={styles.root}>
      <FlatList<GridRow>
        data={rows}
        keyExtractor={(item, i) =>
          item.kind === 'section'
            ? `s-${item.title}`
            : `r-${item.section}-${item.cards[0]?.id ?? i}`
        }
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

            <Text style={styles.eyebrow}>COMPARE</Text>
            <Text style={styles.title}>You & {friendName}</Text>

            <View style={styles.summaryCard}>
              <SummaryStat label="THEY HAVE" value={onlyTheirs.length} />
              <View style={styles.summaryDivider} />
              <SummaryStat label="YOU HAVE" value={onlyMine.length} />
              <View style={styles.summaryDivider} />
              <SummaryStat label="SHARED" value={mutual.length} />
            </View>

            {isLoading && <Text style={styles.loadingText}>Comparing collections…</Text>}
            {isError && (
              <View style={{ marginTop: 16 }}>
                <ErrorPanel message="Couldn't compare collections" error={error as Error} onRetry={refetch} />
              </View>
            )}
            {isPrivate && (
              <EmptyState
                icon="eye-off"
                title="Collection is private"
                caption={`${friendName} hasn't shared a public collection yet.`}
              />
            )}
            {showEmpty && (
              <EmptyState
                icon="compare"
                title="Nothing to compare"
                caption="Neither of you has cards in a public collection yet."
              />
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
                      activeOpacity={PressOpacity}
                      accessibilityRole="button"
                      accessibilityLabel={c.name}
                    >
                      <CardThumb card={c} width={thumbWidth} />
                      <Text style={styles.gridCardName} numberOfLines={1}>{c.name}</Text>
                      <Text style={styles.gridCardNumber} numberOfLines={1}>{c.no}</Text>
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

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingHorizontal: Spacing.xl },
  navBar: { flexDirection: 'row', paddingBottom: 12 },
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
    backgroundColor: Colors.goldFaint,
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
  summaryDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: Colors.line,
    marginHorizontal: 18,
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
    fontSize: 20,
    color: Colors.text,
    flex: 1,
  },
  sectionSubtitle: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    color: Colors.text3,
    marginLeft: 10,
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
});
