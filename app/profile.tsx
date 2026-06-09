import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  PublicCollection,
  avatarFor,
  useMyProfile,
  useProfileCollections,
  useProfileStats,
} from '@/lib/api/profiles';
import { Colors, FontFamily, NavButtonStyle, Radius, Spacing } from '@/constants/theme';

// Per-kind destination. for_trade has no dedicated screen yet — left null so
// the row stays informational rather than navigating to a dead end.
function destinationFor(c: PublicCollection): string | null {
  switch (c.kind) {
    case 'collection': return '/(tabs)/collection';
    case 'wishlist':   return '/wishlist';
    case 'binder':     return `/binder/${c.id}`;
    case 'for_trade':  return null;
  }
}

export default function MyProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const { data: profile, isLoading, isError, error, refetch } = useMyProfile();
  const { data: stats } = useProfileStats(user?.id);
  const { data: collections = [] } = useProfileCollections(user?.id);

  if (isLoading || !user) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
        <View style={styles.navBar}>
          <TouchableOpacity style={styles.navBtn} onPress={() => router.back()}>
            <Icon name="chevron-left" size={18} color={Colors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.centerFill}>
          <Text style={styles.muted}>Loading profile…</Text>
        </View>
      </View>
    );
  }

  if (isError || !profile) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
        <View style={styles.navBar}>
          <TouchableOpacity style={styles.navBtn} onPress={() => router.back()}>
            <Icon name="chevron-left" size={18} color={Colors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.centerFill}>
          <ErrorPanel message="Failed to load profile" error={error} onRetry={refetch} />
        </View>
      </View>
    );
  }

  const displayName = profile.display_name?.trim() || profile.username;
  const avatar = avatarFor(profile.id);

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.navBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={styles.navBtn} onPress={() => router.back()}>
            <Icon name="chevron-left" size={18} color={Colors.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => router.push('/settings')}>
            <Icon name="settings" size={18} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.hero}>
          <LinearGradient
            colors={['#FFD700', '#ff5fb6']}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={styles.ringOuter}
          >
            <View style={styles.ringGap}>
              <Avatar colors={avatar} size={88} />
            </View>
          </LinearGradient>

          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.handle}>@{profile.username.toUpperCase()}</Text>

          {profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}

          <View style={styles.statsRow}>
            <Stat label="BINDERS" value={String(stats?.binders ?? 0)} />
            <Stat label="CARDS"   value={String(stats?.cards ?? 0)} />
            <Stat
              label="JOINED"
              value={new Date(profile.created_at)
                .toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
                .toUpperCase()}
            />
          </View>

          <View style={styles.ctaRow}>
            <TouchableOpacity
              style={styles.ctaPrimary}
              onPress={() => router.push('/profile-edit')}
              accessibilityRole="button"
              accessibilityLabel="Edit profile"
            >
              <Text style={styles.ctaPrimaryText}>Edit profile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.ctaGhost}
              onPress={() => router.push('/friends-search')}
              accessibilityRole="button"
              accessibilityLabel="Find friends"
            >
              <Icon name="search" size={16} color={Colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>Your collections</Text>
          {collections.length === 0 ? (
            <Text style={styles.muted}>No collections yet — add cards to get started.</Text>
          ) : (
            <View style={styles.list}>
              {collections.map(c => {
                const dest = destinationFor(c);
                const Row = dest ? TouchableOpacity : View;
                return (
                  <Row
                    key={c.id}
                    style={styles.collectionRow}
                    {...(dest
                      ? {
                          onPress: () => router.push(dest as never),
                          accessibilityRole: 'button' as const,
                          accessibilityLabel: `Open ${c.name}`,
                          activeOpacity: 0.85,
                        }
                      : {})}
                  >
                    <View style={styles.collectionInfo}>
                      <Text style={styles.collectionName}>{c.name}</Text>
                      <Text style={styles.collectionMeta}>
                        {c.item_count} CARDS · {c.is_public ? 'PUBLIC' : 'PRIVATE'} · {c.kind.toUpperCase()}
                      </Text>
                    </View>
                    {dest && <Icon name="chevron-right" size={14} color={Colors.text3} />}
                  </Row>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  screen: { flex: 1 },
  content: {},
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { fontFamily: FontFamily.body, fontSize: 13, color: Colors.text3, textAlign: 'center' },

  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: 12,
  },
  navBtn: NavButtonStyle,

  hero: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: 12,
    paddingBottom: 28,
  },
  ringOuter: { padding: 3, borderRadius: Radius.full, marginBottom: 14 },
  ringGap: { padding: 3, backgroundColor: Colors.bg, borderRadius: Radius.full },
  name: { fontFamily: FontFamily.display, fontSize: 30, color: Colors.text },
  handle: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 2.5,
    marginTop: 4,
  },
  bio: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: Colors.text2,
    textAlign: 'center',
    marginTop: 14,
    paddingHorizontal: Spacing.lg,
    lineHeight: 18,
  },

  statsRow: { flexDirection: 'row', gap: 32, marginTop: 24 },
  statItem: { alignItems: 'center' },
  statValue: { fontFamily: FontFamily.mono, fontSize: 18, color: Colors.text },
  statLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    color: Colors.text3,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    marginTop: 3,
  },

  ctaRow: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 22 },
  ctaPrimary: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: Radius.md,
    backgroundColor: Colors.gold,
    alignItems: 'center',
  },
  ctaPrimaryText: { fontFamily: FontFamily.bodySemi, fontSize: 14, color: '#0A0A0C' },
  ctaGhost: {
    width: 50,
    paddingVertical: 13,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
  },

  divider: {
    height: 1,
    backgroundColor: Colors.line,
    marginHorizontal: Spacing.xl,
    marginBottom: 24,
  },

  section: { paddingHorizontal: Spacing.xl },
  sectionEyebrow: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.text3,
    marginBottom: 14,
  },
  list: { gap: 10 },
  collectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  collectionInfo: { flex: 1 },
  collectionName: { fontFamily: FontFamily.display, fontSize: 16, color: Colors.text },
  collectionMeta: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    color: Colors.text3,
    letterSpacing: 1.4,
    marginTop: 3,
  },
});
