import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { SkeletonRow } from '@/components/ui/SkeletonRow';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import { useFriends, useIncomingFriendRequests } from '@/lib/api/friends';
import { Colors, FontFamily, Radius, Spacing } from '@/constants/theme';
import { Friend } from '@/types';

export default function FriendsScreen() {
  const insets = useSafeAreaInsets();
  const { data: friends = [], isLoading, isError, refetch } = useFriends();
  const { data: requests = [] } = useIncomingFriendRequests();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: 100 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.eyebrow}>
              {friends.length} {friends.length === 1 ? 'friend' : 'friends'}
            </Text>
            <Text style={styles.title}>
              The <Text style={styles.titleAccent}>circle</Text>
            </Text>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => router.push('/friend-requests')}
              accessibilityLabel="Friend requests"
            >
              <Icon name="bell" size={18} color={Colors.text} />
              {requests.length > 0 && <View style={styles.badge} />}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => router.push('/friends-search')}
              accessibilityLabel="Find friends"
            >
              <Icon name="search" size={18} color={Colors.text} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {isError && <ErrorPanel message="Failed to load friends" onRetry={refetch} />}

      {!isError && requests.length > 0 && (
        <TouchableOpacity
          style={styles.requestsBanner}
          onPress={() => router.push('/friend-requests')}
          activeOpacity={0.9}
        >
          <View style={styles.requestsBannerLeft}>
            <Text style={styles.requestsBannerLabel}>NEW REQUESTS</Text>
            <Text style={styles.requestsBannerText}>
              {requests.length} pending friend {requests.length === 1 ? 'request' : 'requests'}
            </Text>
          </View>
          <Icon name="chevron-right" size={16} color={Colors.gold} />
        </TouchableOpacity>
      )}

      <View style={styles.list}>
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
        ) : friends.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No friends yet</Text>
            <Text style={styles.emptyText}>
              Find collectors by username and send a request.
            </Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => router.push('/friends-search')}
            >
              <Text style={styles.emptyBtnText}>FIND FRIENDS</Text>
            </TouchableOpacity>
          </View>
        ) : (
          friends.map((friend, index) => (
            <FriendRow key={friend.id} friend={friend} index={index} />
          ))
        )}
      </View>
    </ScrollView>
  );
}

function FriendRow({ friend, index }: { friend: Friend; index: number }) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 50).duration(300)}>
      <TouchableOpacity
        style={styles.row}
        onPress={() => router.push(`/friend/${friend.id}`)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`View ${friend.name}'s profile`}
      >
        <Avatar colors={friend.avatar} uri={friend.avatarUrl} size={48} />

        <View style={styles.rowInfo}>
          <Text style={styles.rowName}>{friend.name}</Text>
          <Text style={styles.rowMeta}>
            {friend.handle.toUpperCase()} · {friend.binders} {friend.binders === 1 ? 'BINDER' : 'BINDERS'}
          </Text>
        </View>

        <Icon name="chevron-right" size={14} color={Colors.text3} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingHorizontal: Spacing.xl },

  header: { marginBottom: 22 },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  eyebrow: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: Colors.text3,
    marginBottom: 4,
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 38,
    color: Colors.text,
    lineHeight: 40,
  },
  titleAccent: { fontFamily: FontFamily.displayItalic, color: Colors.gold },

  actions: { flexDirection: 'row', gap: 8, paddingTop: 14 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  badge: {
    position: 'absolute',
    top: 9,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.gold,
  },

  requestsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.3)',
    backgroundColor: 'rgba(255,215,0,0.08)',
    marginBottom: 16,
  },
  requestsBannerLeft: { gap: 4 },
  requestsBannerLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 1.6,
    color: Colors.gold,
  },
  requestsBannerText: { fontFamily: FontFamily.body, fontSize: 14, color: Colors.text },

  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: 14,
    padding: 14,
  },
  rowInfo: { flex: 1, minWidth: 0 },
  rowName: { fontFamily: FontFamily.display, fontSize: 16, color: Colors.text },
  rowMeta: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1.2,
    marginTop: 2,
  },

  empty: { alignItems: 'center', paddingVertical: 56, gap: 12 },
  emptyTitle: { fontFamily: FontFamily.display, fontSize: 22, color: Colors.text },
  emptyText: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: Colors.text3,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emptyBtn: {
    marginTop: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: Radius.full,
    backgroundColor: Colors.gold,
  },
  emptyBtnText: { fontFamily: FontFamily.mono, fontSize: 11, color: '#0A0A0C', letterSpacing: 1.5 },
});
