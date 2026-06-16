import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { Colors, FontFamily, PressOpacity, Radius } from '@/constants/theme';

interface Props {
  icon: Parameters<typeof Icon>[0]['name'];
  title: string;
  caption?: string;
  /** Optional call-to-action button below the caption. */
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Standard empty state: dim icon in a ghost circle, serif title, body caption,
 * optional CTA. Use anywhere a list can be empty instead of a bare Text.
 */
export function EmptyState({ icon, title, caption, actionLabel, onAction }: Props) {
  return (
    <Animated.View entering={FadeInDown.duration(320)} style={styles.root}>
      <View style={styles.iconCircle}>
        <Icon name={icon} size={26} color={Colors.text3} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity
          style={styles.action}
          activeOpacity={PressOpacity}
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={styles.actionText}>{actionLabel.toUpperCase()}</Text>
        </TouchableOpacity>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    paddingVertical: 56,
    paddingHorizontal: 32,
    gap: 10,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.glass,
    marginBottom: 4,
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 22,
    color: Colors.text3,
    textAlign: 'center',
  },
  caption: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: Colors.text3,
    textAlign: 'center',
    lineHeight: 19,
  },
  action: {
    marginTop: 10,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.glass,
  },
  actionText: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: Colors.gold,
  },
});
