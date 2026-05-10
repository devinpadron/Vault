import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { MOCK_DATA } from '@/data/mock';
import { Colors, FontFamily, Radius, Spacing } from '@/constants/theme';

export default function FriendProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const friend = MOCK_DATA.friends.find(f => f.id === id);
  if (!friend) return null;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Nav bar */}
        <View style={[styles.navBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={styles.navBtn} onPress={() => router.back()}>
            <Icon name="chevron-left" size={18} color={Colors.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn}>
            <Icon name="menu" size={18} color={Colors.text} />
          </TouchableOpacity>
        </View>

        {/* Hero section */}
        <View style={styles.hero}>
          {/* Gold → pink gradient ring */}
          <LinearGradient
            colors={['#FFD700', '#ff5fb6']}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={styles.ringOuter}
          >
            <View style={styles.ringGap}>
              <Avatar colors={friend.avatar} size={88} />
            </View>
          </LinearGradient>

          <Text style={styles.name}>{friend.name}</Text>
          <Text style={styles.handle}>{friend.handle.toUpperCase()}</Text>

          {/* Stats row */}
          <View style={styles.statsRow}>
            {(
              [
                ['VALUE', `$${(friend.value / 1000).toFixed(1)}k`],
                ['BINDERS', String(friend.binders)],
                ['CARDS', '184'],
              ] as [string, string][]
            ).map(([label, value]) => (
              <View key={label} style={styles.statItem}>
                <Text style={styles.statValue}>{value}</Text>
                <Text style={styles.statLabel}>{label}</Text>
              </View>
            ))}
          </View>

          {/* CTAs */}
          <View style={styles.ctaRow}>
            <TouchableOpacity style={styles.ctaPrimary}>
              <Text style={styles.ctaPrimaryText}>Trade</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ctaGhost}>
              <Text style={styles.ctaGhostText}>Message</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Public binders */}
        <View style={styles.bindersSection}>
          <Text style={styles.sectionEyebrow}>Public binders</Text>
          <View style={styles.binderList}>
            {MOCK_DATA.binders.slice(0, 2).map(binder => (
              <View key={binder.id} style={styles.binderRow}>
                <LinearGradient
                  colors={binder.tone}
                  start={{ x: 0.15, y: 0 }}
                  end={{ x: 0.85, y: 1 }}
                  style={styles.binderThumb}
                />
                <View style={styles.binderInfo}>
                  <Text style={styles.binderName}>{binder.name}</Text>
                  <Text style={styles.binderMeta}>
                    {binder.count} CARDS · LAST UPDATED 2D AGO
                  </Text>
                </View>
                <Icon name="chevron-right" size={14} color={Colors.text3} />
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  screen: {
    flex: 1,
  },
  content: {},
  // Nav
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: 12,
  },
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  // Hero
  hero: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: 12,
    paddingBottom: 28,
  },
  ringOuter: {
    padding: 3,
    borderRadius: Radius.full,
    marginBottom: 14,
  },
  ringGap: {
    padding: 3,
    backgroundColor: Colors.bg,
    borderRadius: Radius.full,
  },
  name: {
    fontFamily: FontFamily.display,
    fontSize: 30,
    color: Colors.text,
  },
  handle: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 2.5,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 32,
    marginTop: 24,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontFamily: FontFamily.mono,
    fontSize: 18,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    color: Colors.text3,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    marginTop: 3,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginTop: 22,
  },
  ctaPrimary: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: Radius.md,
    backgroundColor: Colors.gold,
    alignItems: 'center',
  },
  ctaPrimaryText: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 14,
    color: '#0A0A0C',
  },
  ctaGhost: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
  },
  ctaGhostText: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 14,
    color: Colors.text,
  },
  // Divider
  divider: {
    height: 1,
    backgroundColor: Colors.line,
    marginHorizontal: Spacing.xl,
    marginBottom: 24,
  },
  // Public binders
  bindersSection: {
    paddingHorizontal: Spacing.xl,
  },
  sectionEyebrow: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.text3,
    marginBottom: 14,
  },
  binderList: {
    gap: 10,
  },
  binderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  binderThumb: {
    width: 40,
    height: 54,
    borderRadius: 6,
  },
  binderInfo: {
    flex: 1,
  },
  binderName: {
    fontFamily: FontFamily.display,
    fontSize: 16,
    color: Colors.text,
  },
  binderMeta: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    color: Colors.text3,
    letterSpacing: 1.4,
    marginTop: 3,
  },
});
