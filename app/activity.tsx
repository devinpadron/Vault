// Activity feed. A light, friend-scoped stream: cards friends added, set
// milestones, published binders. Reached from the Friends tab. Read-only.

import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Avatar } from '@/components/ui/Avatar';
import { CardThumb } from '@/components/cards/CardThumb';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SkeletonRow } from '@/components/ui/SkeletonRow';
import { useActivityFeed, ActivityItem } from '@/lib/api/activity';
import { avatarFor } from '@/lib/avatar';
import { relativeTime } from '@/lib/format';
import { Colors, FontFamily, PressOpacity, Spacing } from '@/constants/theme';

function verb(item: ActivityItem): string {
  switch (item.type) {
    case 'card_added':       return 'added a card';
    case 'set_milestone':    return 'hit a set milestone';
    case 'binder_published': return 'published a binder';
  }
}

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const { data: items = [], isLoading, isError, error, refetch } = useActivityFeed();

  return (
    <View style={styles.root}>
      <ScreenHeader title="Activity" />

      {isError ? (
        <View style={styles.center}>
          <ErrorPanel message="Couldn't load activity" error={error as Error} onRetry={refetch} />
        </View>
      ) : isLoading ? (
        <View style={{ paddingHorizontal: Spacing.xl }}><SkeletonRow count={5} /></View>
      ) : (
        <FlatList<ActivityItem>
          data={items}
          keyExtractor={i => i.id}
          contentContainerStyle={{ paddingHorizontal: Spacing.xl, paddingBottom: insets.bottom + 32 }}
          ListEmptyComponent={
            <EmptyState
              icon="activity"
              title="No activity yet"
              caption="When friends add cards or hit milestones, it shows up here."
            />
          }
          renderItem={({ item, index }) => <ActivityRow item={item} index={index} />}
        />
      )}
    </View>
  );
}

function ActivityRow({ item, index }: { item: ActivityItem; index: number }) {
  const onPress = () => {
    if (item.type === 'card_added' && item.card) router.push(`/card/${item.card.id}`);
    else router.push(`/friend/${item.actor.id}`);
  };
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 30).duration(280)}>
      <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={PressOpacity}>
        <Avatar colors={avatarFor(item.actor.id)} uri={item.actor.avatarUrl} size={40} />
        <View style={styles.info}>
          <Text style={styles.text}>
            <Text style={styles.name}>{item.actor.name}</Text>
            <Text style={styles.verb}> {verb(item)}</Text>
            {item.card ? <Text style={styles.name}> · {item.card.name}</Text> : null}
          </Text>
          <Text style={styles.time}>{relativeTime(item.createdAt)}</Text>
        </View>
        {item.card ? <CardThumb card={item.card} width={36} /> : null}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  info: { flex: 1, minWidth: 0 },
  text: { fontFamily: FontFamily.body, fontSize: 14, color: Colors.text2, lineHeight: 19 },
  name: { fontFamily: FontFamily.bodySemi, color: Colors.text },
  verb: { color: Colors.text2 },
  time: { fontFamily: FontFamily.mono, fontSize: 10, color: Colors.text3, marginTop: 3 },
});
