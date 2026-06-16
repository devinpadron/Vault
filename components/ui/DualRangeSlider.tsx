// Dual-thumb horizontal range slider with a log-scaled position → value
// mapping (so cards under $10 occupy meaningful slider real-estate even when
// the cap is $10k). Built on react-native's PanResponder so it adds no
// dependency.
//
// Positions are computed in *pixels* against the actual drag distance —
// avoids subpixel drift between percent-based thumbs and percent-based
// track that caused the right thumb to look off-center from the active
// bar at the extremes.
//
// Labels are rendered inside the component from the same refs the
// gesture mutates, so they update *during* the drag rather than waiting
// for the parent's onChange to fire on release.

import { useEffect, useReducer, useRef, useState } from 'react';
import {
  LayoutChangeEvent, PanResponder, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { Colors, FontFamily } from '@/constants/theme';

interface Props {
  min:    number;
  max:    number;
  values: [number, number];
  onChange: (vals: [number, number]) => void;
  // Snap a continuous value to a "round" tick (e.g. $87 → $85). The slider
  // emits snapped values and the parent stores them as-is. Snapping is also
  // applied to the rendered labels so they match what the parent will see.
  snap?:        (v: number) => number;
  formatLabel?: (v: number, maxIsUnlimited: boolean) => string;
}

const THUMB_SIZE = 26;
const TRACK_H    = 4;
const HIT_SLOP   = 14;

export function DualRangeSlider({
  min, max, values, onChange, snap, formatLabel,
}: Props) {
  const [, force]                  = useReducer(x => x + 1, 0);
  const [containerWidth, setWidth] = useState(0);
  const dragDistance               = Math.max(0, containerWidth - THUMB_SIZE);

  const onChangeRef        = useRef(onChange);
  onChangeRef.current      = onChange;
  const dragDistanceRef    = useRef(0);
  dragDistanceRef.current  = dragDistance;
  const minPosRef          = useRef(valueToPos(values[0], min, max));
  const maxPosRef          = useRef(valueToPos(values[1], min, max));

  // Sync external value updates (e.g. parent Reset) into the refs.
  useEffect(() => {
    minPosRef.current = valueToPos(values[0], min, max);
    maxPosRef.current = valueToPos(values[1], min, max);
    force();
  }, [values, min, max]);

  const startMinRef = useRef(0);
  const startMaxRef = useRef(0);

  // Inline numeric-input editing for either label. Tapping a label flips
  // into edit mode; blur or submit commits.
  const [editing,  setEditing]  = useState<null | 'min' | 'max'>(null);
  const [editText, setEditText] = useState('');

  const emit = () => {
    let lo = posToValue(minPosRef.current, min, max);
    let hi = posToValue(maxPosRef.current, min, max);
    if (snap) { lo = snap(lo); hi = snap(hi); }
    onChangeRef.current([lo, hi]);
  };

  function startEditing(which: 'min' | 'max', currentVal: number) {
    setEditText(String(Math.round(currentVal)));
    setEditing(which);
  }

  function commitEdit() {
    if (editing === null) return;
    const parsed = parseFloat(editText.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(parsed) && parsed >= 0) {
      const wanted = snap ? snap(clamp(parsed, min, max)) : clamp(parsed, min, max);

      if (editing === 'min') {
        // Clamp so the min thumb never crosses the max thumb.
        const maxCurrent = posToValue(maxPosRef.current, min, max);
        const final = Math.min(wanted, maxCurrent);
        minPosRef.current = valueToPos(final, min, max);
      } else {
        const minCurrent = posToValue(minPosRef.current, min, max);
        const final = Math.max(wanted, minCurrent);
        maxPosRef.current = valueToPos(final, min, max);
      }
      force();
      emit();
    }
    setEditing(null);
    setEditText('');
  }

  const minPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: () => { startMinRef.current = minPosRef.current; },
    onPanResponderMove: (_, g) => {
      if (!dragDistanceRef.current) return;
      minPosRef.current = clamp(
        startMinRef.current + g.dx / dragDistanceRef.current,
        0,
        maxPosRef.current,
      );
      force();
    },
    onPanResponderRelease:   emit,
    onPanResponderTerminate: emit,
  })).current;

  const maxPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: () => { startMaxRef.current = maxPosRef.current; },
    onPanResponderMove: (_, g) => {
      if (!dragDistanceRef.current) return;
      maxPosRef.current = clamp(
        startMaxRef.current + g.dx / dragDistanceRef.current,
        minPosRef.current,
        1,
      );
      force();
    },
    onPanResponderRelease:   emit,
    onPanResponderTerminate: emit,
  })).current;

  // Pixel positions — single source of truth for layout. Thumb `left` is the
  // thumb's outer-left edge; the active track starts at the thumb's CENTER
  // (which is THUMB_SIZE/2 inside the thumb's left edge).
  const minPx = minPosRef.current * dragDistance;
  const maxPx = maxPosRef.current * dragDistance;
  const activeWidth = Math.max(0, maxPx - minPx);

  // Snapped values for labels — match what the parent will store on release.
  let minVal = posToValue(minPosRef.current, min, max);
  let maxVal = posToValue(maxPosRef.current, min, max);
  if (snap) { minVal = snap(minVal); maxVal = snap(maxVal); }
  const maxIsUnlimited = maxVal >= max;

  return (
    <View>
      {formatLabel && (
        <View style={styles.labelRow}>
          <EditableLabel
            value={formatLabel(minVal, false)}
            editing={editing === 'min'}
            editText={editText}
            onTap={() => startEditing('min', minVal)}
            onChangeText={setEditText}
            onCommit={commitEdit}
            align="left"
          />
          <EditableLabel
            value={formatLabel(maxVal, maxIsUnlimited)}
            editing={editing === 'max'}
            editText={editText}
            onTap={() => startEditing('max', maxIsUnlimited ? max : maxVal)}
            onChangeText={setEditText}
            onCommit={commitEdit}
            align="right"
          />
        </View>
      )}
      <View
        style={styles.container}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      >
        <View style={styles.baseTrack} />
        <View
          style={[
            styles.activeTrack,
            { left: minPx + THUMB_SIZE / 2, width: activeWidth },
          ]}
        />
        <View
          {...minPan.panHandlers}
          hitSlop={{ top: HIT_SLOP, bottom: HIT_SLOP, left: HIT_SLOP, right: HIT_SLOP }}
          style={[styles.thumb, { left: minPx }]}
        />
        <View
          {...maxPan.panHandlers}
          hitSlop={{ top: HIT_SLOP, bottom: HIT_SLOP, left: HIT_SLOP, right: HIT_SLOP }}
          style={[styles.thumb, { left: maxPx }]}
        />
      </View>
    </View>
  );
}

