import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/theme';

interface AvatarProps {
  colors: [string, string];
  size: number;
  online?: boolean;
}

export function Avatar({ colors, size, online }: AvatarProps) {
  const radius = size / 2;
  const dotSize = Math.round(size * 0.26);

  return (
    <View style={{ width: size, height: size }}>
      <View style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden' }}>
        <LinearGradient
          colors={colors}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={{ width: size, height: size }}
        />
      </View>
      {online && (
        <View
          style={[
            styles.onlineDot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              bottom: 0,
              right: 0,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  onlineDot: {
    position: 'absolute',
    backgroundColor: Colors.up,
    borderWidth: 2,
    borderColor: Colors.bg,
  },
});
