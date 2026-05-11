import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Colors } from '@/constants/theme';

interface Props {
  width: number;
  ratio?: number;
}

export function SkeletonCard({ width, ratio = 1.4 }: Props) {
  const height = width * ratio;
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900 }),
        withTiming(0, { duration: 900 }),
      ),
      -1,
      false,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + shimmer.value * 0.3,
  }));

  return (
    <View style={[styles.container, { width, height, borderRadius: 8 }]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.fill, shimmerStyle]} />
    </View>
  );
}

export function SkeletonCardCell({ width }: { width: number }) {
  return (
    <View style={styles.cell}>
      <SkeletonCard width={width} />
      <View style={[styles.line, { width: width * 0.7, marginTop: 8 }]} />
      <View style={[styles.line, { width: width * 0.4, marginTop: 6, height: 10 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  fill: {
    backgroundColor: Colors.line,
    borderRadius: 8,
  },
  cell: {
    flex: 1,
    gap: 0,
  },
  line: {
    height: 12,
    borderRadius: 4,
    backgroundColor: Colors.line,
  },
});
