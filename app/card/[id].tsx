import { useState, useEffect } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  interpolate,
} from 'react-native-reanimated';
import { Card3D } from '@/components/cards/Card3D';
import { PriceChart, Range } from '@/components/charts/PriceChart';
import { Icon } from '@/components/ui/Icon';
import { useCard, useCardPricing } from '@/lib/api/cards';
import { sliceHistoryForRange, changForRange, avgForRange } from '@/lib/api/pricing';
import { useBinders, useAddCardToBinder, useCreateBinder } from '@/lib/api/binders';
import { useIsInCollection, useAddToCollection, useRemoveFromCollection } from '@/lib/db/collection';
import { Colors, FontFamily, Spacing, Radius } from '@/constants/theme';
import { CardVariants, cardBaseName, cardNameVariant } from '@/types';

const TONE_PAIRS: [string, string][] = [
  ['#1F0E3A', '#7A6BFF'],
  ['#3A0E0E', '#FF7A3A'],
  ['#0E1F3A', '#5FD2FF'],
  ['#0E2F1F', '#9CFF6E'],
  ['#3A2A0E', '#FFE03A'],
  ['#1F0E2A', '#FF7AE0'],
];

function fmt(n: number) {
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n.toFixed(2);
}

// Renders one chip per active variant. Skips 'normal' (no badge needed).
function VariantChips({ variants }: { variants?: CardVariants }) {
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
      {variants.firstEdition && (
        <View style={[styles.chip, styles.chipFirstEd]}>
          <Text style={styles.chipFirstEdText}>1ST ED</Text>
          <Animated.View style={[StyleSheet.absoluteFill, styles.chipFirstEdSheen, sheenStyle]} />
        </View>
      )}
    </>
  );
}

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [range, setRange] = useState<Range>('30D');
  const [binderSheetOpen, setBinderSheetOpen] = useState(false);
  const [newBinderMode, setNewBinderMode] = useState(false);
  const [newBinderName, setNewBinderName] = useState('');
  const [newBinderTone, setNewBinderTone] = useState<[string, string]>(TONE_PAIRS[0]);
  const insets = useSafeAreaInsets();

  const { data: card, isLoading: cardLoading } = useCard(id ?? '');
  const { data: pricing } = useCardPricing(card);
  const priceHistory = sliceHistoryForRange(pricing?.price_history ?? [], range);
  const { data: binders = [] } = useBinders();
  const addCardToBinder = useAddCardToBinder();
  const createBinder = useCreateBinder();
  const { data: isInCollection = false } = useIsInCollection(card?.id ?? '');
  const addToCollection = useAddToCollection();
  const removeFromCollection = useRemoveFromCollection();

  function openSheet() {
    setNewBinderMode(false);
    setNewBinderName('');
    setNewBinderTone(TONE_PAIRS[0]);
    setBinderSheetOpen(true);
  }

  function closeSheet() {
    setBinderSheetOpen(false);
  }

  async function handleCreateBinder() {
    if (!newBinderName.trim()) {
      Alert.alert('Name required', 'Please enter a binder name.');
      return;
    }
    await createBinder(newBinderName.trim(), newBinderTone[0], newBinderTone[1]);
    setNewBinderMode(false);
    setNewBinderName('');
  }

  if (cardLoading) return null;
  if (!card) return null;

  const price = pricing?.price_usd ?? null;
  const { value: changeValue, label: changeLabel } = changForRange(pricing, range);
  const { value: avgValue,    label: avgLabel    } = avgForRange(pricing, range);

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Nav bar */}
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
            {cardBaseName(card.name)}
            {cardNameVariant(card.name) && (
              <Text style={styles.cardVariant}> {cardNameVariant(card.name)}</Text>
            )}
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
              {price != null ? (
                <View style={styles.priceValue}>
                  <Text style={styles.priceDollar}>$</Text>
                  <Text style={styles.priceNumber}>{fmt(price)}</Text>
                </View>
              ) : (
                <Text style={styles.priceNumber}>—</Text>
              )}
              {avgValue != null && (
                <Text style={styles.avgInline}>
                  {avgLabel} · ${fmt(avgValue)}
                </Text>
              )}
            </View>
            <View style={styles.changeBox}>
              <Text style={styles.panelLabel}>{changeLabel}</Text>
              {changeValue != null ? (
                <View style={styles.changeRow}>
                  <Icon
                    name={changeValue >= 0 ? 'arrow-up' : 'arrow-down'}
                    size={12}
                    color={changeValue >= 0 ? Colors.up : Colors.down}
                  />
                  <Text style={[styles.changePct, { color: changeValue >= 0 ? Colors.up : Colors.down }]}>
                    {changeValue >= 0 ? '+' : ''}{Math.abs(changeValue).toFixed(1)}%
                  </Text>
                </View>
              ) : (
                <Text style={styles.changePct}>—</Text>
              )}
            </View>
          </View>

          <PriceChart data={priceHistory} range={range} onRangeChange={setRange} />
        </View>

        {/* Card info */}
        <View style={[styles.metaPanel, { marginBottom: 20 }]}>
          <Text style={styles.metaHeader}>Card Info</Text>
          {[
            ['Artist',   card.artist],
            ['Set',      card.set],
            ['Number',   card.no],
            ['Rarity',   card.rarity],
            ['Released', card.release],
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
            style={[styles.ctaSecondary, isInCollection && styles.ctaSecondaryActive]}
            onPress={() => isInCollection ? removeFromCollection(card.id) : addToCollection(card)}
            accessibilityLabel={isInCollection ? 'Remove from collection' : 'Add to collection'}
            accessibilityRole="button"
          >
            <Text style={[styles.ctaSecondaryText, isInCollection && styles.ctaSecondaryActiveText]}>
              {isInCollection ? 'In collection ✓' : 'Add to collection'}
            </Text>
          </TouchableOpacity>
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
            onPress={() => router.push('/(tabs)/market')}
            accessibilityLabel="Trade card"
            accessibilityRole="button"
          >
            <Icon name="trade" size={16} color={Colors.text} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Add to Binder sheet */}
      <Modal
        visible={binderSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={closeSheet}
        statusBarTranslucent
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeSheet} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetGrabber} />

          {newBinderMode ? (
            <>
              <TouchableOpacity style={styles.backRow} onPress={() => setNewBinderMode(false)}>
                <Icon name="chevron-left" size={14} color={Colors.text3} />
                <Text style={styles.backLabel}>Back</Text>
              </TouchableOpacity>
              <Text style={styles.sheetEyebrow}>New binder</Text>
              <Text style={styles.sheetTitle}>Name & color</Text>
              <TextInput
                style={styles.sheetInput}
                placeholder="Binder name"
                placeholderTextColor={Colors.text3}
                value={newBinderName}
                onChangeText={setNewBinderName}
                autoFocus
                returnKeyType="done"
              />
              <View style={styles.swatchRow}>
                {TONE_PAIRS.map(([start, end]) => (
                  <TouchableOpacity
                    key={start}
                    style={[styles.swatch, newBinderTone[0] === start && styles.swatchSelected]}
                    onPress={() => setNewBinderTone([start, end])}
                  >
                    <LinearGradient
                      colors={[start, end]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.swatchGradient}
                    />
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.createBtn} onPress={handleCreateBinder}>
                <Text style={styles.createBtnText}>Create binder</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.sheetEyebrow}>Add to binder</Text>
              <Text style={styles.sheetTitle}>Choose a destination</Text>
              <View style={styles.sheetList}>
                {binders.map(b => (
                  <TouchableOpacity
                    key={b.id}
                    style={styles.binderRow}
                    onPress={async () => {
                      await addCardToBinder(b.id, card);
                      closeSheet();
                      Alert.alert('Added', `${card.name} added to ${b.name}`);
                    }}
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
                  onPress={() => setNewBinderMode(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Create new binder"
                >
                  <Icon name="plus" size={14} color={Colors.text2} />
                  <Text style={styles.newBinderText}>New binder</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
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
  avgInline: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 0.5,
    marginTop: 4,
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
  metaHeader: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: Colors.text3,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
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
  ctaSecondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaSecondaryActive: {
    borderColor: Colors.gold,
  },
  ctaSecondaryText: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: Colors.text2,
  },
  ctaSecondaryActiveText: {
    color: Colors.gold,
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
  // Sheet
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
  // Binder list row
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
  // Inline binder creation
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 14,
  },
  backLabel: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: Colors.text3,
  },
  sheetInput: {
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: FontFamily.body,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.surface,
    marginBottom: 18,
  },
  swatchRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  swatch: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchSelected: {
    borderColor: Colors.gold,
  },
  swatchGradient: {
    flex: 1,
  },
  createBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.gold,
    alignItems: 'center',
  },
  createBtnText: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 14,
    color: '#0A0A0C',
  },
});
