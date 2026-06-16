import { ReactNode, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { Colors, FontFamily, Radius } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

interface Props {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

// Collapsible disclosure box used for secondary card-detail data (pop reports,
// sales volume). Header is always visible; body mounts only while open.
export function Expandable({ title, subtitle, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const rot = useSharedValue(defaultOpen ? 1 : 0);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rot.value * 90}deg` }],
  }));

  function toggle() {
    haptic('select');
    const next = !open;
    setOpen(next);
    rot.value = withTiming(next ? 1 : 0, { duration: 180 });
  }

  return (
    <View style={styles.box}>
      <TouchableOpacity
        style={styles.header}
        onPress={toggle}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
      >
        <Text style={styles.title}>{title}</Text>
        <View style={styles.headerRight}>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <Animated.View style={chevronStyle}>
            <Icon name="chevron-right" size={14} color={Colors.text3} />
          </Animated.View>
        </View>
      </TouchableOpacity>
      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.glass,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  title: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: Colors.text2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subtitle: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 0.5,
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 2,
  },
});
