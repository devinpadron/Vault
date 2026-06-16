import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/ui/Avatar';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SkeletonRow } from '@/components/ui/SkeletonRow';
import { avatarFor } from '@/lib/api/profiles';
import {
  IncomingFriendRequest,
  useIncomingFriendRequests,
  useRespondToFriendRequest,
} from '@/lib/api/friends';
import { haptic } from '@/lib/haptics';
import { Colors, FontFamily, PressOpacity, Radius, Spacing } from '@/constants/theme';

export default function FriendRequestsScreen() {
  const insets = useSafeAreaInsets();
  const {
    data: requests = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useIncomingFriendRequests();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <ScreenHeader title="Requests" topInset={false} />

      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {isError ? (
          <ErrorPanel message="Failed to load requests" error={error} onRetry={refetch} />
        ) : isLoading ? (
          <View style={styles.list}>
            {Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}
          </View>
        ) : requests.length === 0 ? (
          <EmptyState
            icon="people"
            title="No pending requests"
            caption="When someone wants to be friends, you'll see it here."
            actionLabel="Find friends →"
            onAction={() => router.replace('/friends-search')}
          />
        ) : (
          <View style={styles.list}>
            {requests.map(req => (
              <RequestRow key={req.friendship_id} request={req} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function RequestRow({ request }: { request: IncomingFriendRequest }) {
  const respond = useRespondToFriendRequest();
  const p = request.requester;

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.rowMain}
        onPress={() => router.push(`/friend/${p.id}`)}
        activeOpacity={0.85}
      >
        <Avatar colors={avatarFor(p.id)} uri={p.avatar_url} size={44} />
        <View style={styles.rowInfo}>
          <Text style={styles.rowName}>{p.display_name?.trim() || p.username}</Text>
          <Text style={styles.rowHandle}>@{p.username.toUpperCase()}</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.acceptBtn}
          activeOpacity={PressOpacity}
          onPress={() => {
            haptic('success');
            respond.mutate({ friendshipId: request.friendship_id, accept: true });
          }}
          disabled={respond.isPending}
          accessibilityLabel={`Accept ${p.username}`}
        >
          <Text style={styles.acceptBtnText}>ACCEPT</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.declineBtn}
          activeOpacity={PressOpacity}
          onPress={() => {
            haptic('select');
            respond.mutate({ friendshipId: request.friendship_id, accept: false });
          }}
          disabled={respond.isPending}
          accessibilityLabel={`Decline ${p.username}`}
        >
          <Text style={styles.declineBtnText}>DECLINE</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  screen: { flex: 1 },
  content: { paddingHorizontal: Spacing.xl, paddingTop: 6 },

  list: { gap: 10 },
  row: {
    padding: 14,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.line,
    gap: 12,
  },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowInfo: { flex: 1, minWidth: 0 },
  rowName: { fontFamily: FontFamily.display, fontSize: 16, color: Colors.text },
  rowHandle: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1.5,
    marginTop: 2,
  },

  actions: { flexDirection: 'row', gap: 8 },
  acceptBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.gold,
    alignItems: 'center',
  },
  acceptBtnText: { fontFamily: FontFamily.mono, fontSize: 11, color: Colors.bg, letterSpacing: 1.5 },
  declineBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.glass,
    alignItems: 'center',
  },
  declineBtnText: { fontFamily: FontFamily.mono, fontSize: 11, color: Colors.text2, letterSpacing: 1.5 },
});
