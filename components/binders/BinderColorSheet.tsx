// Recolor a binder: pick one of the gradient tone pairs. The selection persists
// as (tone_start, tone_end) and drives every binder render surface (cover,
// board page background, friend views).

import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { TONE_PAIRS } from '@/lib/binder-tones';
import { Colors, FontFamily, Radius, Spacing } from '@/constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  current: [string, string];
  onPick: (tone: [string, string]) => void;
}

export function BinderColorSheet({ visible, onClose, current, onPick }: Props) {
  function pick(tone: [string, string]) {
    onPick(tone);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <Text style={styles.eyebrow}>BINDER COLOR</Text>
        <Text style={styles.title}>Pick a cover color</Text>

        <View style={styles.grid}>
          {TONE_PAIRS.map(tone => {
            const on = tone[0] === current[0] && tone[1] === current[1];
            return (
              <TouchableOpacity
                key={`${tone[0]}-${tone[1]}`}
                activeOpacity={0.85}
                onPress={() => pick(tone)}
                style={[styles.swatchWrap, on && styles.swatchWrapOn]}
                accessibilityRole="button"
                accessibilityLabel={`Binder color ${tone[0]} to ${tone[1]}`}
              >
                <LinearGradient
                  colors={tone}
                  start={{ x: 0.15, y: 0 }}
                  end={{ x: 0.85, y: 1 }}
                  style={styles.swatch}
                >
                  {on && (
                    <View style={styles.check}>
                      <Icon name="check" size={14} color="#0A0A0C" />
                    </View>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            );
          })}
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
    paddingBottom: 32,
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
  title: { fontFamily: FontFamily.display, fontSize: 24, color: Colors.text, marginBottom: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  swatchWrap: {
    borderRadius: Radius.md + 4,
    padding: 3,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchWrapOn: { borderColor: Colors.gold },
  swatch: {
    width: 88,
    height: 64,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center',
  },
});
