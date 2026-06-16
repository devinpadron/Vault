import { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, LayoutChangeEvent } from 'react-native';
import Svg, { Polygon, Polyline, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { Colors, FontFamily } from '@/constants/theme';
import { fmt } from '@/lib/format';

export const RANGES = ['7D', '30D', '90D', '1Y', 'ALL'] as const;
export type Range = typeof RANGES[number];

const CHART_H = 110;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 'YYYY-MM-DD' → 'Jun 3, 2026'. String-split avoids timezone drift from Date parsing.
function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  const mi = parseInt(m, 10) - 1;
  if (Number.isNaN(mi) || !MONTHS[mi]) return iso;
  return `${MONTHS[mi]} ${parseInt(d, 10)}, ${y}`;
}

interface Props {
  data: number[];
  dates?: string[];
  range: Range;
  onRangeChange: (r: Range) => void;
}

export function PriceChart({ data, dates, range, onRangeChange }: Props) {
  const hasData = data.length >= 2;
  const [width, setWidth] = useState(0);
  // Index currently under the user's finger; null when not scrubbing.
  const [active, setActive] = useState<number | null>(null);

  const max = hasData ? Math.max(...data) : 0;
  const min = hasData ? Math.min(...data) : 0;
  const rangeVal = max - min || 1;

  // Normalized (0–100) points, matching the SVG viewBox.
  const pts = hasData
    ? data.map((v, i) => ({
        x: (i / (data.length - 1)) * 100,
        y: 100 - ((v - min) / rangeVal) * 90 - 5,
      }))
    : [];

  const ptsStr = pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const polygonPoints = `${ptsStr} 100,100 0,100`;
  const lastPt = pts[pts.length - 1];

  function onLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  // Map a finger x (px) to the nearest data index. Runs on JS via runOnJS.
  function updateActive(x: number) {
    if (!hasData || width <= 0) return;
    const ratio = Math.max(0, Math.min(1, x / width));
    const idx = Math.round(ratio * (data.length - 1));
    setActive(prev => (prev === idx ? prev : idx));
  }

  const pan = Gesture.Pan()
    .activateAfterLongPress(120)
    .onBegin(e => runOnJS(updateActive)(e.x))
    .onUpdate(e => runOnJS(updateActive)(e.x))
    .onFinalize(() => runOnJS(setActive)(null));

  // Active point geometry, in px relative to the chart box.
  const activePt = active != null ? pts[active] : null;
  const activeX = activePt && width ? (activePt.x / 100) * width : 0;
  const activeY = activePt ? (activePt.y / 100) * CHART_H : 0;
  // Keep the tooltip on-screen by clamping its left edge.
  const TOOLTIP_W = 116;
  const tooltipLeft = Math.max(0, Math.min(width - TOOLTIP_W, activeX - TOOLTIP_W / 2));

  return (
    <View>
      {hasData ? (
        <GestureDetector gesture={pan}>
          <View style={styles.chartBox} onLayout={onLayout}>
            <Svg width="100%" height={CHART_H} viewBox="0 0 100 100" preserveAspectRatio="none">
              <Defs>
                <LinearGradient id="chartg" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={Colors.gold} stopOpacity={0.4} />
                  <Stop offset="1" stopColor={Colors.gold} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Polygon points={polygonPoints} fill="url(#chartg)" />
              <Polyline points={ptsStr} fill="none" stroke={Colors.gold} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
              <Circle cx={lastPt.x.toFixed(2)} cy={lastPt.y.toFixed(2)} r="1.5" fill={Colors.gold} />
            </Svg>

            {/* Scrub crosshair + tooltip */}
            {activePt && (
              <>
                <View pointerEvents="none" style={[styles.crosshair, { left: activeX }]} />
                <View
                  pointerEvents="none"
                  style={[styles.scrubDot, { left: activeX - 4, top: activeY - 4 }]}
                />
                <View pointerEvents="none" style={[styles.tooltip, { left: tooltipLeft, width: TOOLTIP_W }]}>
                  <Text style={styles.tooltipPrice}>${fmt(data[active!])}</Text>
                  {dates?.[active!] ? (
                    <Text style={styles.tooltipDate}>{formatDate(dates[active!])}</Text>
                  ) : null}
                </View>
              </>
            )}
          </View>
        </GestureDetector>
      ) : (
        <View style={styles.noData}>
          <Text style={styles.noDataText}>No price data available</Text>
        </View>
      )}
      <View style={styles.rangePicker}>
        {RANGES.map(r => (
          <TouchableOpacity
            key={r}
            style={[styles.rangeBtn, r === range && styles.rangeBtnActive]}
            onPress={() => onRangeChange(r)}
          >
            <Text style={[styles.rangeText, r === range && styles.rangeTextActive]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chartBox: {
    height: CHART_H,
    position: 'relative',
  },
  crosshair: {
    position: 'absolute',
    top: 0,
    width: 1,
    height: CHART_H,
    marginLeft: -0.5,
    backgroundColor: Colors.goldBorder,
  },
  scrubDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.gold,
    borderWidth: 1.5,
    borderColor: Colors.bg,
  },
  tooltip: {
    position: 'absolute',
    top: -6,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.elevated,
    alignItems: 'center',
  },
  tooltipPrice: {
    fontFamily: FontFamily.monoMed,
    fontSize: 13,
    color: Colors.text,
  },
  tooltipDate: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 0.5,
    color: Colors.text3,
    marginTop: 1,
  },
  noData: {
    height: CHART_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noDataText: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    color: Colors.text3,
    letterSpacing: 0.5,
  },
  rangePicker: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
  },
  rangeBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 6,
    backgroundColor: 'transparent',
  },
  rangeBtnActive: {
    backgroundColor: Colors.goldTint,
  },
  rangeText: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: Colors.text3,
  },
  rangeTextActive: {
    color: Colors.gold,
  },
});
