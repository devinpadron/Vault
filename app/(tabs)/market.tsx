import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontFamily } from '@/constants/theme';

export default function MarketScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 16 }]}>
      <Text style={styles.eyebrow}>Phase 5</Text>
      <Text style={styles.title}>
        <Text style={styles.accent}>Market</Text>
      </Text>
      <Text style={styles.sub}>Market screen — coming in Phase 5</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bg,
    paddingHorizontal: 22,
  },
  eyebrow: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: Colors.text3,
    marginBottom: 6,
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 38,
    color: Colors.text,
    lineHeight: 40,
  },
  accent: {
    fontFamily: FontFamily.displayItalic,
    color: Colors.gold,
  },
  sub: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: Colors.text3,
    marginTop: 12,
  },
});
