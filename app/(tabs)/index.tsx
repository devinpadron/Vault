import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Card3D } from '@/components/cards/Card3D';
import { SkeletonCard } from '@/components/ui/SkeletonCard';
import { Sparkline } from '@/components/charts/Sparkline';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { NewsRow } from '@/components/news/NewsRow';
import { useFeaturedCard, usePortfolioHistory } from '@/lib/api/cards';
import { useNews } from '@/lib/api/news';
import { useMyProfile } from '@/lib/api/profiles';
import { useAuth } from '@/lib/auth/AuthContext';
import { useCollectionCards } from '@/lib/db/collection';
import { fmt } from '@/lib/format';
import { Colors, FontFamily, Radius, Spacing } from '@/constants/theme';
import { cardBaseName, cardNameVariant } from '@/types';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { data: featured, isLoading: featuredLoading } = useFeaturedCard();
  const { data: news = [] } = useNews();
  const { user } = useAuth();
  const { data: profile } = useMyProfile();
  const { data: collectionCards = [] } = useCollectionCards();

  const totalValue = collectionCards.reduce((sum, c) => sum + c.value, 0);
  const totalChange = collectionCards.reduce((sum, c) => sum + c.change, 0);
  const cardCount = collectionCards.length;

  const totalValueStr = totalValue.toFixed(2);
  const [valuePrimary, valueCents] = totalValueStr.split('.');
  const { data: priceHistory = [] } = usePortfolioHistory('30D');

  const now = new Date();
  const dateLabel = now
    .toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', weekday: 'short' })
    .toUpperCase();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';


  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: 100 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Top bar */}
      <Animated.View entering={FadeInDown.delay(0).duration(340)} style={styles.topBar}>
        <View>
          <Text style={styles.eyebrow}>{dateLabel}</Text>
          <Text style={styles.greeting}>
            {greeting},{'\n'}
            <Text style={styles.greetingName}>{user?.name ?? 'Trainer'}</Text>
          </Text>
        </View>
        <View style={styles.topActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push('/search')}
            accessibilityLabel="Search cards"
            accessibilityRole="button"
          >
            <Icon name="search" size={18} color={Colors.text} />
          </TouchableOpacity>
          {user && (
            <TouchableOpacity
              onPress={() => router.push('/profile')}
              accessibilityLabel="Open profile"
              accessibilityRole="button"
            >
              <Avatar colors={user.avatar} uri={profile?.avatar_url} size={40} />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {/* Stats card */}
      <Animated.View entering={FadeInDown.delay(80).duration(340)} style={styles.statsCard}>
        <Text style={styles.eyebrow}>Collection · Total</Text>
        {cardCount === 0 ? (
          <Text style={[styles.mono, { fontSize: 13, color: Colors.text3, paddingVertical: 14 }]}>
            Add cards to start tracking your collection
          </Text>
        ) : (
          <>
            <View style={styles.statsValue}>
              <Text style={styles.statsSymbol}>$</Text>
              <Text style={styles.statsNumber}>{Number(valuePrimary).toLocaleString('en-US')}</Text>
              <Text style={styles.statsCents}>.{valueCents}</Text>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.statsChange}>
                <Icon name={totalChange >= 0 ? 'arrow-up' : 'arrow-down'} size={13} color={totalChange >= 0 ? Colors.up : Colors.down} />
                <Text style={[styles.mono, { fontSize: 13, color: totalChange >= 0 ? Colors.up : Colors.down }]}>
                  {totalChange >= 0 ? '+' : ''}${fmt(Math.abs(totalChange))}
                </Text>
                <Text style={[styles.mono, { fontSize: 11, color: Colors.text3 }]}>· 30D</Text>
              </View>
              <View style={styles.dividerV} />
              <Text style={[styles.mono, { fontSize: 12, color: Colors.text2 }]}>{cardCount} CARDS</Text>
            </View>
            <Sparkline data={priceHistory} />
          </>
        )}
      </Animated.View>

      {/* Featured card */}
      <Animated.View entering={FadeInDown.delay(160).duration(340)}>
        <View style={styles.sectionHeader}>
          <Text style={styles.eyebrow}>Featured · Card of the week</Text>
        </View>
        <View style={styles.featuredCard}>
          <LinearGradient
            colors={['rgba(122,107,255,0.18)', 'transparent']}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['rgba(255,215,0,0.07)', 'transparent']}
            start={{ x: 0.3, y: 0 }}
            end={{ x: 0.7, y: 0.4 }}
            style={StyleSheet.absoluteFill}
          />
          {featuredLoading || !featured ? (
            <SkeletonCard width={200} />
          ) : (
            <>
              <Card3D
                card={featured}
                width={200}
                sway
                onPress={() => router.push(`/card/${featured.id}`)}
              />
              <View style={styles.featuredMeta}>
                <Text style={styles.featuredName}>
                  {cardBaseName(featured.name)}
                  {cardNameVariant(featured.name) && (
                    <Text style={styles.featuredVariant}> {cardNameVariant(featured.name)}</Text>
                  )}
                </Text>
                <Text style={[styles.mono, { fontSize: 10, color: Colors.text2, marginTop: 6, letterSpacing: 1.6 }]}>
                  {featured.set} · {featured.no}
                </Text>
              </View>
              <View style={styles.chips}>
                <View style={[styles.chip, styles.chipHolo]}>
                  <Text style={styles.chipHoloText}>{featured.rarity.toUpperCase()}</Text>
                </View>
                <View style={[styles.chip, styles.chipGold]}>
                  <Text style={styles.chipGoldText}>${fmt(featured.value)}</Text>
                </View>
              </View>
            </>
          )}
        </View>
      </Animated.View>

      {/* The Brief */}
      <Animated.View entering={FadeInDown.delay(240).duration(340)}>
        <View style={[styles.sectionHeader, { marginTop: 28 }]}>
          <Text style={styles.displayTitle}>The Brief</Text>
          <TouchableOpacity
            onPress={() => router.push('/news')}
            accessibilityRole="button"
            accessibilityLabel="View all news"
          >
            <Text style={[styles.mono, { fontSize: 10, color: Colors.gold, letterSpacing: 1.6 }]}>
              VIEW ALL →
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.newsList}>
          {news.slice(0, 5).map(item => (
            <NewsRow key={item.id} item={item} compact />
          ))}
        </View>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    paddingHorizontal: 0,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingBottom: 18,
  },
  eyebrow: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: Colors.text3,
    marginBottom: 4,
  },
  greeting: {
    fontFamily: FontFamily.display,
    fontSize: 26,
    color: Colors.text,
    lineHeight: 30,
  },
  greetingName: {
    fontFamily: FontFamily.displayItalic,
    color: Colors.gold,
  },
  topActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.glass,
  },
  // Stats card
  statsCard: {
    marginHorizontal: Spacing.xl,
    marginBottom: 26,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,215,0,0.04)',
    overflow: 'hidden',
  },
  statsValue: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    marginBottom: 14,
  },
  statsSymbol: {
    fontFamily: FontFamily.display,
    fontSize: 44,
    color: Colors.text,
    lineHeight: 48,
  },
  statsNumber: {
    fontFamily: FontFamily.monoMed,
    fontSize: 40,
    color: Colors.text,
    lineHeight: 46,
  },
  statsCents: {
    fontFamily: FontFamily.monoMed,
    fontSize: 16,
    color: Colors.text2,
    lineHeight: 28,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 6,
  },
  statsChange: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dividerV: {
    width: 1,
    height: 14,
    backgroundColor: Colors.line,
  },
  mono: {
    fontFamily: FontFamily.mono,
    color: Colors.text,
  },
  // Featured card
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    marginBottom: 10,
  },
  displayTitle: {
    fontFamily: FontFamily.display,
    fontSize: 22,
    color: Colors.text,
  },
  featuredCard: {
    marginHorizontal: Spacing.xl,
    padding: 22,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.elevated,
    alignItems: 'center',
    gap: 16,
    overflow: 'hidden',
  },
  featuredMeta: {
    alignItems: 'center',
  },
  featuredName: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    color: Colors.text,
    lineHeight: 28,
    textAlign: 'center',
  },
  featuredVariant: {
    fontFamily: FontFamily.displayItalic,
    color: Colors.gold,
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  chipHolo: {
    borderColor: 'rgba(122,107,255,0.5)',
    backgroundColor: 'rgba(122,107,255,0.12)',
  },
  chipHoloText: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.2,
    color: Colors.holo,
  },
  chipGold: {
    borderColor: Colors.goldBorder,
    backgroundColor: 'rgba(255,215,0,0.1)',
  },
  chipGoldText: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: Colors.gold,
  },
  // News
  newsList: {
    marginHorizontal: Spacing.xl,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.line,
  },
});
