import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import {
  avatarFor,
  useMyProfile,
  useProfileCollections,
  useSetAvatar,
  useUpdateProfile,
} from '@/lib/api/profiles';
import { Colors, FontFamily, NavButtonStyle, Radius, Spacing } from '@/constants/theme';

const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

export default function ProfileEditScreen() {
  const insets = useSafeAreaInsets();
  const { data: profile, isLoading, isError, error, refetch } = useMyProfile();
  const update = useUpdateProfile();
  const setAvatar = useSetAvatar();

  const [username, setUsername]       = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio]                 = useState('');
  const [showcasePublic, setShowcasePublic] = useState(false);
  const [showcaseIds, setShowcaseIds] = useState<string[]>([]);

  const { data: collections = [] } = useProfileCollections(profile?.id);
  // Only public binders can be featured publicly.
  const publicBinders = useMemo(
    () => collections.filter(c => c.kind === 'binder' && c.is_public),
    [collections],
  );

  // Hydrate form once the profile loads.
  useEffect(() => {
    if (profile) {
      setUsername(profile.username);
      setDisplayName(profile.display_name ?? '');
      setBio(profile.bio ?? '');
      setShowcasePublic(profile.is_showcase_public ?? false);
      setShowcaseIds(profile.showcase_binder_ids ?? []);
    }
  }, [profile]);

  const toggleBinder = (id: string) =>
    setShowcaseIds(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]));

  const usernameError = useMemo(() => {
    if (!username) return 'Username is required';
    if (!USERNAME_RE.test(username)) return '3–24 chars · a–z, 0–9, _';
    return null;
  }, [username]);

  const sameIds = (a: string[], b: string[]) =>
    a.length === b.length && a.every((x, i) => x === b[i]);
  const dirty =
    profile && (
      username !== profile.username ||
      displayName !== (profile.display_name ?? '') ||
      bio !== (profile.bio ?? '') ||
      showcasePublic !== (profile.is_showcase_public ?? false) ||
      !sameIds(showcaseIds, profile.showcase_binder_ids ?? [])
    );

  async function pickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    try {
      await setAvatar.mutateAsync({ uri: asset.uri, mimeType: asset.mimeType ?? undefined });
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? 'Upload failed';
      Alert.alert('Could not update photo', msg);
    }
  }

  function removeAvatar() {
    Alert.alert('Remove photo?', 'Your avatar will go back to the default gradient.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setAvatar.mutateAsync(null).catch(e => {
            const msg = (e as { message?: string })?.message ?? 'Failed to remove photo';
            Alert.alert('Could not remove photo', msg);
          });
        },
      },
    ]);
  }

  async function save() {
    if (usernameError) return;
    try {
      await update.mutateAsync({
        username,
        display_name: displayName,
        bio,
        is_showcase_public: showcasePublic,
        showcase_binder_ids: showcaseIds,
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
        <View style={styles.avatarBlock}>
          <TouchableOpacity
            onPress={pickAvatar}
            disabled={setAvatar.isPending}
            accessibilityRole="button"
            accessibilityLabel="Change profile picture"
            activeOpacity={0.85}
          >
            <Avatar colors={avatarFor(profile.id)} uri={profile.avatar_url} size={88} />
            <View style={styles.avatarBadge}>
              {setAvatar.isPending ? (
                <ActivityIndicator size="small" color="#0A0A0C" />
              ) : (
                <Icon name="camera" size={14} color="#0A0A0C" />
              )}
            </View>
          </TouchableOpacity>
          {profile.avatar_url ? (
            <TouchableOpacity
              onPress={removeAvatar}
              disabled={setAvatar.isPending}
              accessibilityRole="button"
              accessibilityLabel="Remove profile picture"
            >
              <Text style={styles.avatarRemove}>REMOVE PHOTO</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.avatarHint}>TAP TO ADD A PHOTO</Text>
          )}
        </View>

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

        <View style={styles.showcaseDivider} />

        <Field label="Public showcase">
          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={styles.toggleTitle}>Shareable profile</Text>
              <Text style={styles.toggleSub}>
                Anyone with your link sees the binders you feature below.
              </Text>
            </View>
            <Switch
              value={showcasePublic}
              onValueChange={setShowcasePublic}
              trackColor={{ false: Colors.line, true: Colors.gold }}
              thumbColor="#fff"
            />
          </View>

          {showcasePublic && (
            <>
              <TouchableOpacity
                style={styles.shareBtn}
                onPress={() =>
                  Share.share({
                    message: `Check out my Vault collection: https://vault.app/u/${username}`,
                    url: `https://vault.app/u/${username}`,
                  })
                }
              >
                <Icon name="share" size={14} color={Colors.gold} />
                <Text style={styles.shareText}>vault.app/u/{username}</Text>
              </TouchableOpacity>

              <Text style={styles.featureLabel}>FEATURED BINDERS</Text>
              {publicBinders.length === 0 ? (
                <Text style={styles.featureEmpty}>
                  Make a binder public to feature it here.
                </Text>
              ) : (
                <View style={styles.binderList}>
                  {publicBinders.map(b => {
                    const on = showcaseIds.includes(b.id);
                    return (
                      <TouchableOpacity
                        key={b.id}
                        style={[styles.binderChip, on && styles.binderChipOn]}
                        onPress={() => toggleBinder(b.id)}
                        activeOpacity={0.85}
                      >
                        <View style={[styles.checkbox, on && styles.checkboxOn]}>
                          {on && <Icon name="check" size={11} color="#0A0A0C" />}
                        </View>
                        <Text style={styles.binderChipText} numberOfLines={1}>{b.name}</Text>
                        <Text style={styles.binderChipMeta}>{b.item_count}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </>
          )}
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
    color: Colors.bg,
  },
  saveBtnTextDisabled: { color: 'rgba(10,10,12,0.5)' },

  avatarBlock: { alignItems: 'center', gap: 12, marginBottom: 28, marginTop: 8 },
  avatarBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.bg,
  },
  avatarRemove: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    color: Colors.down,
  },
  avatarHint: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    color: Colors.text3,
  },

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

  showcaseDivider: { height: 1, backgroundColor: Colors.line, marginBottom: 22 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleText: { flex: 1 },
  toggleTitle: { fontFamily: FontFamily.bodySemi, fontSize: 14, color: Colors.text },
  toggleSub: { fontFamily: FontFamily.body, fontSize: 12, color: Colors.text3, marginTop: 3, lineHeight: 16 },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 16, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: Radius.md, borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)',
    backgroundColor: 'rgba(255,215,0,0.06)',
  },
  shareText: { fontFamily: FontFamily.mono, fontSize: 12, color: Colors.gold, letterSpacing: 0.4 },
  featureLabel: {
    fontFamily: FontFamily.mono, fontSize: 9, letterSpacing: 1.6,
    color: Colors.text3, marginTop: 22, marginBottom: 12,
  },
  featureEmpty: { fontFamily: FontFamily.body, fontSize: 13, color: Colors.text3 },
  binderList: { gap: 8 },
  binderChip: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.surface,
  },
  binderChipOn: { borderColor: Colors.goldBorder, backgroundColor: 'rgba(255,215,0,0.05)' },
  checkbox: {
    width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: Colors.lineStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  binderChipText: { flex: 1, fontFamily: FontFamily.body, fontSize: 14, color: Colors.text },
  binderChipMeta: { fontFamily: FontFamily.mono, fontSize: 11, color: Colors.text3 },
});
