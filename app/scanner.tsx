import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { Colors, FontFamily } from '@/constants/theme';

export default function ScannerScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Icon name="close" size={18} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>SCAN MODE</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn}>
          <Icon name="flash" size={16} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {/* Reticle placeholder */}
      <View style={styles.reticle}>
        {[
          { top: 0, left: 0 },
          { top: 0, right: 0 },
          { bottom: 0, left: 0 },
          { bottom: 0, right: 0 },
        ].map((pos, i) => (
          <View
            key={i}
            style={[
              styles.corner,
              pos,
              i < 2 ? { borderTopWidth: 2, borderTopColor: Colors.gold } : { borderBottomWidth: 2, borderBottomColor: Colors.gold },
              i % 2 === 0 ? { borderLeftWidth: 2, borderLeftColor: Colors.gold } : { borderRightWidth: 2, borderRightColor: Colors.gold },
            ]}
          />
        ))}
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.eyebrow}>● ANALYZING</Text>
        <Text style={styles.hint}>Hold steady — frame the card</Text>
        <Text style={styles.sub}>IMAGE HASH · SET LOOKUP · PRICE FETCH</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#050507',
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  badgeText: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    color: Colors.text,
  },
  reticle: {
    width: 240,
    height: 336,
    alignSelf: 'center',
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
  },
  bottom: {
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 24,
  },
  eyebrow: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    color: Colors.gold,
    marginBottom: 8,
  },
  hint: {
    fontFamily: FontFamily.display,
    fontSize: 22,
    color: Colors.text,
    textAlign: 'center',
  },
  sub: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    color: Colors.text3,
    marginTop: 8,
    letterSpacing: 1.2,
  },
});
