// Notifications inbox. Unifies incoming friend requests (actionable inline) and
// notification rows. Reached from the Friends-tab bell. Marks all read on open
// so the badge clears.

import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SkeletonRow } from '@/components/ui/SkeletonRow';
import { haptic } from '@/lib/haptics';
import { avatarFor } from '@/lib/api/profiles';
import {
  IncomingFriendRequest,
  useIncomingFriendRequests,
  useRespondToFriendRequest,
} from '@/lib/api/friends';
import {
  AppNotification,
  useNotifications,
  useMarkAllNotificationsRead,
} from '@/lib/api/notifications';
import { relativeTime } from '@/lib/format';
import { Colors, FontFamily, PressOpacity, Radius, Spacing } from '@/constants/theme';

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { data: requests = [], isError: reqError, refetch: refetchReq } = useIncomingFriendRequests();
  const { data: notifications = [], isLoading, isError, error, refetch } = useNotifications();
  const markAll = useMarkAllNotificationsRead();

  // Clear the unread badge once the user has opened the inbox.
  useEffect(() => {
    if (notifications.some(n => !n.read_at)) markAll.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications.length]);

  const empty = requests.length === 0 && notifications.length === 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <ScreenHeader title="Notifications" topInset={false} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {isError || reqError ? (
          <ErrorPanel message="Failed to load notifications" error={error as Error} onRetry={() => { refetch(); refetchReq(); }} />
        ) : isLoading ? (
          <View style={styles.list}><SkeletonRow count={4} /></View>
        ) : empty ? (
          <EmptyState
            icon="bell"
            title="All caught up"
            caption="Friend requests and updates from your circle will land here."
          />
        ) : (
          <>
            {requests.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>FRIEND REQUESTS</Text>
                <View style={styles.list}>
                  {requests.map(req => <RequestRow key={req.friendship_id} request={req} />)}
                </View>
              </>
            )}
            {notifications.length > 0 && (
              <>
                {requests.length > 0 && <Text style={[styles.sectionLabel, { marginTop: 24 }]}>RECENT</Text>}
                <View style={styles.list}>
                  {notifications.map(n => <NotificationRow key={n.id} notification={n} />)}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function NotificationRow({ notification }: { notification: AppNotification }) {
  return (
    <View style={[styles.notifRow, !notification.read_at && styles.notifUnread]}>
      <View style={styles.notifIcon}>
        <Icon name="bell" size={16} color={Colors.gold} />
      </View>
      <View style={styles.notifInfo}>
        <Text style={styles.notifTitle}>{notification.title}</Text>
        {notification.body ? <Text style={styles.notifBody}>{notification.body}</Text> : null}
      </View>
      <Text style={styles.notifTime}>{relativeTime(notification.created_at)}</Text>
    </View>
  );
}

function RequestRow({ request }: { request: IncomingFriendRequest }) {
  const respond = useRespondToFriendRequest();
  const p = request.requester;
  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.rowMain} onPress={() => router.push(`/friend/${p.id}`)} activeOpacity={0.85}>
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
        >
          <Text style={styles.declineBtnText}>DECLINE</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingHorizontal: Spacing.xl, paddingTop: 6 },
  sectionLabel: {
    fontFamily: FontFamily.mono, fontSize: 9, letterSpacing: 1.8,
    color: Colors.text3, marginBottom: 12,
  },
  list: { gap: 10 },

  notifRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    borderRadius: Radius.md, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.line,
  },
  notifUnread: { borderColor: Colors.goldBorder, backgroundColor: Colors.goldFaint },
  notifIcon: {
    width: 36, height: 36, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.goldTint,
  },
  notifInfo: { flex: 1, minWidth: 0 },
  notifTitle: { fontFamily: FontFamily.bodySemi, fontSize: 14, color: Colors.text },
  notifBody: { fontFamily: FontFamily.body, fontSize: 12, color: Colors.text3, marginTop: 2 },
  notifTime: { fontFamily: FontFamily.mono, fontSize: 10, color: Colors.text3 },

  row: {
    padding: 14, borderRadius: Radius.md, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.line, gap: 12,
  },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowInfo: { flex: 1, minWidth: 0 },
  rowName: { fontFamily: FontFamily.display, fontSize: 16, color: Colors.text },
  rowHandle: { fontFamily: FontFamily.mono, fontSize: 10, color: Colors.text3, letterSpacing: 1.5, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8 },
  acceptBtn: { flex: 1, paddingVertical: 10, borderRadius: Radius.md, backgroundColor: Colors.gold, alignItems: 'center' },
  acceptBtnText: { fontFamily: FontFamily.mono, fontSize: 11, color: Colors.bg, letterSpacing: 1.5 },
  declineBtn: {
    flex: 1, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1,
    borderColor: Colors.line, backgroundColor: Colors.glass, alignItems: 'center',
  },
  declineBtnText: { fontFamily: FontFamily.mono, fontSize: 11, color: Colors.text2, letterSpacing: 1.5 },
});
