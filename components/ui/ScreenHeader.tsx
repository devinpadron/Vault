import { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { haptic } from '@/lib/haptics';
import { Colors, FontFamily, NavButtonStyle, PressOpacity, Spacing } from '@/constants/theme';

interface Props {
  title: string;
  /** Replaces the default back chevron action. */
  onBack?: () => void;
  /** Optional element rendered in the right slot (defaults to a spacer so the title stays centered). */
  right?: ReactNode;
  /** Set false when the screen handles its own top inset. */
  topInset?: boolean;
}

/**
 * The standard modal-screen nav bar: ghost back button, centered serif title,
 * optional right action. Replaces the per-screen copies of this layout.
 */
export function ScreenHeader({ title, onBack, right, topInset = true }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, topInset && { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity
        style={styles.btn}
        activeOpacity={PressOpacity}
        onPress={() => {
          haptic('select');
          if (onBack) onBack();
          else router.back();
        }}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Icon name="chevron-left" size={18} color={Colors.text} />
      </TouchableOpacity>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      {right ?? <View style={styles.btn} />}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: 12,
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 22,
    color: Colors.text,
    flex: 1,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  btn: NavButtonStyle,
});
