import { StyleSheet, View, Text } from 'react-native';
import { Colors, FontFamily } from '@/constants/theme';

export interface Bar {
  label: string;
  value: number;
}

interface Props {
  bars: Bar[];
  // Optional override for the longest-bar baseline (defaults to max value).
  maxValue?: number;
  // Format the trailing value (defaults to localized integer).
  formatValue?: (v: number) => string;
}

// Horizontal bar list — shared by the graded sales-volume and population charts.
export function BarList({ bars, maxValue, formatValue }: Props) {
  const max = Math.max(maxValue ?? 0, ...bars.map(b => b.value), 1);
  const fmtVal = formatValue ?? ((v: number) => v.toLocaleString());

  return (
    <View style={styles.list}>
      {bars.map(b => (
        <View key={b.label} style={styles.row}>
          <Text style={styles.label} numberOfLines={1}>{b.label}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${(b.value / max) * 100}%` }]} />
          </View>
          <Text style={styles.value}>{fmtVal(b.value)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    width: 72,
    fontFamily: FontFamily.monoMed,
    fontSize: 11,
    color: Colors.text2,
  },
  track: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.glass,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: Colors.gold,
  },
  value: {
    width: 52,
    textAlign: 'right',
    fontFamily: FontFamily.mono,
    fontSize: 11,
    color: Colors.text,
  },
});
