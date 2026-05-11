import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Colors, Spacing } from '@/constants/theme';

interface Props {
  count?: number;
}

function SkeletonLine({ width, height = 12, delay = 0 }: { width: number | string; height?: number; delay?: number }) {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    const t = setTimeout(() => {
      shimmer.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 900 }),
          withTiming(0, { duration: 900 }),
        ),
        -1,
        false,
      );
    }, delay);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: 0.4 + shimmer.value * 0.3,
  }));

  return (
    <Animated.View
      style={[styles.line, { width: width as number, height, borderRadius: height / 2 }, style]}
    />
  );
}

export function SkeletonRow({ count = 3 }: Props) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.row}>
          <View style={styles.avatar} />
          <View style={styles.meta}>
            <SkeletonLine width="60%" height={13} delay={i * 60} />
            <SkeletonLine width="40%" height={10} delay={i * 60 + 80} />
          </View>
          <SkeletonLine width={48} height={13} delay={i * 60 + 40} />
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: Spacing.xl,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
  },
  meta: {
    flex: 1,
    gap: 8,
  },
  line: {
    backgroundColor: Colors.line,
  },
});
