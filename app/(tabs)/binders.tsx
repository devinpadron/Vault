import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { CardThumb } from '@/components/cards/CardThumb';
import { Icon } from '@/components/ui/Icon';
import { MOCK_DATA } from '@/data/mock';
import { Colors, FontFamily, Spacing } from '@/constants/theme';
import { Binder } from '@/types';

const totalCards = MOCK_DATA.binders.reduce((sum, b) => sum + b.count, 0);

export default function BindersScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: 100 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>
            {MOCK_DATA.binders.length} binders · {totalCards} cards
          </Text>
          <Text style={styles.title}>
            <Text style={styles.titleAccent}>Binders</Text>
          </Text>
        </View>
        <TouchableOpacity style={styles.addBtn} accessibilityLabel="New binder">
          <Icon name="plus" size={18} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {/* Binder cover cards */}
      <View style={styles.list}>
        {MOCK_DATA.binders.map((binder, index) => (
          <BinderCover
            key={binder.id}
            binder={binder}
            index={index}
            onPress={() => router.push(`/binder/${binder.id}`)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function BinderCover({
  binder,
  index,
  onPress,
}: {
  binder: Binder;
  index: number;
  onPress: () => void;
}) {
  // Second card preview: offset so stacked thumbnails don't repeat the cover
  const secondCard = MOCK_DATA.cards[(index * 2 + 3) % MOCK_DATA.cards.length];

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).duration(320)}>
      <TouchableOpacity
        onPress={onPress}
        style={styles.cover}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel={`Open ${binder.name}`}
      >
        {/* Gradient background */}
        <LinearGradient
          colors={binder.tone}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Spine shadow */}
        <LinearGradient
          colors={['rgba(0,0,0,0.45)', 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.spine}
        />

        {/* Ring dots */}
        <View style={styles.rings}>
          {[0, 1, 2].map(k => (
            <View key={k} style={styles.ring} />
          ))}
        </View>

        {/* Stacked card previews */}
        <View style={[styles.cardPreview, { transform: [{ rotate: '-5deg' }], right: 54, top: 32, opacity: 0.75 }]}>
          <CardThumb card={secondCard} width={56} />
        </View>
        <View style={[styles.cardPreview, { transform: [{ rotate: '8deg' }], right: 18, top: 18 }]}>
          <CardThumb card={binder.cover} width={68} />
        </View>

        {/* Metadata */}
        <View style={styles.meta}>
          <Text style={styles.binderName}>{binder.name}</Text>
          <Text style={styles.binderSubtitle}>{binder.subtitle.toUpperCase()}</Text>
          <View style={styles.countRow}>
            <Text style={styles.binderCount}>{binder.count}</Text>
            <Text style={styles.binderCountLabel}> cards</Text>
          </View>
        </View>

        {/* Gloss highlight */}
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.20)',
            'transparent',
            'transparent',
            'rgba(0,0,0,0.28)',
          ]}
          locations={[0, 0.3, 0.7, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </TouchableOpacity>
    </Animated.View>
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
  eyebrow: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: Colors.text3,
    marginBottom: 4,
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
  addBtn: {
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
  list: {
    gap: 18,
  },
  // Binder cover card
  cover: {
    height: 168,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  spine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 24,
  },
  rings: {
    position: 'absolute',
    left: 6,
    top: 0,
    bottom: 0,
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingVertical: 24,
  },
  ring: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.32)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  cardPreview: {
    position: 'absolute',
  },
  meta: {
    position: 'absolute',
    left: 36,
    bottom: 18,
    right: 100, // leave room for the cards on the right
  },
  binderName: {
    fontFamily: FontFamily.display,
    fontSize: 22,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  binderSubtitle: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
    letterSpacing: 1.2,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 10,
  },
  binderCount: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    color: '#fff',
  },
  binderCountLabel: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
  },
});
