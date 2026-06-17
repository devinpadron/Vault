// Choose up to two cards to show on a binder's cover. No selection saves null
// (the binder falls back to the first two cards by position).

import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CardThumb } from '@/components/cards/CardThumb';
import { Colors, FontFamily, Radius, Spacing } from '@/constants/theme';
import { Card } from '@/types';

const MAX_COVERS = 2;

interface Props {
  visible: boolean;
  onClose: () => void;
  cards: Card[];                 // the binder's cards
  initial: string[];             // currently-shown cover card ids
  onSave: (ids: string[] | null) => void;
}

export function CoverPickerSheet({ visible, onClose, cards, initial, onSave }: Props) {
  const [selected, setSelected] = useState<string[]>(initial.slice(0, MAX_COVERS));
  // A binder can hold multiple copies of the same card_id; the cover is keyed by
  // card_id, so collapse duplicates for the picker.
  const uniqueCards = useMemo(
    () => Array.from(new Map(cards.map(c => [c.id, c])).values()),
    [cards],
  );

  // Re-seed when (re)opened for a different binder / selection.
  useEffect(() => {
    if (visible) setSelected(initial.slice(0, MAX_COVERS));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function toggle(id: string) {
    setSelected(sel => {
      if (sel.includes(id)) return sel.filter(x => x !== id);
      if (sel.length < MAX_COVERS) return [...sel, id];
      return [sel[1], id]; // full — drop the oldest pick
    });
  }

  function save() {
    onSave(selected.length > 0 ? selected : null);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <Text style={styles.eyebrow}>BINDER COVER</Text>
        <Text style={styles.title}>Choose up to two cards</Text>

        <FlatList
          data={uniqueCards}
          keyExtractor={c => c.id}
          numColumns={3}
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 12 }}
          style={{ maxHeight: 380 }}
          ListEmptyComponent={<Text style={styles.empty}>This binder has no cards yet.</Text>}
          renderItem={({ item }) => {
            const rank = selected.indexOf(item.id);
            const on = rank >= 0;
            return (
              <TouchableOpacity style={styles.cell} activeOpacity={0.85} onPress={() => toggle(item.id)}>
                <View style={[styles.thumbWrap, on && styles.thumbWrapOn]}>
                  <CardThumb card={item} width={92} />
                  {on && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{rank + 1}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />

        <View style={styles.actions}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setSelected([])}>
            <Text style={styles.secondaryBtnText}>Use default</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveBtn} onPress={save}>
            <Text style={styles.saveBtnText}>Save cover</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: Colors.scrim },
  sheet: {
    backgroundColor: Colors.elevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.xl,
    paddingTop: 12,
    paddingBottom: 24,
    maxHeight: '85%',
    borderTopWidth: 1,
    borderColor: Colors.line,
  },
  grabber: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.line, alignSelf: 'center', marginBottom: 16,
  },
  eyebrow: {
    fontFamily: FontFamily.mono, fontSize: 10, letterSpacing: 1.6,
    color: Colors.text3, marginBottom: 4,
  },
  title: { fontFamily: FontFamily.display, fontSize: 24, color: Colors.text, marginBottom: 16 },
  row: { gap: 10, marginBottom: 10 },
  cell: { flex: 1 },
  thumbWrap: {
    alignSelf: 'flex-start',
    borderRadius: Radius.sm + 2,
    padding: 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbWrapOn: { borderColor: Colors.gold },
  badge: {
    position: 'absolute', top: 4, right: 4,
    minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5,
    backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.bg,
  },
  badgeText: { fontFamily: FontFamily.bodySemi, fontSize: 11, color: Colors.bg },
  empty: {
    fontFamily: FontFamily.body, fontSize: 13, color: Colors.text3,
    textAlign: 'center', paddingVertical: 32,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  secondaryBtn: {
    flex: 1, paddingVertical: 14, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.line, alignItems: 'center', backgroundColor: Colors.glass,
  },
  secondaryBtnText: { fontFamily: FontFamily.bodySemi, fontSize: 14, color: Colors.text },
  saveBtn: {
    flex: 1.4, paddingVertical: 14, borderRadius: Radius.md,
    backgroundColor: Colors.gold, alignItems: 'center',
  },
  saveBtnText: { fontFamily: FontFamily.bodySemi, fontSize: 14, color: Colors.bg },
});
