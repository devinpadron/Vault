import { useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
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
import { CardThumb } from '@/components/cards/CardThumb';
import { Icon } from '@/components/ui/Icon';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import {
  useBinder,
  useBinderCards,
  useDeleteBinder,
  useRemoveCardFromBinder,
  useRenameBinder,
  useUpdateBinderRules,
} from '@/lib/api/binders';
import { useFriendBinder, useFriendBinderCards } from '@/lib/api/friends';
import { useAuth } from '@/lib/auth/AuthContext';
import { useBinderVisibility, useSetCollectionVisibility, useCollectionEntries } from '@/lib/db/collection';
import { SmartBinderRules } from '@/lib/db/cloud-sync';
import { VisibilityChip } from '@/components/ui/VisibilityChip';
import {
  SmartRulesEditor,
  deriveRuleOptions,
  rulesHaveAtLeastOneFilter,
} from '@/components/binders/SmartRulesEditor';
import { Colors, FontFamily, NavButtonStyle, Radius, Spacing } from '@/constants/theme';
import { Card } from '@/types';

const CONTAINER_MARGIN = 18;
const CONTAINER_PADDING = 14;
const COL_GAP = 10;
const SLEEVE_PADDING = 4;
const NUM_COLS = 3;
const PAGE_SIZE = 9;            // 3 × 3 grid per page

function getThumbWidth(screenWidth: number) {
  const inner = screenWidth - CONTAINER_MARGIN * 2 - CONTAINER_PADDING * 2;
  const sleeveWidth = (inner - COL_GAP * (NUM_COLS - 1)) / NUM_COLS;
  return Math.floor(sleeveWidth - SLEEVE_PADDING * 2);
}

// Split a card list into 9-card pages, padding the last page with nulls so
// every page renders an identically-sized 3×3 grid. An empty binder still
// gets one page so the user sees the empty sleeves.
function paginate(cards: Card[]): (Card | null)[][] {
  if (cards.length === 0) return [Array.from({ length: PAGE_SIZE }, () => null)];
  const pages: (Card | null)[][] = [];
  for (let i = 0; i < cards.length; i += PAGE_SIZE) {
    const slice = cards.slice(i, i + PAGE_SIZE) as (Card | null)[];
    while (slice.length < PAGE_SIZE) slice.push(null);
    pages.push(slice);
  }
  return pages;
}

export default function BinderOpenScreen() {
  const { id, ownerId } = useLocalSearchParams<{ id: string; ownerId?: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // Two data sources sit behind this screen. Your own binders live in the
  // local cloud-mirror (instant reads, write-through to Supabase). Friends'
  // public binders live in Supabase under RLS — there's nothing to mirror.
  const isOwn = !ownerId || ownerId === user?.id;

  const ownQuery    = useBinder(isOwn ? (id ?? '') : '');
  const friendQuery = useFriendBinder(!isOwn ? (id ?? '') : '');
  const ownCardsQuery    = useBinderCards(isOwn ? (id ?? '') : '');
  const friendCardsQuery = useFriendBinderCards(!isOwn ? (id ?? '') : '');

  const binder      = isOwn ? ownQuery.data : friendQuery.data;
  const isLoading   = isOwn ? ownQuery.isLoading : friendQuery.isLoading;
  const isError     = isOwn ? ownQuery.isError : friendQuery.isError;
  const error       = isOwn ? ownQuery.error : friendQuery.error;
  const refetch     = isOwn ? ownQuery.refetch : friendQuery.refetch;
  const binderCards = (isOwn ? ownCardsQuery.data : friendCardsQuery.data) ?? [];

  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [activePage, setActivePage] = useState(0);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [draftRules, setDraftRules] = useState<SmartBinderRules | null>(null);

  // Options for the rules editor are derived from the user's main collection.
  const { data: entries = [] } = useCollectionEntries();
  const ruleOptions = useMemo(
    () => deriveRuleOptions(entries.map(e => ({ set: e.card.set, rarity: e.card.rarity }))),
    [entries],
  );

  // Mutations only fire for owned binders. They're safe to instantiate
  // unconditionally — the screen just won't expose UI that calls them.
  const removeCard = useRemoveCardFromBinder();
  const renameBinder = useRenameBinder();
  const deleteBinder = useDeleteBinder();
  const { data: isPublic = false } = useBinderVisibility((id ?? '') as string);
  const setVisibility = useSetCollectionVisibility();
  const updateRules = useUpdateBinderRules();

  if (isLoading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 8, paddingHorizontal: Spacing.lg }]}>
        <TouchableOpacity style={styles.navBtn} onPress={() => router.back()}>
          <Icon name="chevron-left" size={18} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.centerFill}>
          <Text style={styles.muted}>Loading binder…</Text>
        </View>
      </View>
    );
  }
  if (isError) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 8, paddingHorizontal: Spacing.lg }]}>
        <TouchableOpacity style={styles.navBtn} onPress={() => router.back()}>
          <Icon name="chevron-left" size={18} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ErrorPanel message="Couldn't load this binder" error={error} onRetry={refetch} />
        </View>
      </View>
    );
  }
  if (!binder) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 8, paddingHorizontal: Spacing.lg }]}>
        <TouchableOpacity style={styles.navBtn} onPress={() => router.back()}>
          <Icon name="chevron-left" size={18} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.centerFill}>
          <Text style={styles.muted}>Binder not found</Text>
        </View>
      </View>
    );
  }

  // Alias for closures — TS doesn't narrow `binder` (Binder | null) into the
  // handler functions defined below, even after the early-return null check.
  const b = binder;
  const isSmart = !!b.rules;

  const { width: screenWidth } = Dimensions.get('window');
  const thumbWidth = getThumbWidth(screenWidth);
  const pages = paginate(binderCards);
  const pageCount = pages.length;
  // Page width matches the binder card width so paging snaps to each page.
  const pageWidth = screenWidth;

  function handleShare() {
    // Include the owner so a friend's deep link round-trips to the friend
    // view, not a "binder not found" on the recipient's local mirror.
    const path = isOwn ? `/binder/${b.id}` : `/binder/${b.id}?ownerId=${ownerId}`;
    const deepLink = Linking.createURL(path);
    const possessive = isOwn ? 'my' : 'this';
    const body = `Check out ${possessive} "${b.name}" binder on Vault — ${b.count} cards`;
    Share.share(
      Platform.OS === 'android'
        ? { title: b.name, message: `${body}\n${deepLink}` }
        : { message: body, url: deepLink },
    ).catch(() => {});
  }

  function handleAdd() {
    // Quickest path to "add cards to this binder" today is the global search,
    // since the card-detail "Add to binder" sheet already lets the user pick
    // any binder. A dedicated picker is a future improvement.
    router.push('/search');
  }

  function openRename() {
    setRenameValue(b.name);
    setMenuOpen(false);
    setRenameOpen(true);
  }

  function openRulesEditor() {
    // Seed with the binder's existing rules; for manual binders, start from
    // an empty 'all' shell so the user has something to edit.
    setDraftRules(b.rules ?? { match: 'all' });
    setMenuOpen(false);
    setRulesOpen(true);
  }

  async function commitRules() {
    if (!draftRules) return;
    if (!rulesHaveAtLeastOneFilter(draftRules)) {
      Alert.alert(
        'Pick at least one filter',
        'A smart binder needs at least one rule — pick a set, rarity, supertype, value range, or other condition.',
      );
      return;
    }
    try {
      await updateRules(b.id, draftRules);
      setRulesOpen(false);
    } catch (e) {
      Alert.alert('Save failed', (e as Error).message);
    }
  }

  async function commitRename() {
    const next = renameValue.trim();
    if (!next || next === b.name) {
      setRenameOpen(false);
      return;
    }
    try {
      await renameBinder(b.id, next);
      setRenameOpen(false);
    } catch (e) {
      Alert.alert('Rename failed', (e as Error).message);
    }
  }

  function confirmDelete() {
    setMenuOpen(false);
    Alert.alert(
      'Delete binder?',
      `"${b.name}" and its ${b.count} cards will be removed from this binder. The cards themselves stay in your collection.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteBinder(b.id);
              router.back();
            } catch (e) {
              Alert.alert('Delete failed', (e as Error).message);
            }
          },
        },
      ],
    );
  }

  function confirmRemoveCard(card: Card) {
    Alert.alert(
      'Remove from binder?',
      `"${card.name}" will be removed from "${b.name}". Your collection isn't affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeCard(b.id, card.id);
            } catch (e) {
              Alert.alert('Remove failed', (e as Error).message);
            }
          },
        },
      ],
    );
  }

  return (
    <View style={styles.root}>
      {/* Nav header */}
      <View style={[styles.navBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.navBtn} onPress={() => router.back()}>
          <Icon name="chevron-left" size={18} color={Colors.text} />
        </TouchableOpacity>
        {isOwn ? (
          <View style={styles.navActions}>
            <VisibilityChip
              isPublic={isPublic}
              surfaceLabel={`binder "${b.name}"`}
              compact
              onToggle={() => setVisibility({ collectionId: b.id }, !isPublic)}
            />
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => setMenuOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Binder options"
            >
              <Icon name="menu" size={18} color={Colors.text} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.navBtn} />
        )}
      </View>

      {/* Title */}
      <View style={styles.titleSection}>
        <Text style={styles.eyebrow}>
          {isSmart ? 'SMART · ' : ''}
          {binder.subtitle || `${binder.count} ${binder.count === 1 ? 'CARD' : 'CARDS'}`}
          {pageCount > 1 ? ` · PAGE ${activePage + 1}/${pageCount}` : ''}
        </Text>
        <Text style={styles.title}>{binder.name}</Text>
      </View>

      {/* Horizontal pager — each page is a 3×3 grid inside the gradient sleeve */}
      <FlatList
        data={pages}
        keyExtractor={(_, i) => `page-${i}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={e => {
          const i = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
          setActivePage(Math.max(0, Math.min(pageCount - 1, i)));
        }}
        getItemLayout={(_, i) => ({ length: pageWidth, offset: pageWidth * i, index: i })}
        renderItem={({ item: page }) => (
          <View style={{ width: pageWidth }}>
            <View style={[styles.sleeveContainer, { marginHorizontal: CONTAINER_MARGIN, marginBottom: 0 }]}>
              <LinearGradient
                colors={binder.tone}
                start={{ x: 0.15, y: 0 }}
                end={{ x: 0.85, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              {binderCards.length === 0 ? (
                <View style={styles.emptyGrid}>
                  <Text style={styles.emptyTitle}>No cards yet</Text>
                  <Text style={styles.emptySubtitle}>Tap + to add cards</Text>
                </View>
              ) : (
                <View style={styles.grid}>
                  {[0, 1, 2].map(rowIdx => (
                    <View
                      key={rowIdx}
                      style={[styles.gridRow, rowIdx < 2 && { marginBottom: COL_GAP }]}
                    >
                      {page.slice(rowIdx * NUM_COLS, rowIdx * NUM_COLS + NUM_COLS).map((card, colIdx) => (
                        <View key={colIdx} style={[styles.sleeve, { width: thumbWidth + SLEEVE_PADDING * 2 }]}>
                          {card ? (
                            <TouchableOpacity
                              onPress={() => router.push(`/card/${card.id}`)}
                              onLongPress={isOwn && !isSmart ? () => confirmRemoveCard(card) : undefined}
                              activeOpacity={0.85}
                              accessibilityRole="button"
                              accessibilityLabel={
                                isOwn && !isSmart ? `${card.name}. Long-press to remove.` : card.name
                              }
                            >
                              <CardThumb card={card} width={thumbWidth} />
                            </TouchableOpacity>
                          ) : (
                            <View style={{
                              width: thumbWidth,
                              height: Math.floor(thumbWidth * 1.4),
                              backgroundColor: 'rgba(0,0,0,0.25)',
                              borderRadius: 4,
                            }} />
                          )}
                          <LinearGradient
                            colors={[
                              'rgba(255,255,255,0.18)',
                              'transparent',
                              'transparent',
                              'rgba(255,255,255,0.08)',
                            ]}
                            locations={[0, 0.3, 0.7, 1]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[StyleSheet.absoluteFill, { borderRadius: Radius.sm }]}
                            pointerEvents="none"
                          />
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}
      />

      {/* Pagination dots — only meaningful with >1 page */}
      {pageCount > 1 && (
        <View style={styles.dotsRow}>
          {pages.map((_, i) => (
            <View key={i} style={[styles.dot, i === activePage && styles.dotActive]} />
          ))}
        </View>
      )}

      {/* Bottom CTAs */}
      <View style={[styles.ctaRow, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={styles.ctaPrimary} onPress={handleShare} accessibilityLabel="Share binder">
          <Icon name="share" size={15} color="#0A0A0C" />
          <Text style={styles.ctaPrimaryText}>Share</Text>
        </TouchableOpacity>
        {isOwn && !isSmart && (
          <TouchableOpacity style={styles.ctaIcon} onPress={handleAdd} accessibilityLabel="Add cards">
            <Icon name="plus" size={16} color={Colors.text} />
          </TouchableOpacity>
        )}
      </View>

      {/* Menu sheet — Rename / Delete */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setMenuOpen(false)}
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetGrabber} />
          <Text style={styles.sheetEyebrow}>BINDER OPTIONS</Text>
          <Text style={styles.sheetTitle}>{binder.name}</Text>

          <TouchableOpacity style={styles.menuRow} onPress={openRename}>
            <Icon name="edit" size={18} color={Colors.text} />
            <Text style={styles.menuLabel}>Rename binder</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuRow} onPress={openRulesEditor}>
            <Icon name="flash" size={18} color={Colors.gold} />
            <Text style={[styles.menuLabel, { color: Colors.gold }]}>
              {isSmart ? 'Edit rules' : 'Make this smart'}
            </Text>
          </TouchableOpacity>

          {isSmart && (
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                setMenuOpen(false);
                Alert.alert(
                  'Convert to manual binder?',
                  'This binder will keep its name and tone but stop auto-filling. It will become empty — you can add cards by hand from then on.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Convert',
                      onPress: async () => {
                        try { await updateRules(b.id, null); }
                        catch (e) { Alert.alert('Convert failed', (e as Error).message); }
                      },
                    },
                  ],
                );
              }}
            >
              <Icon name="edit" size={18} color={Colors.text} />
              <Text style={styles.menuLabel}>Convert to manual</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={[styles.menuRow, styles.menuRowDanger]} onPress={confirmDelete}>
            <Icon name="trash" size={18} color={Colors.down} />
            <Text style={[styles.menuLabel, { color: Colors.down }]}>Delete binder</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Rename sheet — separate so it can use autoFocus + KAV */}
      <Modal
        visible={renameOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setRenameOpen(false)}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => setRenameOpen(false)}
          />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetGrabber} />
            <Text style={styles.sheetEyebrow}>RENAME</Text>
            <Text style={styles.sheetTitle}>New binder name</Text>
            <TextInput
              style={styles.input}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Binder name"
              placeholderTextColor={Colors.text3}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={commitRename}
              maxLength={48}
            />
            <TouchableOpacity style={styles.saveBtn} onPress={commitRename}>
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Smart-binder rules editor */}
      <Modal
        visible={rulesOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setRulesOpen(false)}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.rulesSheet, { paddingBottom: insets.bottom + 16, paddingTop: insets.top + 32 }]}>
            <View style={styles.rulesSheetHeader}>
              <TouchableOpacity onPress={() => setRulesOpen(false)} style={styles.navBtn}>
                <Icon name="close" size={18} color={Colors.text} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetEyebrow}>{isSmart ? 'EDIT RULES' : 'MAKE SMART'}</Text>
                <Text style={styles.rulesSheetTitle}>{b.name}</Text>
              </View>
            </View>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: Spacing.xl, paddingBottom: 32 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {draftRules && (
                <SmartRulesEditor
                  value={draftRules}
                  onChange={setDraftRules}
                  availableSets={ruleOptions.sets}
                  availableRarities={ruleOptions.rarities}
                />
              )}
            </ScrollView>
            <View style={[styles.rulesSheetFooter, { paddingHorizontal: Spacing.xl }]}>
              <TouchableOpacity style={styles.saveBtn} onPress={commitRules}>
                <Text style={styles.saveBtnText}>Save rules</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { fontFamily: FontFamily.body, fontSize: 14, color: Colors.text3 },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: 12,
  },
  navBtn: NavButtonStyle,
  navActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleSection: { paddingHorizontal: Spacing.xl, paddingBottom: 22 },
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
    fontSize: 32,
    color: Colors.text,
    lineHeight: 34,
  },
  sleeveContainer: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    padding: CONTAINER_PADDING,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  emptyGrid: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: {
    fontFamily: FontFamily.display,
    fontSize: 18,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  grid: { flexDirection: 'column' },
  gridRow: { flexDirection: 'row', justifyContent: 'space-between' },
  sleeve: {
    padding: SLEEVE_PADDING,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(0,0,0,0.35)',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    marginTop: 14,
    marginBottom: 6,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotActive: {
    width: 16,
    backgroundColor: Colors.gold,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: Spacing.xl,
    paddingTop: 18,
  },
  ctaPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: Radius.md,
    backgroundColor: Colors.gold,
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
  // Sheets
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
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
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.surface,
    marginBottom: 10,
  },
  menuRowDanger: {
    borderColor: 'rgba(255,92,92,0.25)',
  },
  menuLabel: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    color: Colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: FontFamily.body,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.surface,
    marginBottom: 14,
  },
  saveBtn: {
    paddingVertical: 14,
    borderRadius: Radius.md,
    backgroundColor: Colors.gold,
    alignItems: 'center',
  },
  saveBtnText: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 14,
    color: '#0A0A0C',
  },
  // Smart-rules editor sheet — full height so the scroll list breathes.
  rulesSheet: {
    flex: 1,
    backgroundColor: Colors.bg,
    flexDirection: 'column',
  },
  rulesSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: Spacing.xl,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  rulesSheetTitle: {
    fontFamily: FontFamily.display,
    fontSize: 22,
    color: Colors.text,
    marginTop: 2,
  },
  rulesSheetFooter: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
    backgroundColor: Colors.bg,
  },
});
