import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Colors, FontFamily, Radius } from '@/constants/theme';

interface Props {
  options: string[];
  value: string;
  onChange: (val: string) => void;
}

export function FilterPills({ options, value, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {options.map(opt => {
        const active = opt === value;
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => onChange(opt)}
            style={[styles.pill, active && styles.pillActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 22,
    paddingBottom: 4,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  pillActive: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  label: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: Colors.text,
  },
  labelActive: {
    color: '#0A0A0C',
    fontFamily: FontFamily.bodySemi,
  },
});
