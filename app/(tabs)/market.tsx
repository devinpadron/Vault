import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { Colors, FontFamily, Radius, Spacing } from '@/constants/theme';

// Market is stubbed — neither Scrydex's marketplace endpoint nor a live-auction
// service is wired up. Bringing this online is tracked in TODO; the UI keeps
// the slot warm so navigation and tab layout stay consistent.

export default function MarketScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <View style={[styles.content, { paddingTop: insets.top + 16 }]}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Coming soon</Text>
          <Text style={styles.title}>
            <Text style={styles.titleAccent}>Market</Text>
          </Text>
        </View>

        <Animated.View entering={FadeInDown.delay(60).duration(320)} style={styles.card}>
          <View style={styles.iconWrap}>
            <Icon name="market" size={28} color={Colors.gold} />
          </View>
          <Text style={styles.cardTitle}>Listings & live auctions</Text>
          <Text style={styles.cardBody}>
            Buy and sell — and bid on live lots — straight from your collection.
            We&apos;re building the marketplace; check back soon.
          </Text>

          <View style={styles.bulletList}>
            {[
              'Browse real eBay sold prices per card',
              'Quick-buy from trusted sellers',
              'Live auctions with friends bidding alongside',
            ].map(t => (
              <View key={t} style={styles.bulletRow}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>{t}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      </View>
    </View>
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
  card: {
    padding: 22,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.surface,
    alignItems: 'flex-start',
    gap: 14,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.3)',
    backgroundColor: 'rgba(255,215,0,0.08)',
  },
  cardTitle: {
    fontFamily: FontFamily.display,
    fontSize: 22,
    color: Colors.text,
    lineHeight: 26,
  },
  cardBody: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: Colors.text2,
    lineHeight: 18,
  },
  bulletList: {
    gap: 8,
    marginTop: 4,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bulletDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gold,
  },
  bulletText: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: Colors.text2,
  },
});