// ─── Editable label ──────────────────────────────────────────────────────────
// Renders a tappable yellow value. While editing, a numeric TextInput takes
// its place and commits on blur or submit. The dollar sign stays as a static
// prefix so the input only ever carries digits.

function EditableLabel({
  value, editing, editText, onTap, onChangeText, onCommit, align,
}: {
  value:      string;
  editing:    boolean;
  editText:   string;
  onTap:      () => void;
  onChangeText: (t: string) => void;
  onCommit:   () => void;
  align:      'left' | 'right';
}) {
  if (editing) {
    return (
      <View style={[styles.labelEditRow, align === 'right' && styles.labelEditRowRight]}>
        <Text style={styles.label}>$</Text>
        <TextInput
          style={styles.labelInput}
          value={editText}
          onChangeText={t => onChangeText(t.replace(/[^0-9]/g, ''))}
          onBlur={onCommit}
          onSubmitEditing={onCommit}
          keyboardType="number-pad"
          returnKeyType="done"
          autoFocus
          selectTextOnFocus
          maxLength={6}
        />
      </View>
    );
  }
  return (
    <TouchableOpacity
      onPress={onTap}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${value}`}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      <Text style={styles.label}>{value}</Text>
    </TouchableOpacity>
  );
}

// ─── Math ────────────────────────────────────────────────────────────────────
// log(1+v) mapping: gives "fine control near zero, fast at the high end" feel.

function posToValue(pos: number, min: number, max: number): number {
  const a = Math.log1p(min);
  const b = Math.log1p(max);
  return Math.expm1(a + (b - a) * pos);
}

function valueToPos(value: number, min: number, max: number): number {
  if (max === min) return 0;
  const a = Math.log1p(min);
  const b = Math.log1p(max);
  return clamp((Math.log1p(value) - a) / (b - a), 0, 1);
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  label: {
    fontFamily: FontFamily.mono,
    fontSize: 13,
    color: Colors.gold,
  },
  labelEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Mirror the input contents to the right edge when editing the max label
  // so the dollar sign and digits stay anchored under the cursor.
  labelEditRowRight: { },
  labelInput: {
    fontFamily: FontFamily.mono,
    fontSize: 13,
    color: Colors.gold,
    padding: 0,
    minWidth: 50,
    // Subtle underline cues that the user is typing.
    borderBottomWidth: 1,
    borderBottomColor: Colors.gold,
  },
  container: {
    height: THUMB_SIZE,
    justifyContent: 'center',
  },
  // Base track sits inside the drag area — inset by half a thumb on each
  // side so the gold track's endpoints can sit directly under a thumb center
  // at the extremes.
  baseTrack: {
    position: 'absolute',
    left:   THUMB_SIZE / 2,
    right:  THUMB_SIZE / 2,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    top: '50%',
    marginTop: -TRACK_H / 2,
  },
  activeTrack: {
    position: 'absolute',
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    backgroundColor: Colors.gold,
    top: '50%',
    marginTop: -TRACK_H / 2,
  },
  thumb: {
    position: 'absolute',
    width:  THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: Colors.text,
    borderWidth: 2,
    borderColor: Colors.gold,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
