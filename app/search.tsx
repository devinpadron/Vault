import { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardThumb } from '@/components/cards/CardThumb';
import { SkeletonCard } from '@/components/ui/SkeletonCard';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import { Icon } from '@/components/ui/Icon';
import { useSearchCards } from '@/lib/api/cards';
import { Colors, FontFamily, Radius, Spacing } from '@/constants/theme';

const FILTERS = ['Name', 'Set/Pack', 'Pokémon', 'Artist', 'Release', 'Rarity'];

function fmt(n: number) {
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n.toFixed(2);
}

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('Name');
  const insets = useSafeAreaInsets();

  const { data: results = [], isFetching, isError, refetch } = useSearchCards(query, activeFilter);

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
      >
        {isError && <ErrorPanel onRetry={refetch} />}

        {/* Results header */}
        <View style={styles.resultsHeader}>
          <Text style={styles.sectionLabel}>
            {query.trim().length >= 2 ? `${results.length} results` : 'Start typing to search'}
          </Text>
          {isFetching && query.trim().length >= 2 && (
            <Text style={styles.live}>● LIVE</Text>
          )}
        </View>

        {/* Skeleton while loading */}
        {isFetching && query.trim().length >= 2 && results.length === 0 && (
          <View style={styles.grid}>
            {[0, 1, 2].map(i => <SkeletonCard key={i} width={104} />)}
          </View>
        )}

        {/* Results grid */}
        {results.length > 0 && (
          <View style={styles.grid}>
            {results.map((card, i) => (
              <TouchableOpacity
                key={`${card.id}-${i}`}
                style={styles.gridCell}
                onPress={() => { router.back(); router.push(`/card/${card.id}`); }}
              >
                <CardThumb card={card} width={104} />
                <Text style={styles.gridName} numberOfLines={1}>{card.name}</Text>
                <Text style={styles.gridPrice}>${fmt(card.value)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
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
});
