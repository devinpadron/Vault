import { useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Card3D } from '@/components/cards/Card3D';
import { FilterPills } from '@/components/ui/FilterPills';
import { Icon } from '@/components/ui/Icon';
import { MOCK_DATA } from '@/data/mock';
import { Colors, FontFamily, Spacing } from '@/constants/theme';
import { Card } from '@/types';

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
          {card.name}{' '}
          <Text style={styles.cardVariant}>{card.variant}</Text>
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

  const cards = MOCK_DATA.cards.filter(c => filter === 'Foil' ? c.foil : true);

  const pairs: [Card, Card | null][] = [];
  for (let i = 0; i < cards.length; i += 2) {
    pairs.push([cards[i], cards[i + 1] ?? null]);
  }

  return (
    <FlatList
      data={pairs}
      keyExtractor={(_, i) => String(i)}
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: 100 }]}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>{cards.length} cards · 7 sets</Text>
            <Text style={styles.title}>
              Your{' '}
              <Text style={styles.titleAccent}>collection</Text>
            </Text>
          </View>

          <View style={styles.filterRow}>
            <FilterPills options={FILTERS} value={filter} onChange={setFilter} />
            <TouchableOpacity style={styles.sortBtn}>
              <Icon name="sort" size={14} color={Colors.text} />
              <Text style={styles.sortLabel}>Sort</Text>
            </TouchableOpacity>
          </View>
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
    marginBottom: 4,
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
