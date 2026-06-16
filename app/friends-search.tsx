import { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  FlatList,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import {
  avatarFor,
  Profile,
  useSearchProfiles,
} from '@/lib/api/profiles';
import {
  useFriendshipStatus,
  useSendFriendRequest,
} from '@/lib/api/friends';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { haptic } from '@/lib/haptics';
import { Colors, FontFamily, PressOpacity, Radius, Spacing } from '@/constants/theme';

export default function FriendSearchScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  // One profile query per pause in typing, not per keystroke.
  const debouncedQuery = useDebouncedValue(query, 300);

  const { data: results = [], isFetching } = useSearchProfiles(debouncedQuery);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <ScreenHeader title="Find friends" topInset={false} />

      <View style={styles.searchWrap}>
        <View style={styles.searchRow}>
          <Icon name="search" size={16} color={Colors.text3} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by username or name"
            placeholderTextColor={Colors.text3}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Clear search">
              <Icon name="close" size={16} color={Colors.text3} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {query.trim().length < 2 ? (
        <EmptyState
          icon="search"
          title="Find your friends"
          caption="Type at least 2 characters of a username or name."
        />
      ) : isFetching && results.length === 0 ? (
        <View style={styles.empty}>
          <ActivityIndicator color={Colors.text3} />
        </View>
      ) : results.length === 0 ? (
        <EmptyState
          icon="people"
          title="No one matched"
          caption={`Nothing for “${query}” — try another spelling.`}
        />
      ) : (
        <FlatList
          data={results}
          keyExtractor={p => p.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => <SearchRow profile={item} />}
        />
      )}
    </View>
  );
}

function SearchRow({ profile }: { profile: Profile }) {
  const send = useSendFriendRequest();
  const { data: status = 'none' } = useFriendshipStatus(profile.id);

  async function handleSend() {
    try {
      haptic('medium');
      await send.mutateAsync(profile.id);
    } catch {
      // mutation surfaces an error to query state; ignore for now.
    }
  }

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push(`/friend/${profile.id}`)}
      activeOpacity={PressOpacity}
    >
      <Avatar colors={avatarFor(profile.id)} uri={profile.avatar_url} size={44} />
      <View style={styles.rowInfo}>
        <Text style={styles.rowName}>{profile.display_name?.trim() || profile.username}</Text>
        <Text style={styles.rowHandle}>@{profile.username.toUpperCase()}</Text>
      </View>

      {status === 'accepted' ? (
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>FRIENDS</Text>
        </View>
      ) : status === 'pending_outgoing' ? (
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>REQUESTED</Text>
        </View>
      ) : status === 'pending_incoming' ? (
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>RESPOND</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.addBtn, send.isPending && styles.addBtnDisabled]}
          onPress={handleSend}
          disabled={send.isPending}
          accessibilityLabel={`Send friend request to ${profile.username}`}
        >
          <Text style={styles.addBtnText}>{send.isPending ? '…' : 'ADD'}</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },

  searchWrap: { paddingHorizontal: Spacing.xl, paddingTop: 4, paddingBottom: 14 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: Colors.text,
  },

  list: { paddingHorizontal: Spacing.xl, paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  rowInfo: { flex: 1, minWidth: 0 },
  rowName: { fontFamily: FontFamily.display, fontSize: 15, color: Colors.text },
  rowHandle: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1.5,
    marginTop: 2,
  },

  addBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.gold,
  },
  addBtnDisabled: { backgroundColor: Colors.goldBorder },
  addBtnText: { fontFamily: FontFamily.mono, fontSize: 10, color: Colors.bg, letterSpacing: 1.5 },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.glass,
  },
  statusBadgeText: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    color: Colors.text2,
    letterSpacing: 1.5,
  },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  emptyText: { fontFamily: FontFamily.body, fontSize: 13, color: Colors.text3, textAlign: 'center' },
});
