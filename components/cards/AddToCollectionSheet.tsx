// Bottom sheet for adding a specific physical copy of a card to the
// collection: choose the printing (variant), raw condition, and optionally mark
// it graded (company + grade + cert). One sheet, progressive disclosure — the
// grading controls only appear once "Graded card" is on. The live price preview
// reflects the current selection and is snapshotted as the copy's value.

import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Switch,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GradedOption } from '@/lib/api/pricing';
import { ItemDetails } from '@/lib/db/cloud-sync';
import { CONDITIONS, GRADERS, GRADES } from '@/lib/grading/constants';
import { fmt } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { Card } from '@/types';
import { Colors, FontFamily, Radius, Spacing } from '@/constants/theme';

interface VariantOption {
  id: string | undefined;   // card_variants UUID; undefined = standard/any printing
  name: string;             // Scrydex variant name (used to match graded options)
  displayName: string;
  price: number | null;
}

interface Props {
  visible: boolean;
  card: Card;
  gradedOptions: GradedOption[];
  onClose: () => void;
  onAdd: (details: ItemDetails) => void | Promise<void>;
}

export function AddToCollectionSheet({ visible, card, gradedOptions, onClose, onAdd }: Props) {
  const insets = useSafeAreaInsets();

  const variantOptions: VariantOption[] = useMemo(() => {
    if (card.variantPrices?.length) {
      return card.variantPrices.map(v => ({
        id: v.id, name: v.name, displayName: v.displayName, price: v.price,
      }));
    }
    return [{ id: undefined, name: 'standard', displayName: 'Standard', price: card.value || null }];
  }, [card.variantPrices, card.value]);

  const [variantId, setVariantId] = useState<string | undefined>(variantOptions[0]?.id);
  const [condition, setCondition] = useState<string>('NM');
  const [graded, setGraded]       = useState(false);
  const [grader, setGrader]       = useState<string>('PSA');
  const [grade, setGrade]         = useState<string>('10');
  const [cert, setCert]           = useState('');
  const [busy, setBusy]           = useState(false);

  const selVariant = variantOptions.find(v => v.id === variantId) ?? variantOptions[0];

  // Effective market value for the current selection.
  const gradedMarket = useMemo(() => {
    if (!graded) return null;
    const hit = gradedOptions.find(
      o => o.variant === selVariant?.name && o.grader === grader && o.grade === grade,
    );
    return hit?.market ?? null;
  }, [graded, gradedOptions, selVariant, grader, grade]);

  const effectiveValue = graded ? gradedMarket : (selVariant?.price ?? null);

  async function handleAdd() {
    if (busy) return;
    setBusy(true);
    try {
      await onAdd({
        variantId:   selVariant?.id ?? null,
        variantName: selVariant?.displayName ?? null,
        condition:   graded ? null : condition,
        grader:      graded ? grader : null,
        grade:       graded ? grade : null,
        certNumber:  graded && cert.trim() ? cert.trim() : null,
        value:       effectiveValue,
      });
      haptic('success');
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.grabber} />
          <Text style={styles.eyebrow}>Add to collection</Text>
          <Text style={styles.title} numberOfLines={1}>{card.name}</Text>

          <ScrollView
            style={{ maxHeight: 420 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Variant */}
            {variantOptions.length > 1 && (
              <>
                <Text style={styles.label}>Printing</Text>
                <View style={styles.pillWrap}>
                  {variantOptions.map(v => {
                    const active = v.id === variantId;
                    return (
                      <TouchableOpacity
                        key={v.id ?? 'standard'}
                        style={[styles.pill, active && styles.pillActive]}
                        onPress={() => setVariantId(v.id)}
                      >
                        <Text style={[styles.pillText, active && styles.pillTextActive]}>
                          {v.displayName}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* Condition — raw copies only */}
            {!graded && (
              <>
                <Text style={styles.label}>Condition</Text>
                <View style={styles.pillWrap}>
                  {CONDITIONS.map(c => {
                    const active = c === condition;
                    return (
                      <TouchableOpacity
                        key={c}
                        style={[styles.pill, active && styles.pillActive]}
                        onPress={() => setCondition(c)}
                      >
                        <Text style={[styles.pillText, active && styles.pillTextActive]}>{c}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* Graded toggle */}
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Graded card</Text>
              <Switch
                value={graded}
                onValueChange={setGraded}
                trackColor={{ false: Colors.line, true: Colors.gold }}
                thumbColor={Colors.text}
              />
            </View>

            {graded && (
              <>
                <Text style={styles.label}>Company</Text>
                <View style={styles.pillWrap}>
                  {GRADERS.map(g => {
                    const active = g === grader;
                    return (
                      <TouchableOpacity
                        key={g}
                        style={[styles.pill, active && styles.pillActive]}
                        onPress={() => setGrader(g)}
                      >
                        <Text style={[styles.pillText, active && styles.pillTextActive]}>{g}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.label}>Grade</Text>
                <View style={styles.pillWrap}>
                  {GRADES.map(g => {
                    const active = g === grade;
                    return (
                      <TouchableOpacity
                        key={g}
                        style={[styles.pill, active && styles.pillActive]}
                        onPress={() => setGrade(g)}
                      >
                        <Text style={[styles.pillText, active && styles.pillTextActive]}>{g}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.label}>Cert number (optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 12345678"
                  placeholderTextColor={Colors.text3}
                  value={cert}
                  onChangeText={setCert}
                  keyboardType="number-pad"
                  returnKeyType="done"
                />
              </>
            )}
          </ScrollView>

          {/* Price preview */}
          <View style={styles.previewRow}>
            <Text style={styles.previewLabel}>
              {graded ? 'GRADED MARKET' : 'MARKET'}
            </Text>
            <Text style={styles.previewValue}>
              {effectiveValue != null ? `$${fmt(effectiveValue)}` : '—'}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.addBtn, busy && { opacity: 0.6 }]}
            onPress={handleAdd}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Add this copy to collection"
          >
            <Text style={styles.addBtnText}>Add to collection</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: Colors.elevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.xl,
    borderTopWidth: 1,
    borderColor: Colors.line,
  },
  grabber: {
    alignSelf: 'center',
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.line,
    marginBottom: Spacing.lg,
  },
  eyebrow: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 1,
    color: Colors.text3,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 26,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  label: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 1,
    color: Colors.text3,
    textTransform: 'uppercase',
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  pill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.surface,
  },
  pillActive: { borderColor: Colors.gold, backgroundColor: Colors.goldTint },
  pillText: { fontFamily: FontFamily.bodySemi, fontSize: 13, color: Colors.text2 },
  pillTextActive: { color: Colors.gold },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
  },
  toggleLabel: { fontFamily: FontFamily.bodySemi, fontSize: 15, color: Colors.text },
  input: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  previewLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 1,
    color: Colors.text3,
  },
  previewValue: { fontFamily: FontFamily.monoMed, fontSize: 18, color: Colors.text },
  addBtn: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.gold,
    borderRadius: Radius.full,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  addBtnText: { fontFamily: FontFamily.bodySemi, fontSize: 15, color: Colors.bg },
});
