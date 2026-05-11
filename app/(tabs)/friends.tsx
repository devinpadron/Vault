import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Avatar } from '@/components/ui/Avatar';
import { SkeletonRow } from '@/components/ui/SkeletonRow';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import { useFriends } from '@/lib/api/friends';
import { Colors, FontFamily, Radius, Spacing } from '@/constants/theme';
import { Friend } from '@/types';

export default function FriendsScreen() {
  const insets = useSafeAreaInsets();
  const { data: friends = [], isLoading, isError, refetch } = useFriends();
  const onlineFriends = friends.filter(f => f.online);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: 100 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.eyebrow}>
          {friends.length} friends · {onlineFriends.length} online now
        </Text>
        <Text style={styles.title}>
          The <Text style={styles.titleAccent}>circle</Text>
        </Text>
      </View>

      {isError && <ErrorPanel message="Failed to load friends" onRetry={refetch} />}

      {/* Story row — online friends */}
      {!isError && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.storyRow}
          style={styles.storyScroll}
        >
          {onlineFriends.map(friend => (
            <TouchableOpacity
              key={friend.id}
              style={styles.storyItem}
              onPress={() => router.push(`/friend/${friend.id}`)}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#FFD700', '#ff5fb6']}
                start={{ x: 0.15, y: 0 }}
                end={{ x: 0.85, y: 1 }}
                style={styles.storyRingOuter}
              >
                <View style={styles.storyRingGap}>
                  <Avatar colors={friend.avatar} size={50} />
                </View>
              </LinearGradient>
              <Text style={styles.storyName}>{friend.name.split(' ')[0]}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Full friend list */}
      <View style={styles.list}>
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
          : friends.map((friend, index) => (
              <FriendRow key={friend.id} friend={friend} index={index} />
            ))
        }
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
        <Avatar colors={friend.avatar} size={48} online={friend.online} />

        <View style={styles.rowInfo}>
          <Text style={styles.rowName}>{friend.name}</Text>
          <Text style={styles.rowMeta}>
            {friend.handle.toUpperCase()} · {friend.binders} BINDERS
          </Text>
          <Text style={styles.rowRecent} numberOfLines={1}>
            <Text style={styles.rowRecentLabel}>last added · </Text>
            <Text style={styles.rowRecentCard}>{friend.recent}</Text>
          </Text>
        </View>

        <View style={styles.rowRight}>
          <Text style={styles.rowValue}>${(friend.value / 1000).toFixed(1)}k</Text>
          <TouchableOpacity style={styles.tradeBtn} accessibilityLabel={`Trade with ${friend.name}`}>
            <Text style={styles.tradeBtnText}>TRADE</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    paddingHorizontal: Spacing.xl,
  },
  header: {
    marginBottom: 22,
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
  titleAccent: {
    fontFamily: FontFamily.displayItalic,
    color: Colors.gold,
  },
  // Story row
  storyScroll: {
    marginHorizontal: -Spacing.xl,
    marginBottom: 22,
  },
  storyRow: {
    paddingHorizontal: Spacing.xl,
    gap: 14,
  },
  storyItem: {
    alignItems: 'center',
    gap: 6,
  },
  storyRingOuter: {
    padding: 2,
    borderRadius: Radius.full,
  },
  storyRingGap: {
    padding: 2,
    backgroundColor: Colors.bg,
    borderRadius: Radius.full,
  },
  storyName: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: Colors.text2,
  },
  // Friend list
  list: {
    gap: 10,
  },
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
  rowInfo: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    fontFamily: FontFamily.display,
    fontSize: 16,
    color: Colors.text,
  },
  rowMeta: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1.2,
    marginTop: 2,
  },
  rowRecent: {
    marginTop: 6,
  },
  rowRecentLabel: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: Colors.text3,
  },
  rowRecentCard: {
    fontFamily: FontFamily.displayItalic,
    fontSize: 11,
    color: Colors.text,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  rowValue: {
    fontFamily: FontFamily.mono,
    fontSize: 13,
    color: Colors.gold,
  },
  tradeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.3)',
    borderRadius: Radius.full,
  },
  tradeBtnText: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    color: Colors.gold,
    letterSpacing: 1.5,
  },
});
