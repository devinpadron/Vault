import { useEffect } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import { useAuth } from '@/lib/auth/AuthContext';
import { useProfile } from '@/lib/api/profiles';
import {
  useFriend,
  useFriendBinders,
  useFriendshipStatus,
  useIncomingFriendRequests,
  useRemoveFriend,
  useRespondToFriendRequest,
  useSendFriendRequest,
} from '@/lib/api/friends';
import { Colors, FontFamily, NavButtonStyle, Radius, Spacing } from '@/constants/theme';

export default function FriendProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isMe = !!id && user?.id === id;

  const { data: friend, isLoading, isError, error, refetch } = useFriend(id ?? '');
  const { data: profile } = useProfile(id ?? '');
  const { data: binders = [] } = useFriendBinders(id ?? '');
  const { data: status = 'none' } = useFriendshipStatus(id);

  // If this is the current user, bounce to /profile — the dedicated screen
  // has Edit affordances the friend view doesn't.
  useEffect(() => {
    if (isMe) router.replace('/profile');
  }, [isMe]);
  if (isMe) return null;

  if (isLoading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 8, paddingHorizontal: Spacing.lg }]}>
        <TouchableOpacity style={styles.navBtn} onPress={() => router.back()}>
          <Icon name="chevron-left" size={18} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.centerFill}>
          <Text style={styles.muted}>Loading profile…</Text>
        </View>
      </View>
    );
  }
  if (isError) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 8, paddingHorizontal: Spacing.lg }]}>
        <TouchableOpacity style={styles.navBtn} onPress={() => router.back()}>
          <Icon name="chevron-left" size={18} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.centerFill}>
          <ErrorPanel message="Failed to load profile" error={error} onRetry={refetch} />
        </View>
      </View>
    );
  }
  if (!friend) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 8, paddingHorizontal: Spacing.lg }]}>
        <TouchableOpacity style={styles.navBtn} onPress={() => router.back()}>
          <Icon name="chevron-left" size={18} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.centerFill}>
          <Text style={styles.muted}>Profile not found</Text>
        </View>
      </View>
    );
  }

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
          <View style={styles.navBtn} />
        </View>

        <View style={styles.hero}>
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
          {profile?.bio && <Text style={styles.bio}>{profile.bio}</Text>}

          <View style={styles.statsRow}>
            <Stat label="BINDERS" value={String(friend.binders)} />
            <Stat label="RECENT" value={friend.recent || '—'} />
          </View>

          <FriendActions friendId={friend.id} status={status} />
        </View>

        <View style={styles.divider} />

        <View style={styles.bindersSection}>
          <Text style={styles.sectionEyebrow}>Public binders</Text>
          {binders.length === 0 ? (
            <Text style={styles.muted}>
              No public collections yet.
            </Text>
          ) : (
            <View style={styles.binderList}>
              {binders.map(binder => (
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
                      {binder.count} {binder.count === 1 ? 'CARD' : 'CARDS'}
                    </Text>
                  </View>
                </View>
              ))}
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
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function FriendActions({
  friendId,
  status,
}: {
  friendId: string;
  status: ReturnType<typeof useFriendshipStatus>['data'];
}) {
  const send    = useSendFriendRequest();
  const respond = useRespondToFriendRequest();
  const remove  = useRemoveFriend();
  const { data: requests = [] } = useIncomingFriendRequests();

  if (status === 'accepted') {
    return (
      <View style={styles.ctaRow}>
        <View style={styles.ctaPrimary}>
          <Text style={styles.ctaPrimaryText}>Friends</Text>
        </View>
        <TouchableOpacity
          style={styles.ctaGhost}
          onPress={() =>
            Alert.alert(
              'Remove friend?',
              "You'll need to send a new request to add them back.",
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Remove',
                  style: 'destructive',
                  onPress: () => remove.mutate(friendId),
                },
              ],
            )
          }
        >
          <Text style={styles.ctaGhostText}>Remove</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (status === 'pending_outgoing') {
    return (
      <View style={styles.ctaRow}>
        <View style={[styles.ctaPrimary, styles.ctaPrimaryMuted]}>
          <Text style={[styles.ctaPrimaryText, styles.ctaPrimaryTextMuted]}>Requested</Text>
        </View>
      </View>
    );
  }

  if (status === 'pending_incoming') {
    // The friendship_id lives in the requests list — look it up by friendId.
    const req = requests.find(r => r.requester.id === friendId);
    return (
      <View style={styles.ctaRow}>
        <TouchableOpacity
          style={styles.ctaPrimary}
          disabled={!req || respond.isPending}
          onPress={() => req && respond.mutate({ friendshipId: req.friendship_id, accept: true })}
        >
          <Text style={styles.ctaPrimaryText}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.ctaGhost}
          disabled={!req || respond.isPending}
          onPress={() => req && respond.mutate({ friendshipId: req.friendship_id, accept: false })}
        >
          <Text style={styles.ctaGhostText}>Decline</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (status === 'blocked') {
    return (
      <View style={styles.ctaRow}>
        <View style={[styles.ctaPrimary, styles.ctaPrimaryMuted]}>
          <Text style={[styles.ctaPrimaryText, styles.ctaPrimaryTextMuted]}>Blocked</Text>
        </View>
      </View>
    );
  }

  // status === 'none'
  return (
    <View style={styles.ctaRow}>
      <TouchableOpacity
        style={styles.ctaPrimary}
        disabled={send.isPending}
        onPress={() => send.mutate(friendId)}
      >
        <Text style={styles.ctaPrimaryText}>{send.isPending ? 'Sending…' : 'Add friend'}</Text>
      </TouchableOpacity>
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

  statsRow: { flexDirection: 'row', gap: 32, marginTop: 24, alignItems: 'flex-start' },
  statItem: { alignItems: 'center', maxWidth: 160 },
  statValue: { fontFamily: FontFamily.mono, fontSize: 14, color: Colors.text },
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
  ctaPrimaryMuted: { backgroundColor: 'rgba(255,215,0,0.2)' },
  ctaPrimaryText: { fontFamily: FontFamily.bodySemi, fontSize: 14, color: '#0A0A0C' },
  ctaPrimaryTextMuted: { color: 'rgba(10,10,12,0.6)' },
  ctaGhost: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
  },
  ctaGhostText: { fontFamily: FontFamily.bodySemi, fontSize: 14, color: Colors.text },

  divider: {
    height: 1,
    backgroundColor: Colors.line,
    marginHorizontal: Spacing.xl,
    marginBottom: 24,
  },

  bindersSection: { paddingHorizontal: Spacing.xl },
  sectionEyebrow: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.text3,
    marginBottom: 14,
  },
  binderList: { gap: 10 },
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
  binderThumb: { width: 40, height: 54, borderRadius: 6 },
  binderInfo: { flex: 1 },
  binderName: { fontFamily: FontFamily.display, fontSize: 16, color: Colors.text },
  binderMeta: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    color: Colors.text3,
    letterSpacing: 1.4,
    marginTop: 3,
  },
});
