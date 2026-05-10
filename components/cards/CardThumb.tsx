import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Card } from '@/types';

interface Props {
  card: Card;
  width: number;
  ratio?: number;
}

export function CardThumb({ card, width, ratio = 1.4 }: Props) {
  const height = width * ratio;

  return (
    <View style={[styles.container, { width, height, borderRadius: 8 }]}>
      <LinearGradient
        colors={card.art}
        locations={[0, 0.45, 0.85]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Gloss highlight */}
      <LinearGradient
        colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.04)', 'transparent']}
        locations={[0, 0.35, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 0.6 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Foil shimmer for foil cards */}
      {card.foil && (
        <LinearGradient
          colors={[
            'rgba(255,215,0,0.08)',
            'rgba(122,107,255,0.10)',
            'rgba(95,210,255,0.08)',
            'rgba(255,91,182,0.06)',
          ]}
          locations={[0, 0.33, 0.66, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Border overlay */}
      <View style={[StyleSheet.absoluteFill, styles.border, { borderRadius: 8 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  border: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
});
