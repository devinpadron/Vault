import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import Svg, { Polygon, Polyline, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Colors, FontFamily } from '@/constants/theme';

export const RANGES = ['7D', '30D', '90D', '1Y', 'ALL'] as const;
export type Range = typeof RANGES[number];

interface Props {
  data: number[];
  range: Range;
  onRangeChange: (r: Range) => void;
}

export function PriceChart({ data, range, onRangeChange }: Props) {
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

  return (
    <View>
      {hasData ? (
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
