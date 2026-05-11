import { useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Card3D } from '@/components/cards/Card3D';
import { SkeletonCardCell } from '@/components/ui/SkeletonCard';
import { FilterPills } from '@/components/ui/FilterPills';
import { Icon } from '@/components/ui/Icon';
import { useCards } from '@/lib/api/cards';
import { Colors, FontFamily, Spacing } from '@/constants/theme';
import { Card, cardBaseName, cardNameVariant } from '@/types';

const FILTERS = ['All', 'Foil', 'Set', 'Rarity', 'Value'];

function fmt(n: number) {
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n.toFixed(2);
}

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
        <View style={styles.priceRow}>
          <Text style={styles.price}>${fmt(card.value)}</Text>
          {card.change !== 0 && (
            <Text style={[styles.change, { color: card.change > 0 ? Colors.up : Colors.down }]}>
              {card.change > 0 ? '↑' : '↓'} {Math.abs(card.change).toFixed(0)}
            </Text>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

export default function CollectionScreen() {
  const [filter, setFilter] = useState('All');
  const insets = useSafeAreaInsets();
  const { data: allCards = [], isLoading } = useCards();

  const cards = allCards.filter((c: Card) => filter === 'Foil' ? c.foil : true);

  const pairs: [Card, Card | null][] = [];
  for (let i = 0; i < cards.length; i += 2) {
    pairs.push([cards[i], cards[i + 1] ?? null]);
  }

  return (
    <FlatList
      data={isLoading ? [] : pairs}
      keyExtractor={(_, i) => String(i)}
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: 100 }]}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>
                {isLoading ? 'Loading…' : `${cards.length} cards · ${new Set(cards.map(c => c.set)).size} sets`}
              </Text>
              <Text style={styles.title}>
                Your{' '}
                <Text style={styles.titleAccent}>collection</Text>
              </Text>
            </View>
            <TouchableOpacity
              style={styles.bindersBtn}
              onPress={() => router.push('/(tabs)/binders')}
              accessibilityLabel="Open binders"
            >
              <Icon name="binders" size={18} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.filterRow}>
            <FilterPills options={FILTERS} value={filter} onChange={setFilter} />
            <TouchableOpacity style={styles.sortBtn}>
              <Icon name="sort" size={14} color={Colors.text} />
              <Text style={styles.sortLabel}>Sort</Text>
            </TouchableOpacity>
          </View>

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
  headerText: {
    flex: 1,
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
    marginBottom: 6,
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
    marginHorizontal: -Spacing.xl,
    marginBottom: 18,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginRight: Spacing.xl,
    flexShrink: 0,
  },
  sortLabel: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: Colors.text,
  },
  row: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 14,
  },
  cellWrapper: {
    flex: 1,
    gap: 8,
  },
  cellMeta: {
    paddingLeft: 2,
  },
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
  change: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
  },
});
