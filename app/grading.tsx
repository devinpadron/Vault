// Grading queue tracker. Lists cards sent off for grading, grouped by
// lifecycle stage. Tap a row to advance the stage or record the returned
// grade. The "+" button creates a new submission from any card currently in
// the user's collection.

import { useMemo, useState } from 'react';
import {
  Alert, FlatList, Modal, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { useCollectionEntries } from '@/lib/db/collection';
import {
  GradingSubmission, GRADING_STAGES, STAGE_LABEL,
  useGradingQueue, useUpsertGrading, useDeleteGrading,
} from '@/lib/db/grading';
import { GradingStage } from '@/lib/db/cloud-sync';
import { Card } from '@/types';
import { Colors, FontFamily, NavButtonStyle, Radius, Spacing } from '@/constants/theme';

const GRADERS = ['PSA', 'CGC', 'BGS', 'TAG', 'ACE'] as const;
type Grader = (typeof GRADERS)[number];

function StageChip({ stage }: { stage: GradingStage }) {
  const tone =
    stage === 'completed' ? Colors.up :
    stage === 'shipped_back' ? Colors.gold :
    Colors.text2;
  return (
    <View style={[styles.stageChip, { borderColor: tone }]}>
      <Text style={[styles.stageChipText, { color: tone }]}>
        {STAGE_LABEL[stage].toUpperCase()}
      </Text>
    </View>
  );
}

export default function GradingScreen() {
  const insets = useSafeAreaInsets();
  const { data: queue = [], isLoading } = useGradingQueue();
  const { data: collectionEntries = [] } = useCollectionEntries();
  const upsert = useUpsertGrading();
  const remove = useDeleteGrading();

  const [newOpen, setNewOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<GradingSubmission | null>(null);
  // The "new submission" sheet has two stages — form vs. card picker. We swap
  // the modal's contents rather than stacking another Modal on top, because
  // nested Modals are unreliable on RN (especially Android).
  const [pickStage, setPickStage] = useState(false);

  // New / edit form state
  const [selCard, setSelCard]                 = useState<Card | null>(null);
  const [grader, setGrader]                   = useState<Grader>('PSA');
  const [submissionIdInput, setSubmissionIdInput] = useState('');
  const [stage, setStage]                     = useState<GradingStage>('received');
  const [returnedGrade, setReturnedGrade]     = useState('');

  const collectionCards = useMemo(
    () => collectionEntries.map(e => e.card),
    [collectionEntries],
  );

  function openNew() {
    setSelCard(null);
    setGrader('PSA');
    setSubmissionIdInput('');
    setStage('received');
    setReturnedGrade('');
    setPickStage(false);
    setNewOpen(true);
  }

  function closeNew() {
    setNewOpen(false);
    setPickStage(false);
  }

  function openEdit(sub: GradingSubmission) {
    setEditTarget(sub);
    setGrader(sub.grader as Grader);
    setSubmissionIdInput(sub.submission_id ?? '');
    setStage(sub.stage);
    setReturnedGrade(sub.returned_grade ?? '');
  }

  async function commitNew() {
    if (!selCard) {
      Alert.alert('Pick a card', 'Choose which card you sent for grading.');
      return;
    }
    try {
      await upsert({
        cardId:        selCard.id,
        cardName:      selCard.name,
        cardSet:       selCard.set || null,
        grader,
        submissionId:  submissionIdInput.trim() || null,
        stage,
        submittedAtMs: Date.now(),
      });
      setNewOpen(false);
    } catch (e) {
      Alert.alert('Save failed', (e as Error).message);
    }
  }

  async function commitEdit() {
    if (!editTarget) return;
    const advancingToCompleted = stage === 'completed' && editTarget.stage !== 'completed';
    try {
      await upsert({
        id:             editTarget.id,
        cardId:         editTarget.card_id,
        cardName:       editTarget.card_name,
        cardSet:        editTarget.card_set,
        grader,
        submissionId:   submissionIdInput.trim() || null,
        stage,
        submittedAtMs:  editTarget.submitted_at,
        returnedAtMs:   advancingToCompleted ? Date.now() : editTarget.returned_at,
        returnedGrade:  returnedGrade.trim() || null,
        declaredValue:  editTarget.declared_value,
        notes:          editTarget.notes,
      });
      setEditTarget(null);
    } catch (e) {
      Alert.alert('Save failed', (e as Error).message);
    }
  }

  function confirmDelete(sub: GradingSubmission) {
    Alert.alert(
      'Delete submission?',
      `Remove ${sub.card_name} (${sub.grader}) from the grading queue.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await remove(sub.id);
              setEditTarget(null);
            } catch (e) { Alert.alert('Delete failed', (e as Error).message); }
          },
        },
      ],
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={isLoading ? [] : queue}
        keyExtractor={s => s.id}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 80 }]}
        ListHeaderComponent={
          <>
            <View style={styles.navBar}>
              <TouchableOpacity style={styles.navBtn} onPress={() => router.back()}>
                <Icon name="chevron-left" size={18} color={Colors.text} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.navBtn}
                onPress={openNew}
                accessibilityLabel="New submission"
              >
                <Icon name="plus" size={18} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.eyebrow}>
              {isLoading ? 'LOADING…' : `${queue.length} submission${queue.length === 1 ? '' : 's'}`}
            </Text>
            <Text style={styles.title}>
              Grading <Text style={styles.titleAccent}>queue</Text>
            </Text>
          </>
        }
        ListEmptyComponent={
          isLoading ? null : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Nothing in the queue</Text>
              <Text style={styles.emptySubtitle}>
                Tap + to log a card sent off for grading. You can track stage,
                grader, and final grade.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => openEdit(item)}
            accessibilityRole="button"
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowCard} numberOfLines={1}>{item.card_name}</Text>
              <Text style={styles.rowMeta} numberOfLines={1}>
                {item.grader}
                {item.submission_id ? ` · #${item.submission_id}` : ''}
                {item.returned_grade ? ` · GRADE ${item.returned_grade}` : ''}
              </Text>
            </View>
            <StageChip stage={item.stage} />
            <Icon name="chevron-right" size={14} color={Colors.text3} />
          </TouchableOpacity>
        )}
      />

      {/* New submission sheet — staged: form ↔ card picker. */}
      <Modal
        visible={newOpen}
        transparent
        animationType="slide"
        onRequestClose={closeNew}
        statusBarTranslucent
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeNew} />
        <View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + 16 },
            pickStage && { maxHeight: '85%' },
          ]}
        >
          <View style={styles.sheetGrabber} />

          {pickStage ? (
            <>
              <TouchableOpacity
                onPress={() => setPickStage(false)}
                style={styles.backRow}
                accessibilityRole="button"
                accessibilityLabel="Back to submission form"
              >
                <Icon name="chevron-left" size={14} color={Colors.text3} />
                <Text style={styles.backLabel}>BACK</Text>
              </TouchableOpacity>
              <Text style={styles.sheetEyebrow}>Pick a card</Text>
              <Text style={styles.sheetTitle}>From your collection</Text>
              {collectionCards.length === 0 ? (
                <Text style={styles.sheetEmpty}>
                  Your collection is empty. Add cards first.
                </Text>
              ) : (
                <FlatList
                  data={collectionCards}
                  keyExtractor={c => c.id}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.pickerCardRow}
                      onPress={() => {
                        setSelCard(item);
                        setPickStage(false);
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pickerCardName} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.pickerCardSet} numberOfLines={1}>{item.set} · {item.no}</Text>
                      </View>
                      <Icon name="chevron-right" size={14} color={Colors.text3} />
                    </TouchableOpacity>
                  )}
                />
              )}
            </>
          ) : (
            <>
              <Text style={styles.sheetEyebrow}>New submission</Text>
              <Text style={styles.sheetTitle}>Log a graded card</Text>

              <Text style={styles.fieldLabel}>CARD</Text>
              <TouchableOpacity style={styles.pickerRow} onPress={() => setPickStage(true)}>
                <Text style={[styles.pickerValue, !selCard && { color: Colors.text3 }]} numberOfLines={1}>
                  {selCard ? selCard.name : 'Pick from your collection'}
                </Text>
                <Icon name="chevron-right" size={14} color={Colors.text3} />
              </TouchableOpacity>

              <Text style={styles.fieldLabel}>GRADER</Text>
              <View style={styles.chipRow}>
                {GRADERS.map(g => (
                  <TouchableOpacity
                    key={g}
                    onPress={() => setGrader(g)}
                    style={[styles.selectChip, grader === g && styles.selectChipActive]}
                  >
                    <Text style={[styles.selectChipText, grader === g && styles.selectChipTextActive]}>
                      {g}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>SUBMISSION ID (OPTIONAL)</Text>
              <TextInput
                value={submissionIdInput}
                onChangeText={setSubmissionIdInput}
                placeholder="e.g. 78421006"
                placeholderTextColor={Colors.text3}
                style={styles.textInput}
                autoCapitalize="characters"
              />

              <TouchableOpacity style={styles.primaryBtn} onPress={commitNew}>
                <Text style={styles.primaryBtnText}>Add to queue</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </Modal>

      {/* Edit / advance sheet */}
      <Modal
        visible={editTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setEditTarget(null)}
        statusBarTranslucent
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setEditTarget(null)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetGrabber} />
          {editTarget && (
            <>
              <Text style={styles.sheetEyebrow}>{editTarget.card_name}</Text>
              <Text style={styles.sheetTitle}>Update status</Text>

              <Text style={styles.fieldLabel}>STAGE</Text>
              <View style={styles.chipRow}>
                {GRADING_STAGES.map(s => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setStage(s)}
                    style={[styles.selectChip, stage === s && styles.selectChipActive]}
                  >
                    <Text style={[styles.selectChipText, stage === s && styles.selectChipTextActive]}>
                      {STAGE_LABEL[s]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>RETURNED GRADE</Text>
              <TextInput
                value={returnedGrade}
                onChangeText={setReturnedGrade}
                placeholder="e.g. 10, 9.5"
                placeholderTextColor={Colors.text3}
                style={styles.textInput}
              />

              <Text style={styles.fieldLabel}>SUBMISSION ID</Text>
              <TextInput
                value={submissionIdInput}
                onChangeText={setSubmissionIdInput}
                placeholder="optional"
                placeholderTextColor={Colors.text3}
                style={styles.textInput}
                autoCapitalize="characters"
              />

              <TouchableOpacity style={styles.primaryBtn} onPress={commitEdit}>
                <Text style={styles.primaryBtnText}>Save changes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dangerBtn}
                onPress={() => editTarget && confirmDelete(editTarget)}
              >
                <Text style={styles.dangerBtnText}>Delete submission</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingHorizontal: Spacing.xl },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  navBtn: NavButtonStyle,
  eyebrow: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    color: Colors.text3,
    marginBottom: 6,
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 36,
    color: Colors.text,
    lineHeight: 38,
    marginBottom: 24,
  },
  titleAccent: {
    fontFamily: FontFamily.displayItalic,
    color: Colors.gold,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
    gap: 10,
  },
  emptyTitle: {
    fontFamily: FontFamily.display,
    fontSize: 22,
    color: Colors.text3,
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
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.surface,
    marginBottom: 10,
  },
  rowCard: {
    fontFamily: FontFamily.display,
    fontSize: 16,
    color: Colors.text,
  },
  rowMeta: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    color: Colors.text3,
    marginTop: 2,
  },
  stageChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  stageChipText: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  // ── Sheets ────────────────────────────────────────────────────────────
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    backgroundColor: Colors.elevated,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: Spacing.xl,
    paddingTop: 10,
  },
  sheetGrabber: {
    alignSelf: 'center',
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.line,
    marginBottom: 16,
  },
  sheetEyebrow: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    color: Colors.text3,
    marginBottom: 6,
  },
  sheetTitle: {
    fontFamily: FontFamily.display,
    fontSize: 26,
    color: Colors.text,
    marginBottom: 18,
  },
  sheetEmpty: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: Colors.text3,
    paddingVertical: 18,
    textAlign: 'center',
  },
  fieldLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 1.4,
    color: Colors.text3,
    marginBottom: 6,
    marginTop: 4,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginBottom: 14,
  },
  pickerValue: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: Colors.text,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  selectChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  selectChipActive: {
    borderColor: 'rgba(255,215,0,0.45)',
    backgroundColor: 'rgba(255,215,0,0.1)',
  },
  selectChipText: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 1.0,
    color: Colors.text2,
  },
  selectChipTextActive: {
    color: Colors.gold,
  },
  textInput: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
    fontFamily: FontFamily.mono,
    fontSize: 14,
    color: Colors.text,
    marginBottom: 14,
  },
  primaryBtn: {
    paddingVertical: 14,
    borderRadius: Radius.md,
    backgroundColor: Colors.gold,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 14,
    color: '#0A0A0C',
  },
  dangerBtn: {
    paddingVertical: 14,
    borderRadius: Radius.md,
    alignItems: 'center',
    marginTop: 10,
  },
  dangerBtnText: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 1.4,
    color: Colors.down,
  },
  pickerCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  pickerCardName: {
    fontFamily: FontFamily.display,
    fontSize: 16,
    color: Colors.text,
  },
  pickerCardSet: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    color: Colors.text3,
    marginTop: 2,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    marginBottom: 10,
  },
  backLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    color: Colors.text3,
  },
});
