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
import { Colors, FontFamily, Radius, Spacing } from '@/constants/theme';

export default function FriendSearchScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const { data: results = [], isFetching } = useSearchProfiles(query);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.navBar}>
        <TouchableOpacity style={styles.navBtn} onPress={() => router.back()}>
          <Icon name="chevron-left" size={18} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Find friends</Text>
        <View style={styles.navBtn} />
      </View>

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
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Type at least 2 characters to search.</Text>
        </View>
      ) : isFetching && results.length === 0 ? (
        <View style={styles.empty}>
          <ActivityIndicator color={Colors.text3} />
        </View>
      ) : results.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No one matched &ldquo;{query}&rdquo;.</Text>
        </View>
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
      await send.mutateAsync(profile.id);
    } catch {
      // mutation surfaces an error to query state; ignore for now.
    }
  }

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push(`/friend/${profile.id}`)}
      activeOpacity={0.85}
    >
      <Avatar colors={avatarFor(profile.id)} size={44} />
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

  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: 12,
  },
  navTitle: { fontFamily: FontFamily.display, fontSize: 22, color: Colors.text },
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
  addBtnDisabled: { backgroundColor: 'rgba(255,215,0,0.3)' },
  addBtnText: { fontFamily: FontFamily.mono, fontSize: 10, color: '#0A0A0C', letterSpacing: 1.5 },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
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
