import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { useMyProfile } from '@/lib/api/profiles';
import { useAuth } from '@/lib/auth/AuthContext';
import { useCollectionEntries, useAddToCollection, useUpdateCostBasis } from '@/lib/db/collection';
import { shareCollectionCsv, pickCsvFile, parseCsvFile, resolveImportRows } from '@/lib/csv';
import { Colors, Gradients, FontFamily, Radius, Spacing } from '@/constants/theme';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { data: profile } = useMyProfile();
  const version = Constants.expoConfig?.version ?? '—';
  const { data: entries = [] } = useCollectionEntries();
  const addToCollection = useAddToCollection();
  const updateCostBasis = useUpdateCostBasis();
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);

  async function handleExport() {
    if (entries.length === 0) {
      Alert.alert('Nothing to export', 'Your collection is empty.');
      return;
    }
    setBusy('export');
    try {
      await shareCollectionCsv(entries);
    } catch (e) {
      Alert.alert('Export failed', (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleImport() {
    setBusy('import');
    try {
      const file = await pickCsvFile();
      if (!file) { setBusy(null); return; }
      const rows = await parseCsvFile(file.uri);
      if (rows.length === 0) {
        Alert.alert('Empty file', 'No rows found in that CSV.');
        return;
      }
      const { resolved, unresolved } = await resolveImportRows(rows);
      let added = 0;
      for (const { row, card } of resolved) {
        try {
          await addToCollection(card);
          if (row.acquired_price != null) {
            await updateCostBasis(card.id, row.acquired_price);
          }
          added += 1;
        } catch { /* skip duplicates / errors silently for now */ }
      }
      Alert.alert(
        'Import complete',
        `Added ${added} of ${rows.length} cards.` +
          (unresolved.length > 0 ? `\n${unresolved.length} rows didn't match a card.` : ''),
      );
    } catch (e) {
      Alert.alert('Import failed', (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

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
        <ScreenHeader title="Settings" />

        {/* Profile */}
        {user && (
          <View style={styles.profileSection}>
            <LinearGradient
              colors={Gradients.profileRing}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.85, y: 1 }}
              style={styles.avatarRing}
            >
              <View style={styles.avatarGap}>
                <Avatar colors={user.avatar} uri={profile?.avatar_url} size={72} />
              </View>
            </LinearGradient>
            <Text style={styles.name}>{user.name}</Text>
            <Text style={styles.handle}>{user.handle.toUpperCase()}</Text>
            {user.email && <Text style={styles.email}>{user.email}</Text>}
          </View>
        )}

        {/* Data section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Data</Text>
          <TouchableOpacity
            style={styles.row}
            onPress={handleExport}
            disabled={busy !== null}
            accessibilityRole="button"
          >
            <Icon name="share" size={18} color={Colors.text} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Export collection (CSV)</Text>
              <Text style={styles.rowHint}>
                {busy === 'export' ? 'Preparing…' : `${entries.length} card${entries.length === 1 ? '' : 's'}`}
              </Text>
            </View>
            <Icon name="chevron-right" size={16} color={Colors.text3} />
          </TouchableOpacity>
          <View style={{ height: 8 }} />
          <TouchableOpacity
            style={styles.row}
            onPress={handleImport}
            disabled={busy !== null}
            accessibilityRole="button"
          >
            <Icon name="plus" size={18} color={Colors.text} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Import from CSV</Text>
              <Text style={styles.rowHint}>
                {busy === 'import' ? 'Resolving cards…' : 'Vault, TCGplayer, or Collectr exports'}
              </Text>
            </View>
            <Icon name="chevron-right" size={16} color={Colors.text3} />
          </TouchableOpacity>
        </View>

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
  rowHint: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.6,
    color: Colors.text3,
    marginTop: 2,
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
