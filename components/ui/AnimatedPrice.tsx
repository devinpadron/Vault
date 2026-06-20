// A price label that animates when its value changes, so a background pricing
// refresh reads as a deliberate update instead of a hard snap. Two coordinated
// cues: an optional count-up roll (old → new) and a brief directional color
// flash (green up / red down) that eases back to the label's base color.
//
// `countUp` is on for single "hero" numbers (a card's market price, the
// portfolio total) and off for dense grids, where a roll on every tile at once
// is busier than the snap it replaces — there the flash alone signals the change.

import { ReactNode, useEffect, useRef, useState } from 'react';
import { StyleProp, TextStyle, ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Colors } from '@/constants/theme';
import { fmt } from '@/lib/format';

interface AnimatedPriceProps {
  value: number;
  /** Format the (possibly mid-tween) number into display text. Defaults to fmt. */
  format?: (n: number) => string;
  style?: StyleProp<TextStyle>;
  /** Color the flash settles back to — match the surrounding text's color. */
  baseColor?: string;
  /** Roll the number old→new. Leave off for dense grids (flash only). */
  countUp?: boolean;
  countUpDurationMs?: number;
  flashDurationMs?: number;
}

const DEFAULT_COUNT_MS = 600;
const DEFAULT_FLASH_MS = 900;

// Count from the currently displayed value to `target` on an easeOutCubic curve.
// Drives React state per frame — fine for the handful of price labels on screen,
// and necessary because text content can't be driven by a shared value directly.
// Starting from the live displayed value makes rapid changes interrupt smoothly.
function useCountUp(target: number, enabled: boolean, duration: number): number {
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);
  displayRef.current = display;
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) { setDisplay(target); return; }
    const from = displayRef.current;
    if (Math.abs(from - target) < 0.005) { setDisplay(target); return; }
    const start = Date.now();
    const animate = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (target - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, enabled, duration]);

  return display;
}

export function AnimatedPrice({
  value,
  format = fmt,
  style,
  baseColor = Colors.text,
  countUp = true,
  countUpDurationMs = DEFAULT_COUNT_MS,
  flashDurationMs = DEFAULT_FLASH_MS,
}: AnimatedPriceProps) {
  const display = useCountUp(value, countUp, countUpDurationMs);

  // Directional flash: snaps to 1 on a change, then eases back to 0.
  const flash = useSharedValue(0);
  const rising = useSharedValue(1);
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current !== value) {
      rising.value = value >= prev.current ? 1 : 0;
      flash.value = 1;
      flash.value = withTiming(0, { duration: flashDurationMs });
      prev.current = value;
    }
  }, [value, flashDurationMs, flash, rising]);

  const animatedStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      flash.value,
      [0, 1],
      [baseColor, rising.value === 1 ? Colors.up : Colors.down],
    ),
  }));

  return <Animated.Text style={[style, animatedStyle]}>{format(display)}</Animated.Text>;
}

// Plays a brief directionless scale pop whenever `value` changes. For elements
// whose steady-state color already encodes meaning — e.g. a signed % change that's
// green/red by sign — where AnimatedPrice's directional color flash would clash.
// Wraps arbitrary content (icon + text) so the whole unit pulses together.
export function FlashOnChange({
  value,
  children,
  style,
  flashDurationMs = DEFAULT_FLASH_MS,
}: {
  value: number | string | null | undefined;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  flashDurationMs?: number;
}) {
  const flash = useSharedValue(0);
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current !== value) {
      flash.value = 1;
      flash.value = withTiming(0, { duration: flashDurationMs });
      prev.current = value;
    }
  }, [value, flashDurationMs, flash]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.16 * flash.value }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
