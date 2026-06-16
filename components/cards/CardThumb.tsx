import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Card } from '@/types';
import { Colors } from '@/constants/theme';

interface Props {
  card: Card;
  width: number;
  ratio?: number;
}

export function CardThumb({ card, width, ratio = 1.4 }: Props) {
  const height = width * ratio;

  return (
    <View style={[styles.container, { width, height, borderRadius: 8 }]}>
      {/* Gradient always renders as background / placeholder */}
      <LinearGradient
        colors={card.art}
        locations={[0, 0.5, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Gloss highlight */}
      <LinearGradient
        colors={['rgba(255,255,255,0.22)', Colors.glass, 'transparent']}
        locations={[0, 0.35, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 0.6 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Foil shimmer for foil cards (below the real image) */}
      {card.foil && (
        <LinearGradient
          colors={[
            Colors.goldFaint,
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

      {/* Real card image — fades in over the gradient once loaded */}
      {card.imageUrl && (
        <Image
          source={{ uri: card.imageUrl }}
          style={[StyleSheet.absoluteFill, { borderRadius: 8 }]}
          contentFit="cover"
          transition={300}
          cachePolicy="memory-disk"
          recyclingKey={card.id}
        />
      )}

      {/* Border overlay — always on top */}
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
