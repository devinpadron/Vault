import { useState, useEffect, useMemo } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as Linking from 'expo-linking';
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
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import { useCard, useCardPricing } from '@/lib/api/cards';
import { sliceHistoryForRange, changForRange, avgForRange, GradedOption } from '@/lib/api/pricing';
import { formatVariantName } from '@/lib/api/types';
import { useBinders, useAddCardToBinder, useCreateBinder } from '@/lib/api/binders';
import {
  useIsInCollection,
  useAddToCollection,
  useRemoveFromCollection,
  useCardCostBasis,
  useUpdateCostBasis,
  useSellCard,
} from '@/lib/db/collection';
import { useIsWishlisted, useAddToWishlist, useRemoveFromWishlist } from '@/lib/db/wishlist';
import { fmt } from '@/lib/format';
import { TONE_PAIRS } from '@/lib/binder-tones';
import { Colors, FontFamily, NavButtonStyle, Radius, Spacing } from '@/constants/theme';
import { Card, CardVariants, cardBaseName, cardNameVariant } from '@/types';

// Compact notation for matrix cells where horizontal space is tight.
// $42 / $245 / $1.2k / $42k
function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 10000) return `${Math.round(n / 1000)}k`;
  if (abs >= 1000)  return `${(n / 1000).toFixed(1)}k`;
  if (abs >= 100)   return String(Math.round(n));
  return n.toFixed(2);
}

const GRADER_ORDER: Record<string, number> = { PSA: 0, CGC: 1, BGS: 2, TAG: 3, ACE: 4 };

// Share the card via the system share sheet. Deep link routes to the same
// card detail when the recipient opens it on a device with Vault installed.
function shareCard(card: Card, price: number | null) {
  const deepLink = Linking.createURL(`/card/${card.id}`);
  const priceTag = price != null && price > 0 ? ` — $${fmt(price)}` : '';
  const body = `${card.name} · ${card.set} ${card.no}${priceTag} on Vault`;
  Share.share(
    Platform.OS === 'android'
      ? { title: card.name, message: `${body}\n${deepLink}` }
      : { message: body, url: deepLink },
  ).catch(() => {});
}

