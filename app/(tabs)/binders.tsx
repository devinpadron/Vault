import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { CardThumb } from '@/components/cards/CardThumb';
import { Icon } from '@/components/ui/Icon';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import { useBinders, useCreateBinder } from '@/lib/api/binders';
import { useCollectionEntries } from '@/lib/db/collection';
import { SmartBinderRules } from '@/lib/db/cloud-sync';
import {
  SmartRulesEditor,
  deriveRuleOptions,
  rulesHaveAtLeastOneFilter,
} from '@/components/binders/SmartRulesEditor';
import { TONE_PAIRS } from '@/lib/binder-tones';
import { Colors, FontFamily, Radius, Spacing } from '@/constants/theme';
import { Binder } from '@/types';

export default function BindersScreen() {
  const insets = useSafeAreaInsets();
  const { data: binders = [], isLoading, isError, refetch } = useBinders();
  const createBinder = useCreateBinder();
  const totalCards = binders.reduce((sum, b) => sum + b.count, 0);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [binderName, setBinderName] = useState('');
  const [selectedTone, setSelectedTone] = useState<[string, string]>(TONE_PAIRS[0]);
  const [isSmart, setIsSmart] = useState(false);
  const [draftRules, setDraftRules] = useState<SmartBinderRules>({ match: 'all' });

  const { data: entries = [] } = useCollectionEntries();
  const ruleOptions = useMemo(
    () => deriveRuleOptions(entries.map(e => ({ set: e.card.set, rarity: e.card.rarity }))),
    [entries],
  );

  function openSheet() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBinderName('');
    setSelectedTone(TONE_PAIRS[0]);
    setIsSmart(false);
    setDraftRules({ match: 'all' });
    setSheetOpen(true);
  }

  async function handleCreate() {
    if (!binderName.trim()) {
      Alert.alert('Name required', 'Please enter a binder name.');
      return;
    }
    let rules: SmartBinderRules | null = null;
    if (isSmart) {
      if (!rulesHaveAtLeastOneFilter(draftRules)) {
        Alert.alert(
          'Pick at least one filter',
          'A smart binder needs at least one rule — pick a set, rarity, supertype, value range, or other condition.',
        );
        return;
      }
      rules = draftRules;
    }
    await createBinder(binderName.trim(), selectedTone[0], selectedTone[1], rules);
    setSheetOpen(false);
  }

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>
              {binders.length} binders · {totalCards} cards
            </Text>
            <Text style={styles.title}>
              <Text style={styles.titleAccent}>Binders</Text>
            </Text>
          </View>
          <TouchableOpacity
            style={styles.addBtn}
            accessibilityLabel="New binder"
            onPress={openSheet}
          >
            <Icon name="plus" size={18} color={Colors.text} />
          </TouchableOpacity>
        </View>

        {isError && <ErrorPanel message="Failed to load binders" onRetry={refetch} />}

        {/* Binder cover cards */}
        <View style={styles.list}>
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <View key={i} style={[styles.cover, { backgroundColor: Colors.surface, opacity: 0.5 }]} />
              ))
            : binders.length === 0
            ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No binders yet</Text>
                  <Text style={styles.emptySubtitle}>Tap + to create your first binder</Text>
                </View>
              )
            : binders.map((binder, index) => (
                <BinderCover
                  key={binder.id}
                  binder={binder}
                  index={index}
                  onPress={() => router.push(`/binder/${binder.id}`)}
                />
              ))
          }
        </View>
      </ScrollView>

      {/* Create binder sheet */}
      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetOpen(false)}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => setSheetOpen(false)}
          />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetGrabber} />
            <Text style={styles.sheetEyebrow}>New binder</Text>
            <Text style={styles.sheetTitle}>Choose a name & color</Text>

            <TextInput
              style={styles.sheetInput}
              placeholder="Binder name"
              placeholderTextColor={Colors.text3}
              value={binderName}
              onChangeText={setBinderName}
              autoFocus
              returnKeyType="done"
            />

            <View style={styles.swatchRow}>
              {TONE_PAIRS.map(([start, end]) => (
                <TouchableOpacity
                  key={start}
                  style={[
                    styles.swatch,
                    selectedTone[0] === start && styles.swatchSelected,
                  ]}
                  onPress={() => setSelectedTone([start, end])}
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

            {/* Smart binder toggle + inline rule editor */}
            <TouchableOpacity
              style={[styles.smartToggle, isSmart && styles.smartToggleActive]}
              onPress={() => setIsSmart(v => !v)}
              accessibilityRole="switch"
              accessibilityState={{ checked: isSmart }}
            >
              <Icon name="flash" size={16} color={isSmart ? Colors.gold : Colors.text2} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.smartToggleLabel, isSmart && styles.smartToggleLabelActive]}>
                  Smart binder
                </Text>
                <Text style={styles.smartToggleHint}>
                  Auto-fills from your collection by set + rarity. Read-only.
                </Text>
              </View>
              <View style={[styles.smartIndicator, isSmart && styles.smartIndicatorActive]} />
            </TouchableOpacity>

            {isSmart && (
              <ScrollView style={styles.rulesScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {ruleOptions.sets.length === 0 && ruleOptions.rarities.length === 0 ? (
                  <Text style={styles.ruleEmpty}>
                    Your collection is empty — add some cards before you can build a smart binder.
                  </Text>
                ) : (
                  <SmartRulesEditor
                    value={draftRules}
                    onChange={setDraftRules}
                    availableSets={ruleOptions.sets}
                    availableRarities={ruleOptions.rarities}
                  />
                )}
              </ScrollView>
            )}

            <TouchableOpacity style={styles.createBtn} onPress={handleCreate}>
              <Text style={styles.createBtnText}>Create binder</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
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
          <CardThumb card={binder.cover} width={56} />
        </View>
        <View style={[styles.cardPreview, { transform: [{ rotate: '8deg' }], right: 18, top: 18 }]}>
          <CardThumb card={binder.cover} width={68} />
        </View>

        {/* Metadata */}
        <View style={styles.meta}>
          <Text style={styles.binderName}>{binder.name}</Text>
          <Text style={styles.binderSubtitle}>
            {binder.rules ? 'SMART · ' : ''}{binder.subtitle.toUpperCase()}
          </Text>
          <View style={styles.countRow}>
            <Text style={styles.binderCount}>{binder.count}</Text>
            <Text style={styles.binderCountLabel}> cards</Text>
          </View>
        </View>

        {/* Smart badge — small lightning chip in the upper right when this is
            a smart binder so it's identifiable from the list view. */}
        {binder.rules && (
          <View style={styles.smartBadge}>
            <Icon name="flash" size={12} color={Colors.gold} />
          </View>
        )}

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
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.glass,
    marginBottom: 6,
  },
  list: {
    gap: 18,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontFamily: FontFamily.display,
    fontSize: 20,
    color: Colors.text3,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: Colors.text3,
  },
  // Binder cover card
  cover: {
    height: 168,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
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
    right: 100,
  },
  binderName: {
    fontFamily: FontFamily.display,
    fontSize: 22,
    color: Colors.text,
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
    color: Colors.text,
  },
  binderCountLabel: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
  },
  // Creation sheet
  backdrop: {
    flex: 1,
    backgroundColor: Colors.scrim,
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
    color: Colors.bg,
  },
  // Smart binder UI
  smartToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.glass,
    marginBottom: 12,
  },
  smartToggleActive: {
    borderColor: Colors.goldBorder,
    backgroundColor: Colors.goldFaint,
  },
  smartToggleLabel: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 14,
    color: Colors.text,
  },
  smartToggleLabelActive: {
    color: Colors.gold,
  },
  smartToggleHint: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 0.6,
    color: Colors.text3,
    marginTop: 2,
  },
  smartIndicator: {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 1, borderColor: Colors.line,
    backgroundColor: 'transparent',
  },
  smartIndicatorActive: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  smartBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.5)',
    backgroundColor: 'rgba(10,10,12,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rulesScroll: {
    maxHeight: 220,
    marginBottom: 14,
  },
  ruleLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 1.4,
    color: Colors.text3,
    marginBottom: 6,
  },
  ruleChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  ruleChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.glass,
  },
  ruleChipActive: {
    borderColor: 'rgba(255,215,0,0.45)',
    backgroundColor: 'rgba(255,215,0,0.10)',
  },
  ruleChipText: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.6,
    color: Colors.text2,
  },
  ruleChipTextActive: {
    color: Colors.gold,
  },
  ruleEmpty: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: Colors.text3,
    textAlign: 'center',
    paddingVertical: 16,
  },
});
