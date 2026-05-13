import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue, withSpring, useDerivedValue, useFrameCallback } from 'react-native-reanimated';
import {
  Canvas,
  Group,
  RoundedRect,
  Image as SkiaImage,
  LinearGradient,
  vec,
  Skia,
  processTransform3d,
  type Matrix4,
  type Transforms3d,
  type SkImage,
} from '@shopify/react-native-skia';
import { Card } from '@/types';

interface Props {
  card: Card;
  width: number;
  large?: boolean;
  onPress?: () => void;
  sway?: boolean;
}

const SPRING = { damping: 14, stiffness: 180 } as const;
const MAX_TILT = 24;
// Extra canvas pixels on every side so the scaled/tilted card never clips.
const OVERFLOW = 24;

/** Fetches a remote image URL and decodes it into a Skia SkImage. */
function useNetworkImage(url?: string): SkImage | null {
  const [image, setImage] = useState<SkImage | null>(null);

  useEffect(() => {
    if (!url) return;
    let active = true;
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        if (!active) return;
        const data = Skia.Data.fromBytes(new Uint8Array(buf));
        const img = Skia.Image.MakeImageFromEncoded(data);
        if (img) setImage(img);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [url]);

  return image;
}

export function Card3D({ card, width, large = false, onPress, sway = false }: Props) {
  const height = width * 1.4;
  const cx = width / 2;
  const cy = height / 2;
  // Canvas is bigger than the card on all sides to absorb scale/tilt overflow.
  const canvasW = width + OVERFLOW * 2;
  const canvasH = height + OVERFLOW * 2;

  const rotateX = useSharedValue(0);
  const rotateY = useSharedValue(0);
  const scale = useSharedValue(1);

  // Idle sway — drives the frame callback; 1 = swaying, 0 = paused by gesture
  const swayOn = useSharedValue(sway ? 1 : 0);
  // Timestamp (ms) when the sway last resumed, used to ease amplitude in
  const swayT0 = useSharedValue(-1);

  // Mirror the HTML prototype's requestAnimationFrame loop, but on the UI thread
  // so there are zero JS re-renders and therefore no jitter.
  useFrameCallback((info) => {
    'worklet';
    if (!swayOn.value) return;
    if (swayT0.value < 0) swayT0.value = info.timestamp;
    const elapsed = (info.timestamp - swayT0.value) / 1000;
    const t = info.timestamp / 1000;
    // Ease amplitude from 0 → 1 over 1.2 s so the sway fades in after a gesture
    const amp = elapsed < 1.2 ? elapsed / 1.2 : 1.0;
    rotateY.value = Math.sin(t * 0.7) * 4 * amp;
    rotateX.value = Math.cos(t * 0.5) * 3 * amp;
  });

  const swayTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Captures the sway angles at the moment a gesture begins so onUpdate can
  // blend from them rather than jumping from the sway position to ~0 rotation.
  const swaySnapshotRX = useRef(0);
  const swaySnapshotRY = useRef(0);

  const enableSway = useCallback(() => {
    swayOn.value = 1;
    swayT0.value = -1;
  }, [swayOn, swayT0]);

  const cardImage = useNetworkImage(card.imageUrl);

  // Clip path used to confine the foil shimmer to the card's rounded bounds.
  const cardClip = useMemo(
    () => Skia.RRectXY(Skia.XYWHRect(0, 0, width, height), 8, 8),
    [width, height],
  );

  // Build a true 4×4 perspective matrix on the UI thread so there's no bridge
  // round-trip — Skia's processTransform3d is worklet-annotated and safe here.
  const matrix = useDerivedValue((): Matrix4 => {
    'worklet';
    const rx = rotateX.value * (Math.PI / 180);
    const ry = rotateY.value * (Math.PI / 180);
    const s = scale.value;
    return processTransform3d([
      // Shift card origin into the canvas (card is drawn at (0,0), canvas has OVERFLOW padding)
      { translateX: OVERFLOW },
      { translateY: OVERFLOW },
      // Pivot on card centre for scale / tilt
      { translateX: cx },
      { translateY: cy },
      { perspective: 900 },
      { rotateX: rx },
      { rotateY: ry },
      { scale: s },
      { translateX: -cx },
      { translateY: -cy },
    ] as Transforms3d);
  }, [rotateX, rotateY, scale]);

  // Foil shimmer offset — slides the oversized gradient layer with the tilt angle.
  const shimmerTransform = useDerivedValue((): Transforms3d => {
    'worklet';
    return [
      { translateX: (rotateY.value / MAX_TILT) * width * 0.3 },
      { translateY: (-rotateX.value / MAX_TILT) * height * 0.3 },
    ];
  }, [rotateX, rotateY]);

  const shimmerOpacity = useDerivedValue(
    () =>
      Math.min(
        ((Math.abs(rotateX.value) + Math.abs(rotateY.value)) / (MAX_TILT * 2)) * 1.4,
        1,
      ),
    [rotateX, rotateY],
  );

  const pan = Gesture.Pan()
    // Give the scroll list a head-start: if the finger moves more than 10px
    // vertically before crossing 6px horizontally, this gesture fails and the
    // parent FlatList scroll takes over.  Once horizontal intent is confirmed
    // the full 3D tilt (both axes) is unlocked.
    .activeOffsetX([-6, 6])
    .failOffsetY([-10, 10])
    // Alternative activation: holding still for 400 ms also unlocks 3D tilt
    // without needing horizontal movement first.
    .activateAfterLongPress(400)
    // Run callbacks on JS thread so Haptics can be called from onBegin.
    .runOnJS(true)
    .onBegin(() => {
      clearTimeout(swayTimer.current);
      // Snapshot the current sway angles before stopping the frame callback so
      // onUpdate can smoothly blend away from them.
      swaySnapshotRX.current = rotateX.value;
      swaySnapshotRY.current = rotateY.value;
      swayOn.value = 0;
      swayT0.value = -1;
      scale.value = withSpring(1.03, SPRING);
    })
    .onUpdate((e) => {
      const gestureRY = (e.translationX / width) * MAX_TILT;
      const gestureRX = -(e.translationY / height) * MAX_TILT;
      // Fade the sway offset to 0 over the first ~28 px of travel so the card
      // glides from its sway position into gesture control instead of snapping.
      const dist = Math.min(
        Math.sqrt(e.translationX * e.translationX + e.translationY * e.translationY) / 28,
        1,
      );
      rotateY.value = gestureRY + swaySnapshotRY.current * (1 - dist);
      rotateX.value = gestureRX + swaySnapshotRX.current * (1 - dist);
    })
    // onFinalize runs whether the gesture ends normally OR gets cancelled by Race
    .onFinalize(() => {
      rotateX.value = withSpring(0, SPRING);
      rotateY.value = withSpring(0, SPRING);
      scale.value = withSpring(1, SPRING);
      // Re-enable sway after the springs have mostly settled (~500 ms)
      if (sway) swayTimer.current = setTimeout(enableSway, 500);
    });

  // .runOnJS(true) // makes onEnd run on the JS thread so router.push works directly
  const tap = Gesture.Tap()
    .maxDuration(250)
    .runOnJS(true)
    .onEnd((_e, success) => {
      if (success && onPress) onPress();
    });

  // Race: whichever activates first wins — quick lift = tap, drag = pan tilt
  const gesture = onPress ? Gesture.Race(tap, pan) : pan;

  return (
    <GestureDetector gesture={gesture}>
      {/* Outer View owns the layout footprint; canvas bleeds into OVERFLOW padding. */}
      <View style={{ width, height }}>
        <Canvas
          style={{
            position: 'absolute',
            left: -OVERFLOW,
            top: -OVERFLOW,
            width: canvasW,
            height: canvasH,
          }}
        >
          {/*
           * All card layers are children of this Group. A single Matrix4 (with
           * perspective, rotateX, rotateY, scale pivoted on the card centre)
           * drives the pseudo-3D tilt — no RN View transforms involved.
           */}
          <Group matrix={matrix}>
            {/* Base glass-slab gradient — frosted dark panel used as placeholder */}
            <RoundedRect x={0} y={0} width={width} height={height} r={8}>
              <LinearGradient
                start={vec(width * 0.2, 0)}
                end={vec(width * 0.8, height)}
                colors={['#1e2235', '#252b40', '#1a1f30']}
                positions={[0, 0.5, 1]}
              />
            </RoundedRect>

            {/* Gloss highlight layer */}
            <RoundedRect x={0} y={0} width={width} height={height} r={8}>
              <LinearGradient
                start={vec(width * 0.15, 0)}
                end={vec(width * 0.85, height * 0.6)}
                colors={[
                  'rgba(255,255,255,0.22)',
                  'rgba(255,255,255,0.04)',
                  'rgba(255,255,255,0)',
                ]}
                positions={[0, 0.35, 1]}
              />
            </RoundedRect>

            {/* Specular highlight — placeholder gloss; buried under real image once loaded */}
            <RoundedRect x={0} y={0} width={width} height={height} r={8}>
              <LinearGradient
                start={vec(0, 0)}
                end={vec(width * 0.6, height * 0.6)}
                colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0)']}
              />
            </RoundedRect>

            {/* Real card image — covers all placeholder layers once decoded */}
            {cardImage && (
              <Group clip={cardClip}>
                <SkiaImage
                  image={cardImage}
                  x={0}
                  y={0}
                  width={width}
                  height={height}
                  fit="cover"
                />
              </Group>
            )}

            {/* Card border */}
            <RoundedRect
              x={0}
              y={0}
              width={width}
              height={height}
              r={8}
              style="stroke"
              strokeWidth={1}
              color="rgba(255,255,255,0.12)"
            />
          </Group>
        </Canvas>

        {large && (
          <View
            style={{
              position: 'absolute',
              bottom: -12,
              alignSelf: 'center',
              width,
              height: 20,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.5,
              shadowRadius: 20,
              elevation: 10,
            }}
          />
        )}
      </View>
    </GestureDetector>
  );
}
