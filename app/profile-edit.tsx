import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import { useMyProfile, useUpdateProfile } from '@/lib/api/profiles';
import { Colors, FontFamily, NavButtonStyle, Radius, Spacing } from '@/constants/theme';

const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

export default function ProfileEditScreen() {
  const insets = useSafeAreaInsets();
  const { data: profile, isLoading, isError, error, refetch } = useMyProfile();
  const update = useUpdateProfile();

  const [username, setUsername]       = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio]                 = useState('');

  // Hydrate form once the profile loads.
  useEffect(() => {
    if (profile) {
      setUsername(profile.username);
      setDisplayName(profile.display_name ?? '');
      setBio(profile.bio ?? '');
    }
  }, [profile]);

  const usernameError = useMemo(() => {
    if (!username) return 'Username is required';
    if (!USERNAME_RE.test(username)) return '3–24 chars · a–z, 0–9, _';
    return null;
  }, [username]);

  const dirty =
    profile && (
      username !== profile.username ||
      displayName !== (profile.display_name ?? '') ||
      bio !== (profile.bio ?? '')
    );

  async function save() {
    if (usernameError) return;
    try {
      await update.mutateAsync({
        username,
        display_name: displayName,
        bio,
      });
      router.back();
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? 'Failed to save profile';
      // Postgres unique-violation surfaces as a 23505 — translate to plain English.
      Alert.alert(
        'Could not save',
        /duplicate|unique/i.test(msg) ? 'That username is already taken.' : msg,
      );
    }
  }

  if (isLoading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
        <Header onBack={() => router.back()} />
        <View style={styles.centerFill}>
          <Text style={styles.muted}>Loading…</Text>
        </View>
      </View>
    );
  }
  if (isError || !profile) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
        <Header onBack={() => router.back()} />
        <View style={styles.centerFill}>
          <ErrorPanel message="Failed to load profile" error={error} onRetry={refetch} />
        </View>
      </View>
    );
  }

  const saveDisabled = !dirty || !!usernameError || update.isPending;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[{ paddingTop: insets.top + 8 }]}>
        <View style={styles.navBar}>
          <TouchableOpacity style={styles.navBtn} onPress={() => router.back()}>
            <Icon name="chevron-left" size={18} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>Edit profile</Text>
          <TouchableOpacity
            style={[styles.saveBtn, saveDisabled && styles.saveBtnDisabled]}
            onPress={save}
            disabled={saveDisabled}
            accessibilityRole="button"
            accessibilityLabel="Save profile"
          >
            <Text style={[styles.saveBtnText, saveDisabled && styles.saveBtnTextDisabled]}>
              {update.isPending ? 'SAVING' : 'SAVE'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Field label="Username">
          <View style={styles.inputRow}>
            <Text style={styles.inputPrefix}>@</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={t => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={24}
              placeholder="your_handle"
              placeholderTextColor={Colors.text3}
            />
          </View>
          {usernameError && username !== profile.username && (
            <Text style={styles.error}>{usernameError}</Text>
          )}
        </Field>

        <Field label="Display name">
          <TextInput
            style={[styles.input, styles.inputStandalone]}
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={48}
            placeholder="Shown above your handle"
            placeholderTextColor={Colors.text3}
          />
        </Field>

        <Field label="Bio">
          <TextInput
            style={[styles.input, styles.inputStandalone, styles.inputMultiline]}
            value={bio}
            onChangeText={setBio}
            multiline
            maxLength={200}
            placeholder="What do you collect?"
            placeholderTextColor={Colors.text3}
          />
          <Text style={styles.hint}>{bio.length}/200</Text>
        </Field>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.navBar}>
      <TouchableOpacity style={styles.navBtn} onPress={onBack}>
        <Icon name="chevron-left" size={18} color={Colors.text} />
      </TouchableOpacity>
      <Text style={styles.navTitle}>Edit profile</Text>
      <View style={styles.navBtn} />
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  screen: { flex: 1 },
  content: { paddingHorizontal: Spacing.xl, paddingTop: 8 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { fontFamily: FontFamily.body, fontSize: 13, color: Colors.text3 },

  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: 12,
  },
  navTitle: { fontFamily: FontFamily.display, fontSize: 22, color: Colors.text },
  navBtn: NavButtonStyle,
  saveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radius.full,
    backgroundColor: Colors.gold,
  },
  saveBtnDisabled: { backgroundColor: 'rgba(255,215,0,0.2)' },
  saveBtnText: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 1.6,
    color: '#0A0A0C',
  },
  saveBtnTextDisabled: { color: 'rgba(10,10,12,0.5)' },

  field: { marginBottom: 22 },
  fieldLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: Colors.text3,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
  },
  inputPrefix: { fontFamily: FontFamily.mono, fontSize: 15, color: Colors.text3, marginRight: 4 },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontFamily: FontFamily.body,
    fontSize: 15,
    color: Colors.text,
  },
  inputStandalone: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
  },
  inputMultiline: { minHeight: 100, textAlignVertical: 'top', paddingTop: 12 },
  hint: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    color: Colors.text3,
    marginTop: 6,
    textAlign: 'right',
  },
  error: { fontFamily: FontFamily.mono, fontSize: 10, color: Colors.down, marginTop: 6 },
});
