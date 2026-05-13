import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import Svg, { Polygon, Polyline, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Colors, FontFamily } from '@/constants/theme';

const RANGES = ['1W', '1M', '6M', '1Y', 'ALL'] as const;
type Range = typeof RANGES[number];

export interface MinMaxData {
  low: number | null;
  high: number | null;
  label: string;
  currentPrice: number | null;
}

interface Props {
  data: number[];
  range: Range;
  onRangeChange: (r: Range) => void;
  minMax?: MinMaxData | null;
}

function fmt(n: number) {
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n.toFixed(2);
}

function RangeBar({ low, high, current }: { low: number; high: number; current: number }) {
  const span = high - low;
  if (span <= 0) return null;
  const filledFlex = Math.max(0.01, Math.min(0.99, (current - low) / span));
  const emptyFlex = 1 - filledFlex;
  return (
    <View style={styles.rangeBarTrack}>
      <View style={[styles.rangeBarFill, { flex: filledFlex }]} />
      <View style={{ flex: emptyFlex }} />
      {/* dot at current position */}
      <View style={[styles.rangeBarDot, { left: `${(filledFlex * 100).toFixed(1)}%` as unknown as number }]} />
    </View>
  );
}

export function PriceChart({ data, range, onRangeChange, minMax }: Props) {
  const hasData = data.length >= 2;
  const max = hasData ? Math.max(...data) : 0;
  const min = hasData ? Math.min(...data) : 0;
  const rangeVal = max - min || 1;

  const pts = hasData
    ? data.map((v, i) => ({
        x: (i / (data.length - 1)) * 100,
        y: 100 - ((v - min) / rangeVal) * 90 - 5,
      }))
    : [];

  const ptsStr = pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const polygonPoints = `${ptsStr} 100,100 0,100`;
  const lastPt = pts[pts.length - 1];

  function renderChartArea() {
    if (hasData) {
      return (
        <Svg width="100%" height={110} viewBox="0 0 100 100" preserveAspectRatio="none">
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
      );
    }

    if (minMax && (minMax.low != null || minMax.high != null)) {
      const { low, high, label, currentPrice } = minMax;
      return (
        <View style={styles.minMaxContainer}>
          <Text style={styles.minMaxHeading}>{label} PRICE RANGE</Text>
          <View style={styles.minMaxRow}>
            <View>
              <Text style={styles.minMaxCaption}>LOW</Text>
              <Text style={styles.minMaxValue}>
                {low != null ? `$${fmt(low)}` : '—'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.minMaxCaption}>HIGH</Text>
              <Text style={styles.minMaxValue}>
                {high != null ? `$${fmt(high)}` : '—'}
              </Text>
            </View>
          </View>
          {low != null && high != null && currentPrice != null && (
            <RangeBar low={low} high={high} current={currentPrice} />
          )}
        </View>
      );
    }

    return (
      <View style={styles.noData}>
        <Text style={styles.noDataText}>No price data available</Text>
      </View>
    );
  }

  return (
    <View>
      {renderChartArea()}
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
  noData: {
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noDataText: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    color: Colors.text3,
    letterSpacing: 0.5,
  },
  minMaxContainer: {
    height: 110,
    justifyContent: 'center',
    gap: 10,
  },
  minMaxHeading: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 1.6,
    color: Colors.text3,
    textTransform: 'uppercase',
  },
  minMaxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  minMaxCaption: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 1.2,
    color: Colors.text3,
    marginBottom: 3,
  },
  minMaxValue: {
    fontFamily: FontFamily.mono,
    fontSize: 18,
    color: Colors.text,
    letterSpacing: 0.5,
  },
  rangeBarTrack: {
    height: 3,
    flexDirection: 'row',
    backgroundColor: Colors.line,
    borderRadius: 2,
    overflow: 'visible',
    position: 'relative',
  },
  rangeBarFill: {
    height: '100%',
    backgroundColor: Colors.gold,
    borderRadius: 2,
  },
  rangeBarDot: {
    position: 'absolute',
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: Colors.gold,
    top: -3,
    marginLeft: -4,
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
    backgroundColor: 'rgba(255,215,0,0.12)',
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
