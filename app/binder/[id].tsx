import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import { BinderBoard } from '@/components/binders/BinderBoard';
import { TileEditorSheet } from '@/components/binders/TileEditorSheet';
import { CoverPickerSheet } from '@/components/binders/CoverPickerSheet';
import { binderPageCount } from '@/lib/binder/reorder-model';
import {
  BinderItem,
  useBinder,
  useBinderCards,
  useBinderItems,
  useBinderMedia,
  useDeleteBinder,
  useReconcileBinderTiles,
  useRemoveCardFromBinder,
  useRenameBinder,
  useSetBinderCover,
  useSetBinderItemPositions,
  useUpdateBinderRules,
} from '@/lib/api/binders';
import { useFriendBinder, useFriendBinderCards } from '@/lib/api/friends';
import { useAllSetNames } from '@/lib/api/cards';
import { ALL_RARITIES } from '@/lib/api/types';
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

  // Owned binders carry real item rows (needed for drag-reorder) + media; friend
  // binders are read-only cards with no local mirror.
  const ownItemsQuery = useBinderItems(isOwn ? (id ?? '') : '');
  const { data: media = [] } = useBinderMedia(isOwn ? (id ?? '') : '');

  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [activePage, setActivePage] = useState(0);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [beautifyOpen, setBeautifyOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [draftRules, setDraftRules] = useState<SmartBinderRules | null>(null);

  // Rule-editor options: owned sets/rarities first (familiar), then the rest of
  // the catalog so users can target sets/rarities they don't own yet.
  const { data: entries = [] } = useCollectionEntries();
  const { data: allSets = [] } = useAllSetNames();
  const ruleOptions = useMemo(
    () => deriveRuleOptions(entries.map(e => ({ set: e.card.set, rarity: e.card.rarity }))),
    [entries],
  );
  const availableSets = useMemo(
    () => Array.from(new Set([...ruleOptions.sets, ...allSets])),
    [ruleOptions.sets, allSets],
  );
  const availableRarities = useMemo(
    () => Array.from(new Set([...ruleOptions.rarities, ...ALL_RARITIES])),
    [ruleOptions.rarities],
  );

  // Mutations only fire for owned binders. They're safe to instantiate
  // unconditionally — the screen just won't expose UI that calls them.
  const removeCard = useRemoveCardFromBinder();
  const renameBinder = useRenameBinder();
  const deleteBinder = useDeleteBinder();
  const setPositions = useSetBinderItemPositions();
  const setCover = useSetBinderCover();
  const reconcileTiles = useReconcileBinderTiles();

  // Recover any cards hidden behind a tile (legacy collisions): move them to
  // free slots once per binder open. No-op when there are no collisions.
  const reconciledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isOwn || !id) return;
    if ((ownItemsQuery.data?.length ?? 0) === 0) return;
    if (!media.some(md => md.kind !== 'background')) return;
    if (reconciledRef.current === id) return;
    reconciledRef.current = id;
    reconcileTiles(id).catch(() => { reconciledRef.current = null; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwn, id, ownItemsQuery.data, media]);
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
  // Auto-add binders have rules but own real, editable rows — so unlike a
  // virtual smart binder, the user can still add/remove cards by hand.
  const isAuto = !!b.rules?.autoAdd;
  // A smart binder is a live virtual filter only when it owns no real rows. Once
  // it has cards (auto-filled, or kept after turning auto off) it's a real,
  // editable binder — turning auto off no longer strips editing/cover/layout.
  const hasRealRows = (ownItemsQuery.data?.length ?? 0) > 0;
  const isVirtual = isSmart && !isAuto && !hasRealRows;
  // Only owned, real-row binders can be rearranged/decorated.
  const canEdit = isOwn && !isVirtual;

  // Drag-reorder needs the item ids; for virtual/friend binders we synthesize a
  // read-only list keyed on card id (no reordering exposed).
  const items: BinderItem[] = canEdit
    ? (ownItemsQuery.data ?? [])
    : binderCards.map((c, i) => ({ itemId: c.id, card: c, position: i }));

  const maxCardSlot = items.reduce((mx, it) => Math.max(mx, it.position), -1);
  const maxMediaPage = media.reduce((mx, md) => Math.max(mx, md.pageNum), 0);
  const pageCount = binderPageCount(maxCardSlot, maxMediaPage);

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
      // Smart binders always auto-add — there's no virtual/off mode anymore.
      await updateRules(b.id, { ...draftRules, autoAdd: true });
      setRulesOpen(false);
    } catch (e) {
      Alert.alert('Save failed', (e as Error).message);
    }
  }

  function switchToManual() {
    Alert.alert(
      'Switch to manual?',
      'This binder keeps the cards it already has but stops auto-adding and drops its filters. You arrange it by hand from then on.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch to manual',
          onPress: async () => {
            try { await updateRules(b.id, null); setRulesOpen(false); }
            catch (e) { Alert.alert('Failed', (e as Error).message); }
          },
        },
      ],
    );
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

      {/* Interactive board: paged 3×3 grid + tiles/backgrounds + drag-reorder */}
      <BinderBoard
        items={items}
        media={media}
        tone={binder.tone}
        editing={editing && canEdit}
        activePage={activePage}
        onPageChange={p => setActivePage(Math.max(0, Math.min(pageCount - 1, p)))}
        onPressCard={card => router.push(`/card/${card.id}`)}
        onRemoveCard={confirmRemoveCard}
        onSetPositions={updates =>
          setPositions(b.id, updates).catch(e => Alert.alert('Move failed', (e as Error).message))
        }
      />

      {/* Pagination dots — only meaningful with >1 page */}
      {pageCount > 1 && (
        <View style={styles.dotsRow}>
          {Array.from({ length: pageCount }).map((_, i) => (
            <View key={i} style={[styles.dot, i === activePage && styles.dotActive]} />
          ))}
        </View>
      )}

      {/* Bottom CTAs */}
      <View style={[styles.ctaRow, { paddingBottom: insets.bottom + 16 }]}>
        {editing ? (
          <>
            <TouchableOpacity
              style={styles.ctaPrimary}
              onPress={() => setEditing(false)}
              accessibilityLabel="Done editing"
            >
              <Icon name="check" size={15} color="#0A0A0C" />
              <Text style={styles.ctaPrimaryText}>Done</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.ctaIcon}
              onPress={() => setBeautifyOpen(true)}
              accessibilityLabel="Add photo"
            >
              <Icon name="camera" size={16} color={Colors.text} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.ctaPrimary} onPress={handleShare} accessibilityLabel="Share binder">
              <Icon name="share" size={15} color="#0A0A0C" />
              <Text style={styles.ctaPrimaryText}>Share</Text>
            </TouchableOpacity>
            {canEdit && (
              <TouchableOpacity style={styles.ctaIcon} onPress={handleAdd} accessibilityLabel="Add cards">
                <Icon name="plus" size={16} color={Colors.text} />
              </TouchableOpacity>
            )}
          </>
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

          {canEdit && (
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => { setMenuOpen(false); setEditing(true); }}
            >
              <Icon name="grid" size={18} color={Colors.text} />
              <Text style={styles.menuLabel}>Edit layout</Text>
            </TouchableOpacity>
          )}

          {canEdit && (
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => { setMenuOpen(false); setCoverOpen(true); }}
            >
              <Icon name="star" size={18} color={Colors.text} />
              <Text style={styles.menuLabel}>Choose cover</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.menuRow} onPress={openRulesEditor}>
            <Icon name="flash" size={18} color={Colors.gold} />
            <Text style={[styles.menuLabel, { color: Colors.gold }]}>
              {isSmart ? 'Edit rules' : 'Make this smart'}
            </Text>
          </TouchableOpacity>

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
                  availableSets={availableSets}
                  availableRarities={availableRarities}
                />
              )}
            </ScrollView>
            <View style={[styles.rulesSheetFooter, { paddingHorizontal: Spacing.xl }]}>
              {isSmart && (
                <TouchableOpacity style={styles.switchManualBtn} onPress={switchToManual}>
                  <Text style={styles.switchManualText}>Switch to manual binder</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.saveBtn} onPress={commitRules}>
                <Text style={styles.saveBtnText}>Save rules</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Beautify — upload + place photo tiles / backgrounds on the current page */}
      <TileEditorSheet
        visible={beautifyOpen}
        onClose={() => setBeautifyOpen(false)}
        binderId={b.id}
        pageNum={activePage}
      />

      {/* Cover picker — choose which (up to two) cards show on the binder cover */}
      <CoverPickerSheet
        visible={coverOpen}
        onClose={() => setCoverOpen(false)}
        cards={items.map(i => i.card)}
        initial={b.covers.map(c => c.id)}
        onSave={ids =>
          setCover(b.id, ids).catch(e => Alert.alert('Save failed', (e as Error).message))
        }
      />
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
    borderRadius: Radius.full,
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
    color: Colors.bg,
  },
  ctaIcon: {
    width: 50,
    paddingVertical: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Sheets
  backdrop: { flex: 1, backgroundColor: Colors.scrim },
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
    color: Colors.bg,
  },
  switchManualBtn: {
    paddingVertical: 13,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: Colors.glass,
  },
  switchManualText: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 14,
    color: Colors.text,
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
