import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/lib/auth/AuthContext';
import { Colors, FontFamily, NavButtonStyle, Radius, Spacing } from '@/constants/theme';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const version = Constants.expoConfig?.version ?? '—';

  function confirmLogout() {
    Alert.alert(
      'Sign out?',
      "You'll need to sign in again to access your collection.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            await logout();
            // Auth gate in _layout.tsx redirects to /(auth)/welcome.
          },
        },
      ],
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Nav bar */}
        <View style={[styles.navBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={styles.navBtn} onPress={() => router.back()}>
            <Icon name="chevron-left" size={18} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>Settings</Text>
          <View style={styles.navBtn} />
        </View>

        {/* Profile */}
        {user && (
          <View style={styles.profileSection}>
            <LinearGradient
              colors={['#FFD700', '#ff5fb6']}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.85, y: 1 }}
              style={styles.avatarRing}
            >
              <View style={styles.avatarGap}>
                <Avatar colors={user.avatar} size={72} />
              </View>
            </LinearGradient>
            <Text style={styles.name}>{user.name}</Text>
            <Text style={styles.handle}>{user.handle.toUpperCase()}</Text>
            {user.email && <Text style={styles.email}>{user.email}</Text>}
          </View>
        )}

        {/* Account section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Account</Text>
          <TouchableOpacity
            style={[styles.row, styles.rowDanger]}
            onPress={confirmLogout}
            accessibilityRole="button"
          >
            <Icon name="logout" size={18} color={Colors.down} />
            <Text style={styles.rowLabelDanger}>Sign out</Text>
          </TouchableOpacity>
        </View>

        {/* About section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>About</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Version</Text>
            <Text style={styles.rowValue}>{version}</Text>
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
  content: {
    paddingHorizontal: 0,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: 16,
  },
  navBtn: NavButtonStyle,
  navTitle: {
    fontFamily: FontFamily.display,
    fontSize: 22,
    color: Colors.text,
  },
  // Profile
  profileSection: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: Spacing.xl,
    gap: 4,
  },
  avatarRing: {
    padding: 3,
    borderRadius: Radius.full,
    marginBottom: 12,
  },
  avatarGap: {
    padding: 3,
    backgroundColor: Colors.bg,
    borderRadius: Radius.full,
  },
  name: {
    fontFamily: FontFamily.display,
    fontSize: 26,
    color: Colors.text,
  },
  handle: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 2.5,
    color: Colors.text3,
    marginTop: 2,
  },
  email: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: Colors.text2,
    marginTop: 8,
  },
  // Sections
  section: {
    marginTop: 20,
    marginHorizontal: Spacing.xl,
  },
  sectionLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: Colors.text3,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.surface,
    gap: 12,
  },
  rowDanger: {
    borderColor: 'rgba(255,92,92,0.25)',
  },
  rowLabel: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: Colors.text,
  },
  rowLabelDanger: {
    flex: 1,
    fontFamily: FontFamily.bodySemi,
    fontSize: 14,
    color: Colors.down,
  },
  rowValue: {
    fontFamily: FontFamily.mono,
    fontSize: 13,
    color: Colors.text3,
  },
});