function GradeMatrix({ options }: { options: GradedOption[] }) {
  // Pivot: rows = grades, columns = companies. Hide empty companies/grades.
  const companies = Array.from(new Set(options.map(o => o.grader)))
    .sort((a, b) => (GRADER_ORDER[a] ?? 99) - (GRADER_ORDER[b] ?? 99));
  const grades = Array.from(new Set(options.map(o => o.grade)))
    .sort((a, b) => parseFloat(b) - parseFloat(a));
  const cell = new Map<string, number | null>();
  for (const o of options) cell.set(`${o.grader}-${o.grade}`, o.market);

  return (
    <View style={styles.matrix}>
      {/* Header row */}
      <View style={[styles.matrixRow, styles.matrixHeaderRow]}>
        <Text style={[styles.matrixCell, styles.matrixHeader, styles.matrixGradeColumn]}>GRADE</Text>
        {companies.map(c => (
          <Text key={c} style={[styles.matrixCell, styles.matrixHeader]}>{c}</Text>
        ))}
      </View>

      {/* Body */}
      {grades.map(g => (
        <View key={g} style={styles.matrixRow}>
          <Text style={[styles.matrixCell, styles.matrixGradeColumn, styles.matrixGradeLabel]}>
            {g}
          </Text>
          {companies.map(c => {
            const price = cell.get(`${c}-${g}`);
            return (
              <Text
                key={c}
                style={[styles.matrixCell, price == null && styles.matrixCellEmpty]}
              >
                {price != null ? `$${fmtCompact(price)}` : '—'}
              </Text>
            );
          })}
        </View>
      ))}
    </View>
  );
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

// True when the card has any rich Pokémon-card detail worth surfacing.
function hasCardDetails(card: Card): boolean {
  return Boolean(
    card.hp ||
      card.regulation_mark ||
      card.national_pokedex_numbers?.length ||
      card.subtypes?.length ||
      card.abilities?.length ||
      card.attacks?.length ||
      card.weaknesses?.length ||
      card.resistances?.length ||
      card.retreatCost?.length ||
      card.description,
  );
}

function EnergyCost({ cost }: { cost: string[] }) {
  if (!cost.length) return <Text style={styles.detailMuted}>Free</Text>;
  return (
    <View style={styles.energyRow}>
      {cost.map((t, i) => (
        <View key={`${t}-${i}`} style={styles.energyChip}>
          <Text style={styles.energyChipText}>{t.slice(0, 1).toUpperCase()}</Text>
        </View>
      ))}
    </View>
  );
}

function CardDetailsSection({ card }: { card: Card }) {
  return (
    <View style={[styles.metaPanel, { marginBottom: 20 }]}>
      <Text style={styles.metaHeader}>Card Details</Text>

      <View style={styles.detailsBody}>
        {/* Quick facts row — HP, type, subtypes, regulation, pokedex */}
          {(card.hp ||
            card.supertype ||
            card.subtypes?.length ||
            card.regulation_mark ||
            card.national_pokedex_numbers?.length) && (
            <View style={styles.quickRow}>
              {card.hp != null && (
                <View style={styles.factChip}>
                  <Text style={styles.factLabel}>HP</Text>
                  <Text style={styles.factValue}>{card.hp}</Text>
                </View>
              )}
              {card.supertype && (
                <View style={styles.factChip}>
                  <Text style={styles.factLabel}>TYPE</Text>
                  <Text style={styles.factValue}>{card.supertype}</Text>
                </View>
              )}
              {card.regulation_mark && (
                <View style={styles.factChip}>
                  <Text style={styles.factLabel}>REG</Text>
                  <Text style={styles.factValue}>{card.regulation_mark}</Text>
                </View>
              )}
              {card.national_pokedex_numbers?.length ? (
                <View style={styles.factChip}>
                  <Text style={styles.factLabel}>DEX</Text>
                  <Text style={styles.factValue}>
                    #{card.national_pokedex_numbers.join(', #')}
                  </Text>
                </View>
              ) : null}
            </View>
          )}

          {card.subtypes?.length ? (
            <View style={styles.detailSection}>
              <Text style={styles.detailEyebrow}>Subtypes</Text>
              <Text style={styles.detailBody}>{card.subtypes.join(' · ')}</Text>
            </View>
          ) : null}

          {card.abilities?.map((a, i) => (
            <View key={`ability-${i}`} style={styles.detailSection}>
              <Text style={styles.detailEyebrow}>{a.type || 'Ability'}</Text>
              <Text style={styles.detailTitle}>{a.name}</Text>
              {a.text ? <Text style={styles.detailBody}>{a.text}</Text> : null}
            </View>
          ))}

          {card.attacks?.map((a, i) => (
            <View key={`attack-${i}`} style={styles.detailSection}>
              <View style={styles.attackHeader}>
                <EnergyCost cost={a.cost} />
                <Text style={styles.detailTitle}>{a.name}</Text>
                {a.damage ? <Text style={styles.attackDamage}>{a.damage}</Text> : null}
              </View>
              {a.text ? <Text style={styles.detailBody}>{a.text}</Text> : null}
            </View>
          ))}

          {(card.weaknesses?.length || card.resistances?.length || card.retreatCost?.length) && (
            <View style={styles.detailSection}>
              {card.weaknesses?.length ? (
                <View style={styles.kvRow}>
                  <Text style={styles.detailEyebrow}>Weakness</Text>
                  <Text style={styles.detailValue}>
                    {card.weaknesses.map(w => `${w.type} ${w.value}`).join(' · ')}
                  </Text>
                </View>
              ) : null}
              {card.resistances?.length ? (
                <View style={styles.kvRow}>
                  <Text style={styles.detailEyebrow}>Resistance</Text>
                  <Text style={styles.detailValue}>
                    {card.resistances.map(r => `${r.type} ${r.value}`).join(' · ')}
                  </Text>
                </View>
              ) : null}
              {card.retreatCost?.length ? (
                <View style={styles.kvRow}>
                  <Text style={styles.detailEyebrow}>Retreat</Text>
                  <EnergyCost cost={card.retreatCost} />
                </View>
              ) : null}
            </View>
          )}

          {card.description ? (
            <View style={styles.detailSection}>
              <Text style={styles.detailFlavor}>&ldquo;{card.description}&rdquo;</Text>
            </View>
          ) : null}
      </View>
    </View>
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

  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(undefined);
  const [priceMode, setPriceMode] = useState<'raw' | 'graded'>('raw');
  const [selectedGradedVariant, setSelectedGradedVariant] = useState<string | null>(null);

  const {
    data: card,
    isLoading: cardLoading,
    isError: cardError,
    error: cardErrorObj,
    refetch: refetchCard,
  } = useCard(id ?? '');

  // Default to the first (highest-priced) variant; user selection overrides.
  // Pricing always queries Raw; graded uses the gradedOptions matrix and
  // doesn't need a per-grade fetch — the table shows every grade at once.
  const activeVariantId = selectedVariantId ?? card?.variantPrices?.[0]?.id;
  const { data: pricing } = useCardPricing(card, activeVariantId);
  const gradedOptions = useMemo(() => pricing?.graded_options ?? [], [pricing?.graded_options]);

  // Each card_listings row is tied to one Scrydex variant ("holofoil",
  // "reverseHolofoil", …). Graded prices for the same grade can differ across
  // variants, so we group by variant and let the user pick which one to view.
  const gradedVariants = useMemo(
    () => Array.from(new Set(gradedOptions.map(o => o.variant))),
    [gradedOptions],
  );

  // Keep the selected graded variant valid when the option set changes.
  useEffect(() => {
    if (gradedVariants.length === 0) {
      if (selectedGradedVariant !== null) setSelectedGradedVariant(null);
      return;
    }
    if (!selectedGradedVariant || !gradedVariants.includes(selectedGradedVariant)) {
      // Prefer the variant the user already selected in Raw mode, if it has
      // graded data; otherwise fall back to the first available.
      const rawVariantName = card?.variantPrices?.find(v => v.id === activeVariantId)?.name;
      const matchesRaw = rawVariantName && gradedVariants.includes(rawVariantName);
      setSelectedGradedVariant(matchesRaw ? rawVariantName! : gradedVariants[0]);
    }
  }, [gradedVariants, selectedGradedVariant, card, activeVariantId]);

  const filteredGradedOptions = useMemo(
    () => gradedOptions.filter(o => o.variant === selectedGradedVariant),
    [gradedOptions, selectedGradedVariant],
  );

  const priceHistory = sliceHistoryForRange(pricing?.price_history ?? [], range);
  const { data: binders = [] } = useBinders();
  const addCardToBinder = useAddCardToBinder();
  const createBinder = useCreateBinder();
  const { data: isInCollection = false } = useIsInCollection(card?.id ?? '');
  const addToCollection = useAddToCollection();
  const removeFromCollection = useRemoveFromCollection();
  const { data: costBasis = null } = useCardCostBasis(card?.id ?? '');
  const updateCostBasis = useUpdateCostBasis();
  const sellCard = useSellCard();
  const { data: isWishlisted = false } = useIsWishlisted(card?.id ?? '');
  const addToWishlist = useAddToWishlist();
  const removeFromWishlist = useRemoveFromWishlist();

  // Sold-vs-removed sheet + cost-basis editor state
  const [removeSheetOpen, setRemoveSheetOpen]       = useState(false);
  const [sellStage, setSellStage]                   = useState<'choose' | 'price'>('choose');
  const [salePriceInput, setSalePriceInput]         = useState('');
  const [costBasisSheetOpen, setCostBasisSheetOpen] = useState(false);
  const [costBasisInput, setCostBasisInput]         = useState('');

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

  if (cardLoading) {
    return (
      <View style={[styles.root, styles.fullScreenCentered, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.navBtnStandalone} onPress={() => router.back()}>
          <Icon name="chevron-left" size={18} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={styles.loadingText}>Loading card…</Text>
        </View>
      </View>
    );
  }
  if (cardError) {
    return (
      <View style={[styles.root, styles.fullScreenCentered, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.navBtnStandalone} onPress={() => router.back()}>
          <Icon name="chevron-left" size={18} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ErrorPanel message="Couldn't load this card" error={cardErrorObj} onRetry={refetchCard} />
        </View>
      </View>
    );
  }
  if (!card) {
    return (
      <View style={[styles.root, styles.fullScreenCentered, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.navBtnStandalone} onPress={() => router.back()}>
          <Icon name="chevron-left" size={18} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <Text style={styles.emptyTitle}>Card not found</Text>
          <Text style={styles.emptySubtitle}>This card may have been removed or hasn&apos;t synced yet.</Text>
        </View>
      </View>
    );
  }

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
            <TouchableOpacity
              style={[styles.navBtn, isWishlisted && styles.navBtnActive]}
              onPress={() =>
                isWishlisted ? removeFromWishlist(card.id) : addToWishlist(card)
              }
              accessibilityRole="button"
              accessibilityLabel={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
            >
              <Icon name="heart" size={18} color={isWishlisted ? Colors.gold : Colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => shareCard(card, price)}
              accessibilityRole="button"
              accessibilityLabel="Share this card"
            >
              <Icon name="share" size={18} color={Colors.text} />
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

        {/* Raw / Graded segment — only when graded data exists */}
        {gradedOptions.length > 0 && (
          <View style={styles.modeSegmentWrap}>
            <View style={styles.modeSegment}>
              {(['raw', 'graded'] as const).map(m => (
                <TouchableOpacity
                  key={m}
                  style={[styles.modeSegmentBtn, priceMode === m && styles.modeSegmentBtnActive]}
                  onPress={() => setPriceMode(m)}
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${m} prices`}
                >
                  <Text style={[styles.modeSegmentText, priceMode === m && styles.modeSegmentTextActive]}>
                    {m === 'raw' ? 'Raw' : 'Graded'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Raw: variant pills — only when multiple priced variants exist */}
        {priceMode === 'raw' && (card.variantPrices?.length ?? 0) > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.variantScroll}
            style={styles.variantRow}
          >
            {card.variantPrices!.map(v => {
              const isActive = activeVariantId === v.id;
              return (
                <TouchableOpacity
                  key={v.id}
                  style={[styles.variantPill, isActive && styles.variantPillActive]}
                  onPress={() => setSelectedVariantId(v.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.variantPillName, isActive && styles.variantPillNameActive]}>
                    {v.displayName}
                  </Text>
                  {v.price != null && (
                    <Text style={[styles.variantPillPrice, isActive && styles.variantPillPriceActive]}>
                      ${fmt(v.price)}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Price module — Raw has chart, Graded has a grade × company matrix */}
        {priceMode === 'raw' ? (
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
        ) : (
          <View style={[styles.panel, { marginBottom: 16 }]}>
            <View style={styles.gradedHeader}>
              <Text style={styles.panelLabel}>Graded · By Company</Text>
              {selectedGradedVariant && (
                <Text style={styles.gradedVariantLabel}>
                  {formatVariantName(selectedGradedVariant)}
                </Text>
              )}
            </View>

            {gradedVariants.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.gradedVariantRow}
                style={styles.gradedVariantScroll}
              >
                {gradedVariants.map(v => {
                  const isActive = v === selectedGradedVariant;
                  return (
                    <TouchableOpacity
                      key={v}
                      style={[styles.gradedVariantPill, isActive && styles.gradedVariantPillActive]}
                      onPress={() => setSelectedGradedVariant(v)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.gradedVariantPillText, isActive && styles.gradedVariantPillTextActive]}>
                        {formatVariantName(v)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <GradeMatrix options={filteredGradedOptions} />
          </View>
        )}

        {/* Card info */}
        <View style={[styles.metaPanel, { marginBottom: 16 }]}>
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

        {/* Card details — always visible */}
        {hasCardDetails(card) && <CardDetailsSection card={card} />}

        {/* CTAs */}
        <View style={styles.ctaRow}>
          <TouchableOpacity
            style={[styles.ctaSecondary, isInCollection && styles.ctaSecondaryActive]}
            onPress={() => {
              if (isInCollection) {
                setSellStage('choose');
                setSalePriceInput(price != null && price > 0 ? price.toFixed(2) : '');
                setRemoveSheetOpen(true);
              } else {
                addToCollection(card);
              }
            }}
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
        </View>

        {/* Cost basis row — only visible when card is in the collection. */}
        {isInCollection && (
          <TouchableOpacity
            style={styles.basisRow}
            onPress={() => {
              setCostBasisInput(costBasis != null ? costBasis.toFixed(2) : '');
              setCostBasisSheetOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={costBasis != null ? 'Edit cost basis' : 'Set cost basis'}
          >
            <Text style={styles.basisLabel}>
              {costBasis != null ? 'PAID' : 'COST BASIS'}
            </Text>
            <Text style={styles.basisValue}>
              {costBasis != null ? `$${fmt(costBasis)}` : 'Set what you paid'}
            </Text>
            {costBasis != null && price != null && price > 0 && (
              <Text
                style={[
                  styles.basisDelta,
                  { color: price - costBasis >= 0 ? Colors.up : Colors.down },
                ]}
              >
                {price - costBasis >= 0 ? '+' : '−'}${fmt(Math.abs(price - costBasis))}
              </Text>
            )}
            <Icon name="chevron-right" size={14} color={Colors.text3} />
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Add to Binder sheet */}
      <Modal
        visible={binderSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={closeSheet}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
                  {binders.filter(b => !b.rules).map(b => (
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
        </KeyboardAvoidingView>
      </Modal>

      {/* Cost basis editor */}
      <Modal
        visible={costBasisSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCostBasisSheetOpen(false)}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => setCostBasisSheetOpen(false)}
          />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetGrabber} />
            <Text style={styles.sheetEyebrow}>Cost basis</Text>
            <Text style={styles.sheetTitle}>What did you pay?</Text>
            <Text style={styles.basisHelper}>
              Used to track unrealized and realized P/L. Leave blank to clear.
            </Text>
            <View style={styles.priceInputRow}>
              <Text style={styles.priceInputDollar}>$</Text>
              <TextInput
                style={styles.priceInput}
                placeholder="0.00"
                placeholderTextColor={Colors.text3}
                value={costBasisInput}
                onChangeText={setCostBasisInput}
                keyboardType="decimal-pad"
                autoFocus
                returnKeyType="done"
              />
            </View>
            <TouchableOpacity
              style={styles.createBtn}
              onPress={async () => {
                const trimmed = costBasisInput.trim();
                const value = trimmed === '' ? null : Number(trimmed);
                if (value != null && (!Number.isFinite(value) || value < 0)) {
                  Alert.alert('Invalid amount', 'Enter a positive dollar amount or leave blank.');
                  return;
                }
                await updateCostBasis(card.id, value, value != null ? Date.now() : null);
                setCostBasisSheetOpen(false);
              }}
            >
              <Text style={styles.createBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Sold vs just-removed prompt */}
      <Modal
        visible={removeSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setRemoveSheetOpen(false)}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => setRemoveSheetOpen(false)}
          />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetGrabber} />

            {sellStage === 'choose' ? (
              <>
                <Text style={styles.sheetEyebrow}>Remove from collection</Text>
                <Text style={styles.sheetTitle}>Did you sell it?</Text>
                <Text style={styles.basisHelper}>
                  Recording a sale captures realized P/L. &ldquo;Just remove&rdquo; deletes
                  silently with no impact on your portfolio history.
                </Text>
                <TouchableOpacity
                  style={styles.removeOptionPrimary}
                  onPress={() => setSellStage('price')}
                  accessibilityRole="button"
                  accessibilityLabel="Mark as sold"
                >
                  <Text style={styles.removeOptionPrimaryText}>Sold — record sale</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.removeOptionSecondary}
                  onPress={async () => {
                    await removeFromCollection(card.id);
                    setRemoveSheetOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Just remove"
                >
                  <Text style={styles.removeOptionSecondaryText}>Just remove</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={styles.backRow} onPress={() => setSellStage('choose')}>
                  <Icon name="chevron-left" size={14} color={Colors.text3} />
                  <Text style={styles.backLabel}>Back</Text>
                </TouchableOpacity>
                <Text style={styles.sheetEyebrow}>Record sale</Text>
                <Text style={styles.sheetTitle}>Sale price</Text>
                {costBasis != null && (
                  <Text style={styles.basisHelper}>
                    Cost basis on file: ${fmt(costBasis)}
                  </Text>
                )}
                <View style={styles.priceInputRow}>
                  <Text style={styles.priceInputDollar}>$</Text>
                  <TextInput
                    style={styles.priceInput}
                    placeholder="0.00"
                    placeholderTextColor={Colors.text3}
                    value={salePriceInput}
                    onChangeText={setSalePriceInput}
                    keyboardType="decimal-pad"
                    autoFocus
                    returnKeyType="done"
                  />
                </View>
                <TouchableOpacity
                  style={styles.createBtn}
                  onPress={async () => {
                    const value = Number(salePriceInput.trim());
                    if (!Number.isFinite(value) || value < 0) {
                      Alert.alert('Invalid amount', 'Enter the sale price in dollars.');
                      return;
                    }
                    await sellCard(card, value);
                    setRemoveSheetOpen(false);
                  }}
                >
                  <Text style={styles.createBtnText}>Confirm sale</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
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
  navBtn: NavButtonStyle,
  navBtnActive: {
    borderColor: 'rgba(255,215,0,0.4)',
    backgroundColor: 'rgba(255,215,0,0.1)',
  },
  fullScreenCentered: {
    paddingHorizontal: Spacing.lg,
  },
  navBtnStandalone: {
    ...NavButtonStyle,
    alignSelf: 'flex-start',
  },
  loadingText: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: Colors.text3,
  },
  emptyTitle: {
    fontFamily: FontFamily.display,
    fontSize: 22,
    color: Colors.text3,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: Colors.text3,
    textAlign: 'center',
    lineHeight: 19,
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
  // Price mode segment
  modeSegmentWrap: {
    paddingHorizontal: Spacing.xl,
    marginBottom: 10,
  },
  modeSegment: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.surface,
    alignSelf: 'flex-start',
  },
  modeSegmentBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: Radius.sm,
  },
  modeSegmentBtnActive: {
    backgroundColor: Colors.elevated,
  },
  modeSegmentText: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: Colors.text3,
  },
  modeSegmentTextActive: {
    color: Colors.text,
  },
  // Graded variant pill row (above the matrix)
  gradedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gradedVariantLabel: {
    fontFamily: FontFamily.monoMed,
    fontSize: 10,
    letterSpacing: 1.2,
    color: Colors.gold,
  },
  gradedVariantScroll: {
    marginHorizontal: -16,
    marginTop: 10,
  },
  gradedVariantRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
  },
  gradedVariantPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  gradedVariantPillActive: {
    borderColor: 'rgba(255,215,0,0.4)',
    backgroundColor: 'rgba(255,215,0,0.1)',
  },
  gradedVariantPillText: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 11,
    color: Colors.text2,
  },
  gradedVariantPillTextActive: {
    color: Colors.gold,
  },
  // Grade matrix (graded mode)
  matrix: {
    marginTop: 10,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  matrixRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  matrixHeaderRow: {
    borderTopWidth: 0,
  },
  matrixCell: {
    flex: 1,
    paddingVertical: 10,
    fontFamily: FontFamily.mono,
    fontSize: 11,
    color: Colors.text,
    textAlign: 'center',
  },
  matrixGradeColumn: {
    flex: 0.7,
  },
  matrixHeader: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 1.4,
    color: Colors.text3,
  },
  matrixGradeLabel: {
    fontFamily: FontFamily.monoMed,
    color: Colors.gold,
  },
  matrixCellEmpty: {
    color: Colors.text3,
  },
  // Variant selector
  variantRow: {
    marginBottom: 14,
  },
  variantScroll: {
    paddingHorizontal: Spacing.xl,
    gap: 8,
    flexDirection: 'row',
  },
  variantPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    gap: 3,
  },
  variantPillActive: {
    borderColor: Colors.gold,
    backgroundColor: 'rgba(255,215,0,0.08)',
  },
  variantPillName: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 12,
    color: Colors.text2,
  },
  variantPillNameActive: {
    color: Colors.gold,
  },
  variantPillPrice: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    color: Colors.text3,
  },
  variantPillPriceActive: {
    color: Colors.gold,
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
  // Card details
  detailsBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
    paddingTop: 14,
    backgroundColor: Colors.bg,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  factChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.surface,
  },
  factLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 1.2,
    color: Colors.text3,
  },
  factValue: {
    fontFamily: FontFamily.monoMed,
    fontSize: 11,
    color: Colors.text,
  },
  detailSection: {
    gap: 6,
  },
  detailEyebrow: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: Colors.text3,
  },
  detailTitle: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 14,
    color: Colors.text,
  },
  detailBody: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: Colors.text2,
    lineHeight: 17,
  },
  detailValue: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    color: Colors.text,
    flexShrink: 1,
    textAlign: 'right',
  },
  detailMuted: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    color: Colors.text3,
  },
  detailFlavor: {
    fontFamily: FontFamily.displayItalic,
    fontSize: 13,
    color: Colors.text2,
    lineHeight: 18,
  },
  kvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 4,
  },
  attackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  attackDamage: {
    fontFamily: FontFamily.monoMed,
    fontSize: 13,
    color: Colors.gold,
    marginLeft: 'auto',
  },
  energyRow: {
    flexDirection: 'row',
    gap: 4,
  },
  energyChip: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.lineStrong,
    backgroundColor: Colors.surface,
  },
  energyChipText: {
    fontFamily: FontFamily.monoMed,
    fontSize: 9,
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
  // Cost basis row under the CTAs
  basisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: Spacing.lg,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  basisLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 1.4,
    color: Colors.text3,
  },
  basisValue: {
    flex: 1,
    fontFamily: FontFamily.mono,
    fontSize: 13,
    color: Colors.text,
  },
  basisDelta: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
  },
  basisHelper: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: Colors.text3,
    lineHeight: 17,
    marginBottom: 14,
  },
  // Sale price / cost basis input
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  priceInputDollar: {
    fontFamily: FontFamily.mono,
    fontSize: 16,
    color: Colors.text3,
    marginRight: 6,
  },
  priceInput: {
    flex: 1,
    paddingVertical: 14,
    fontFamily: FontFamily.mono,
    fontSize: 18,
    color: Colors.text,
  },
  // Remove sheet
  removeOptionPrimary: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    marginBottom: 10,
  },
  removeOptionPrimaryText: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 14,
    color: '#0A0A0C',
  },
  removeOptionSecondary: {
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.line,
    alignItems: 'center',
  },
  removeOptionSecondaryText: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: Colors.text,
  },
});
