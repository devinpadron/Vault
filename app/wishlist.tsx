import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Card3D } from '@/components/cards/Card3D';
import { SkeletonCardCell } from '@/components/ui/SkeletonCard';
import { Icon } from '@/components/ui/Icon';
import { useWishlistCards } from '@/lib/db/wishlist';
import { fmt } from '@/lib/format';
import { Colors, FontFamily, Spacing } from '@/constants/theme';
import { Card, cardBaseName, cardNameVariant } from '@/types';

function CardCell({ card, index }: { card: Card; index: number }) {
  return (
    <Animated.View
      entering={FadeInDown.delay(index * 20).duration(280)}
      style={styles.cellWrapper}
    >
      <Card3D card={card} width={158} onPress={() => router.push(`/card/${card.id}`)} />
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
            <Text style={styles.price}>${fmt(card.value)}</Text>
          ) : (
            <Text style={[styles.price, { color: Colors.text3 }]}>—</Text>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

export default function WishlistScreen() {
  const insets = useSafeAreaInsets();
  const { data: cards = [], isLoading } = useWishlistCards();

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
                {isLoading ? 'Loading…' : `${cards.length} cards`}
              </Text>
              <Text style={styles.title}>
                The <Text style={styles.titleAccent}>wishlist</Text>
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => router.back()}
              accessibilityLabel="Close wishlist"
            >
              <Icon name="close" size={18} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {isLoading && (
            <>
              {Array.from({ length: 3 }, (_, i) => (
                <View key={i} style={styles.row}>
                  <SkeletonCardCell width={158} />
                  <SkeletonCardCell width={158} />
                </View>
              ))}
            </>
          )}
        </>
      }
      ListEmptyComponent={
        !isLoading ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Nothing wished for yet</Text>
            <Text style={styles.emptySubtitle}>
              Tap the heart on any card to save it here. The wishlist syncs to
              your collection once you add the card for real.
            </Text>
          </View>
        ) : null
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
    marginBottom: 22,
  },
  headerText: {
    flex: 1,
  },
  closeBtn: {
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
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontFamily: FontFamily.display,
    fontSize: 22,
    color: Colors.text3,
    marginBottom: 10,
  },
  emptySubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: Colors.text3,
    textAlign: 'center',
    lineHeight: 20,
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
});
