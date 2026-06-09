// Inline public/private toggle. Used on the Collection tab, Wishlist screen,
// and Binder detail screen. Subtle gold accent when public so the user can
// glance at the header and know what their friends can see.

import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Icon } from './Icon';
import { Colors, FontFamily, Radius } from '@/constants/theme';

interface Props {
  isPublic: boolean;
  onToggle: () => void;
  /** "this collection", "this wishlist", "this binder" — for accessibility labels. */
  surfaceLabel: string;
  /** When `compact`, hides the text label and shows just the icon (e.g. dense headers). */
  compact?: boolean;
}

export function VisibilityChip({ isPublic, onToggle, surfaceLabel, compact }: Props) {
  const label = isPublic ? 'PUBLIC' : 'PRIVATE';
  return (
    <TouchableOpacity
      onPress={onToggle}
      style={[
        styles.chip,
        compact && styles.chipCompact,
        isPublic && styles.chipActive,
      ]}
      accessibilityRole="switch"
      accessibilityState={{ checked: isPublic }}
      accessibilityLabel={`${isPublic ? 'Make private' : 'Make public'}: ${surfaceLabel}`}
    >
      <Icon
        name={isPublic ? 'eye' : 'eye-off'}
        size={compact ? 18 : 14}
        color={isPublic ? Colors.gold : Colors.text}
      />
      {!compact && (
        <Text style={[styles.label, isPublic && styles.labelActive]}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  chipCompact: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  chipActive: {
    borderColor: 'rgba(255,215,0,0.4)',
    backgroundColor: 'rgba(255,215,0,0.08)',
  },
  label: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    color: Colors.text2,
  },
  labelActive: {
    color: Colors.gold,
  },
});
