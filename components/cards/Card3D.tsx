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

  // Race: whichever activates first wins — quick lift = tap, drag = pan tilt
  const gesture = onPress ? Gesture.Race(tap, pan) : pan;

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 900 },
      { rotateX: `${rotateX.value}deg` },
      { rotateY: `${rotateY.value}deg` },
      { scale: scale.value },
    ],
  }));

  // Foil shimmer: rainbow gradient that slides across the card surface with tilt.
  // The gradient layer is 160% of card size so it stays within bounds after translation.
  const shimmerStyle = useAnimatedStyle(() => {
    const ry = rotateY.value / MAX_TILT;  // −1 → +1
    const rx = rotateX.value / MAX_TILT;  // −1 → +1
    const tiltMag = (Math.abs(rotateX.value) + Math.abs(rotateY.value)) / (MAX_TILT * 2);
    return {
      opacity: Math.min(tiltMag * 1.4, 1),
      transform: [
        { translateX: ry * width * 0.3 },
        { translateY: -rx * height * 0.3 },
      ],
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ width, height }, cardStyle]}>
        <CardThumb card={card} width={width} />

        {/* Foil shimmer: clipped window + oversized gradient that slides with tilt */}
        {card.foil && (
          <View style={[StyleSheet.absoluteFill, styles.shimmerClip, { borderRadius: 8 }]}>
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  width: width * 1.6,
                  height: height * 1.6,
                  left: -(width * 0.3),
                  top: -(height * 0.3),
                },
                shimmerStyle,
              ]}
            >
              <LinearGradient
                colors={[
                  'rgba(255,215,0,0.22)',
                  'rgba(122,107,255,0.26)',
                  'rgba(95,210,255,0.2)',
                  'rgba(255,91,182,0.18)',
                  'rgba(255,215,0,0.12)',
                ]}
                locations={[0, 0.25, 0.5, 0.75, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ width: '100%', height: '100%' }}
              />
            </Animated.View>
          </View>
        )}

        {large && <View style={[styles.shadow, { width, bottom: -12 }]} />}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  shimmerClip: {
    overflow: 'hidden',
  },
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
