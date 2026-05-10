import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { CardThumb } from './CardThumb';
import { Card } from '@/types';

interface Props {
  card: Card;
  width: number;
  large?: boolean;
  onPress?: () => void;
}

const SPRING = { damping: 14, stiffness: 180 } as const;
const MAX_TILT = 14;

export function Card3D({ card, width, large = false, onPress }: Props) {
  const height = width * 1.4;
  const rotateX = useSharedValue(0);
  const rotateY = useSharedValue(0);
  const scale = useSharedValue(1);

  const pan = Gesture.Pan()
    .onBegin(() => {
      scale.value = withSpring(1.03, SPRING);
    })
    .onUpdate((e) => {
      rotateY.value = (e.translationX / width) * MAX_TILT;
      rotateX.value = -(e.translationY / height) * MAX_TILT;
    })
    // onFinalize runs whether the gesture ends normally OR gets cancelled by Race
    .onFinalize(() => {
      rotateX.value = withSpring(0, SPRING);
      rotateY.value = withSpring(0, SPRING);
      scale.value = withSpring(1, SPRING);
    });

  // .runOnJS(true) makes onEnd run on the JS thread, so router.push works directly
  const tap = Gesture.Tap()
    .maxDuration(250)
    .runOnJS(true)
    .onEnd((_e, success) => {
      if (success && onPress) onPress();
    });

  // Race: whichever activates first wins. Quick lift = tap navigates. Drag = pan tilts.
  const gesture = onPress ? Gesture.Race(tap, pan) : pan;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 900 },
      { rotateX: `${rotateX.value}deg` },
      { rotateY: `${rotateY.value}deg` },
      { scale: scale.value },
    ],
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: (Math.abs(rotateX.value) + Math.abs(rotateY.value)) / MAX_TILT,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ width, height }, animatedStyle]}>
        <CardThumb card={card} width={width} />

        {card.foil && (
          <Animated.View
            style={[StyleSheet.absoluteFill, shimmerStyle, { borderRadius: 8, overflow: 'hidden' }]}
          >
            <LinearGradient
              colors={[
                'rgba(255,215,0,0.15)',
                'rgba(122,107,255,0.18)',
                'rgba(95,210,255,0.12)',
                'rgba(255,91,182,0.1)',
              ]}
              locations={[0, 0.33, 0.66, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        )}

        {large && <View style={[styles.shadow, { width, bottom: -12 }]} />}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  shadow: {
    position: 'absolute',
    height: 20,
    alignSelf: 'center',
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
});
