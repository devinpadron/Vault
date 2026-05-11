import { useState, useCallback, useEffect } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  interpolate,
} from 'react-native-reanimated';
import { Card3D } from '@/components/cards/Card3D';
import { PriceChart } from '@/components/charts/PriceChart';
import { Icon } from '@/components/ui/Icon';
import { useCard, useCardPriceHistory } from '@/lib/api/cards';
import { useBinders, useAddCardToBinder } from '@/lib/api/binders';
import { Colors, FontFamily, Spacing, Radius } from '@/constants/theme';
import { CardVariants } from '@/types';

type Range = '1W' | '1M' | '6M' | '1Y' | 'ALL';

function fmt(n: number) {
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n.toFixed(2);
}

// Renders one chip per active variant. Skips 'normal' (no badge needed).
function VariantChips({ variants }: { variants?: CardVariants }) {
  // Always-running shimmer animation for the 1st edition chip.
  // Hook runs unconditionally — rendering is conditional below.
  const shimmer = useSharedValue(0);
  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 1600 }), -1, true);
  }, [shimmer]);
  const sheenStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0, 0.6, 0]),
  }));

  if (!variants) return null;

  return (
    <>
      {variants.holo && (
        <LinearGradient
          colors={['rgba(255,215,0,0.75)', 'rgba(122,107,255,0.75)', 'rgba(95,210,255,0.7)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.chipHoloVariant}
        >
          <Text style={styles.chipHoloVariantText}>✦ HOLO</Text>
        </LinearGradient>
      )}
      {variants.reverse && (
        // Gradient border: gradient wrapper + dark inner View
        <LinearGradient
          colors={['#7A6BFF', '#5FD2FF', '#FF7AE0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.chipRevBorder}
        >
          <View style={styles.chipRevInner}>
            <Text style={styles.chipRevText}>REVERSE HOLO</Text>
          </View>
        </LinearGradient>
      )}
      {variants.wPromo && (
        <View style={[styles.chip, styles.chipPromo]}>
          <Text style={styles.chipPromoText}>★ PROMO</Text>
        </View>
      )}
      {variants.firstEdition && (
        <View style={[styles.chip, styles.chipFirstEd]}>
          <Text style={styles.chipFirstEdText}>1ST ED</Text>
          {/* Animated gold sheen that pulses over the chip */}
          <Animated.View style={[StyleSheet.absoluteFill, styles.chipFirstEdSheen, sheenStyle]} />
        </View>
      )}
    </>
  );
}

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [range, setRange] = useState<Range>('1M');
  const [binderSheetOpen, setBinderSheetOpen] = useState(false);
  const insets = useSafeAreaInsets();

  const sheetY = useSharedValue(500);
  const backdropOpacity = useSharedValue(0);
  const panStartY = useSharedValue(0);

  const openSheet = useCallback(() => {
    sheetY.value = 500;
    backdropOpacity.value = 0;
    setBinderSheetOpen(true);
  }, [sheetY, backdropOpacity]);

  const closeSheet = useCallback(() => {
    sheetY.value = withSpring(500, { damping: 22, stiffness: 180 });
    backdropOpacity.value = withTiming(0, { duration: 220 });
    setTimeout(() => setBinderSheetOpen(false), 270);
  }, [sheetY, backdropOpacity]);

  useEffect(() => {
    if (binderSheetOpen) {
      sheetY.value = withSpring(0, { damping: 22, stiffness: 200 });
      backdropOpacity.value = withTiming(1, { duration: 250 });
    }
  }, [binderSheetOpen, sheetY, backdropOpacity]);

  const sheetPan = Gesture.Pan()
    .runOnJS(true)
    .onBegin(() => { panStartY.value = sheetY.value; })
    .onUpdate((e) => { sheetY.value = Math.max(0, panStartY.value + e.translationY); })
    .onEnd((e) => {
      if (sheetY.value > 100 || e.velocityY > 600) {
        closeSheet();
      } else {
        sheetY.value = withSpring(0, { damping: 22, stiffness: 200 });
      }
    });

  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));

  const backdropAnimStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const { data: card, isLoading: cardLoading } = useCard(id ?? '');
  const { data: priceHistory = [] } = useCardPriceHistory(id ?? '', range, card?.value ?? 1000);
  const { data: binders = [] } = useBinders();
  const addCardToBinder = useAddCardToBinder();

  if (cardLoading) return null;
  if (!card) return null;

  const pct = ((card.change / card.value) * 100).toFixed(1);

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Sticky-style header */}
        <View style={[styles.navBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={styles.navBtn} onPress={() => router.back()}>
            <Icon name="chevron-left" size={18} color={Colors.text} />
          </TouchableOpacity>
          <View style={styles.navActions}>
            <TouchableOpacity style={styles.navBtn}>
              <Icon name="heart" size={18} color={Colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.navBtn}>
              <Icon name="send" size={18} color={Colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Hero card */}
        <View style={styles.heroSection}>
          <LinearGradient
            colors={[`${card.art[0]}33`, 'transparent']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 0.8 }}
            style={StyleSheet.absoluteFill}
          />
          <Card3D card={card} width={240} large sway />
        </View>

        {/* Title */}
        <View style={styles.titleSection}>
          <Text style={styles.setLabel}>{card.set} · {card.no}</Text>
          <Text style={styles.cardName}>
            {card.name}{' '}
            <Text style={styles.cardVariant}>{card.variant}</Text>
          </Text>
          <View style={styles.chips}>
            {card.foil
              ? <View style={[styles.chip, styles.chipHolo]}>
                  <Text style={styles.chipHoloText}>{card.rarity.toUpperCase()}</Text>
                </View>
              : <View style={styles.chip}>
                  <Text style={styles.chipText}>{card.rarity.toUpperCase()}</Text>
                </View>
            }
            <VariantChips variants={card.variants} />
          </View>
        </View>

        {/* Price module */}
        <View style={[styles.panel, { marginBottom: 16 }]}>
          <View style={styles.priceHeader}>
            <View>
              <Text style={styles.panelLabel}>Market Price</Text>
              <View style={styles.priceValue}>
                <Text style={styles.priceDollar}>$</Text>
                <Text style={styles.priceNumber}>{fmt(card.value)}</Text>
              </View>
            </View>
            <View style={styles.changeBox}>
              <Text style={styles.panelLabel}>30d</Text>
              <View style={styles.changeRow}>
                <Icon
                  name={card.change >= 0 ? 'arrow-up' : 'arrow-down'}
                  size={12}
                  color={card.change >= 0 ? Colors.up : Colors.down}
                />
                <Text style={[styles.changePct, { color: card.change >= 0 ? Colors.up : Colors.down }]}>
                  {card.change >= 0 ? '+' : ''}{pct}%
                </Text>
              </View>
            </View>
          </View>

          <PriceChart
            data={priceHistory}
            range={range}
            onRangeChange={setRange}
          />

          <View style={styles.divider} />

          <View style={styles.sourceRow}>
            {[
              { label: 'EBAY 30D',   value: fmt(card.value * 0.94) },
              { label: 'TCGPLAYER',  value: fmt(card.value) },
              { label: 'PSA 10',     value: fmt(card.value * 1.8) },
            ].map(({ label, value }) => (
              <View key={label}>
                <Text style={styles.panelLabel}>{label}</Text>
                <Text style={styles.sourceValue}>${value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Card info */}
        <View style={[styles.metaPanel, { marginBottom: 20 }]}>
          <Text style={[styles.panelLabel, { marginBottom: 10 }]}>Card Info</Text>
          {[
            ['Artist',   card.artist],
            ['Set',      card.set],
            ['Number',   card.no],
            ['Released', card.release],
            ['Rarity',   card.rarity],
          ].map(([k, v]) => (
            <View key={k} style={styles.metaRow}>
              <Text style={styles.metaKey}>{k}</Text>
              <Text style={styles.metaVal}>{v}</Text>
            </View>
          ))}
        </View>

        {/* CTAs */}
        <View style={styles.ctaRow}>
          <TouchableOpacity
            style={[styles.ctaPrimary, { flex: 1 }]}
            onPress={openSheet}
            accessibilityLabel="Add card to binder"
            accessibilityRole="button"
          >
            <Text style={styles.ctaPrimaryText}>Add to binder</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.ctaIcon}
            accessibilityLabel="Trade card"
            accessibilityRole="button"
          >
            <Icon name="trade" size={16} color={Colors.text} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Add to Binder — gesture-dismissible bottom sheet */}
      <Modal
        visible={binderSheetOpen}
        transparent
        animationType="none"
        onRequestClose={closeSheet}
        statusBarTranslucent
      >
        {/* Animated backdrop */}
        <Animated.View style={[styles.backdrop, backdropAnimStyle]}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeSheet} />
        </Animated.View>

        {/* Gesture-driven sheet */}
        <GestureDetector gesture={sheetPan}>
          <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }, sheetAnimStyle]}>
            <View style={styles.sheetGrabber} />
            <Text style={styles.sheetEyebrow}>Add to binder</Text>
            <Text style={styles.sheetTitle}>Choose a destination</Text>

            <View style={styles.sheetList}>
              {binders.map(b => (
                <TouchableOpacity
                  key={b.id}
                  style={styles.binderRow}
                  onPress={() => { addCardToBinder(b.id); closeSheet(); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Add to ${b.name}`}
                >
                  <LinearGradient
                    colors={b.tone}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.binderThumb}
                  />
                  <View style={styles.binderInfo}>
                    <Text style={styles.binderName}>{b.name}</Text>
                    <Text style={styles.binderCount}>{b.count} CARDS</Text>
                  </View>
                  <Icon name="chevron-right" size={16} color={Colors.text3} />
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                style={styles.newBinder}
                accessibilityRole="button"
                accessibilityLabel="Create new binder"
              >
                <Icon name="plus" size={14} color={Colors.text2} />
                <Text style={styles.newBinderText}>New binder</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </GestureDetector>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 0,
  },
  // Nav bar
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: 12,
  },
  navActions: {
    flexDirection: 'row',
    gap: 8,
  },
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  // Hero
  heroSection: {
    alignItems: 'center',
    paddingVertical: 24,
    overflow: 'hidden',
  },
  // Title section
  titleSection: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: 22,
  },
  setLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: Colors.text3,
    marginBottom: 8,
  },
  cardName: {
    fontFamily: FontFamily.display,
    fontSize: 38,
    color: Colors.text,
    lineHeight: 40,
    textAlign: 'center',
  },
  cardVariant: {
    fontFamily: FontFamily.displayItalic,
    color: Colors.gold,
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  chipText: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.2,
    color: Colors.text2,
  },
  chipHolo: {
    borderColor: 'rgba(122,107,255,0.5)',
    backgroundColor: 'rgba(122,107,255,0.12)',
  },
  chipHoloText: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.2,
    color: '#9D8FFF',
  },
  // Variant: Holo — rainbow gradient fill
  chipHoloVariant: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  chipHoloVariantText: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.2,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  // Variant: Reverse Holo — gradient border, dark fill
  chipRevBorder: {
    borderRadius: 7,
    padding: 1.5,
  },
  chipRevInner: {
    backgroundColor: Colors.bg,
    borderRadius: 5.5,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipRevText: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.2,
    color: '#A29AFF',
  },
  // Variant: Promo — teal/cyan
  chipPromo: {
    borderColor: 'rgba(0,210,180,0.5)',
    backgroundColor: 'rgba(0,210,180,0.1)',
  },
  chipPromoText: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.2,
    color: '#00D2B4',
  },
  // Variant: 1st Edition — gold with pulsing sheen
  chipFirstEd: {
    borderColor: 'rgba(255,215,0,0.65)',
    backgroundColor: 'rgba(255,215,0,0.14)',
    overflow: 'hidden',
  },
  chipFirstEdText: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.2,
    color: Colors.gold,
  },
  chipFirstEdSheen: {
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius: 6,
  },
  // Price panel
  panel: {
    marginHorizontal: Spacing.xl,
    padding: 16,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.surface,
  },
  priceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  panelLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: Colors.text3,
    marginBottom: 6,
  },
  priceValue: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  priceDollar: {
    fontFamily: FontFamily.display,
    fontSize: 30,
    color: Colors.text,
    lineHeight: 34,
  },
  priceNumber: {
    fontFamily: FontFamily.monoMed,
    fontSize: 28,
    color: Colors.text,
    lineHeight: 32,
  },
  changeBox: {
    alignItems: 'flex-end',
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  changePct: {
    fontFamily: FontFamily.mono,
    fontSize: 14,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.line,
    marginVertical: 14,
  },
  sourceRow: {
    flexDirection: 'row',
    gap: 20,
  },
  sourceValue: {
    fontFamily: FontFamily.mono,
    fontSize: 13,
    color: Colors.text,
  },
  // Metadata panel
  metaPanel: {
    marginHorizontal: Spacing.xl,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.line,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
    backgroundColor: Colors.bg,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  metaKey: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: Colors.text2,
  },
  metaVal: {
    fontFamily: FontFamily.mono,
    fontSize: 12,
    color: Colors.text,
  },
  // CTAs
  ctaRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: Spacing.xl,
  },
  ctaPrimary: {
    paddingVertical: 14,
    borderRadius: Radius.md,
    backgroundColor: Colors.gold,
    alignItems: 'center',
  },
  ctaPrimaryText: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 14,
    color: '#0A0A0C',
  },
  ctaIcon: {
    width: 50,
    paddingVertical: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Binder sheet
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: Colors.elevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    borderTopWidth: 1,
    borderColor: Colors.line,
  },
  sheetGrabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.line,
    alignSelf: 'center',
    marginBottom: 18,
  },
  sheetEyebrow: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: Colors.text3,
    marginBottom: 4,
  },
  sheetTitle: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    color: Colors.text,
    marginBottom: 18,
  },
  sheetList: {
    gap: 10,
  },
  binderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.surface,
  },
  binderThumb: {
    width: 38,
    height: 50,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  binderInfo: {
    flex: 1,
  },
  binderName: {
    fontFamily: FontFamily.display,
    fontSize: 15,
    color: Colors.text,
  },
  binderCount: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: Colors.text3,
    marginTop: 2,
  },
  newBinder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.line,
    marginTop: 4,
  },
  newBinderText: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: Colors.text2,
  },
});
