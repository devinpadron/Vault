// Public showcase profile. Opt-in, shareable via vault://u/<username> (and the
// https://vault.app/u/<username> universal link once the AASA file is hosted).
// Read-only hero + the binders the user chose to feature. RLS allows public
// reads, so this works for non-friends and logged-out viewers.

import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import { usePublicShowcase, avatarFor, ShowcaseBinder } from '@/lib/api/profiles';
import { useAuth } from '@/lib/auth/AuthContext';
import { Colors, Gradients, FontFamily, NavButtonStyle, Radius, Spacing } from '@/constants/theme';

export default function ShowcaseScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const insets = useSafeAreaInsets();
  const { status } = useAuth();
  const { data, isLoading, isError, error, refetch } = usePublicShowcase(username);

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.navBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={styles.navBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}>
            <Icon name="chevron-left" size={18} color={Colors.text} />
          </TouchableOpacity>
        </View>

        {isError ? (
          <View style={styles.center}>
            <ErrorPanel message="Couldn't load this profile" error={error as Error} onRetry={refetch} />
          </View>
        ) : isLoading ? (
          <View style={styles.center}><Text style={styles.muted}>Loading…</Text></View>
        ) : !data ? (
          <View style={styles.center}>
            <Text style={styles.muted}>This showcase isn&apos;t available.</Text>
          </View>
        ) : (
          <>
            <View style={styles.hero}>
              <LinearGradient
                colors={Gradients.profileRing}
                start={{ x: 0.15, y: 0 }}
                end={{ x: 0.85, y: 1 }}
                style={styles.ringOuter}
              >
                <View style={styles.ringGap}>
                  <Avatar colors={avatarFor(data.profile.id)} uri={data.profile.avatar_url} size={88} />
                </View>
              </LinearGradient>
              <Text style={styles.name}>{data.profile.display_name?.trim() || data.profile.username}</Text>
              <Text style={styles.handle}>@{data.profile.username.toUpperCase()}</Text>
              {data.profile.bio ? <Text style={styles.bio}>{data.profile.bio}</Text> : null}
            </View>

            <View style={styles.body}>
              <Text style={styles.sectionLabel}>FEATURED BINDERS</Text>
              {data.binders.length === 0 ? (
                <Text style={styles.muted}>No binders featured yet.</Text>
              ) : (
                <View style={styles.list}>
                  {data.binders.map(b => (
                    <ShowcaseRow key={b.id} binder={b} ownerId={data.profile.id} />
                  ))}
                </View>
              )}

              {status !== 'authenticated' && (
                <TouchableOpacity style={styles.cta} onPress={() => router.replace('/(tabs)')}>
                  <Text style={styles.ctaText}>Open in Vault</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ShowcaseRow({ binder, ownerId }: { binder: ShowcaseBinder; ownerId: string }) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push(`/binder/${binder.id}?ownerId=${ownerId}`)}
      activeOpacity={0.85}
    >
      <LinearGradient colors={binder.tone} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={styles.thumb} />
      <View style={styles.rowInfo}>
        <Text style={styles.rowName}>{binder.name}</Text>
        <Text style={styles.rowMeta}>{binder.item_count} {binder.item_count === 1 ? 'CARD' : 'CARDS'}</Text>
      </View>
      <Icon name="chevron-right" size={14} color={Colors.text3} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  navBar: { flexDirection: 'row', paddingHorizontal: Spacing.lg, paddingBottom: 8 },
  navBtn: NavButtonStyle,
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: Spacing.xl },
  muted: { fontFamily: FontFamily.body, fontSize: 13, color: Colors.text3, textAlign: 'center' },

  hero: { alignItems: 'center', paddingHorizontal: Spacing.xl, paddingTop: 8, paddingBottom: 24 },
  ringOuter: { padding: 3, borderRadius: Radius.full, marginBottom: 14 },
  ringGap: { padding: 3, backgroundColor: Colors.bg, borderRadius: Radius.full },
  name: { fontFamily: FontFamily.display, fontSize: 30, color: Colors.text },
  handle: { fontFamily: FontFamily.mono, fontSize: 10, color: Colors.text3, letterSpacing: 2.5, marginTop: 4 },
  bio: { fontFamily: FontFamily.body, fontSize: 13, color: Colors.text2, textAlign: 'center', marginTop: 14, lineHeight: 18 },

  body: { paddingHorizontal: Spacing.xl },
  sectionLabel: { fontFamily: FontFamily.mono, fontSize: 9, letterSpacing: 2, color: Colors.text3, marginBottom: 14 },
  list: { gap: 10 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    borderRadius: Radius.md, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line,
  },
  thumb: { width: 40, height: 54, borderRadius: 6 },
  rowInfo: { flex: 1 },
  rowName: { fontFamily: FontFamily.display, fontSize: 16, color: Colors.text },
  rowMeta: { fontFamily: FontFamily.mono, fontSize: 9, color: Colors.text3, letterSpacing: 1.4, marginTop: 3 },
  cta: {
    marginTop: 28, paddingVertical: 14, borderRadius: Radius.md,
    backgroundColor: Colors.gold, alignItems: 'center',
  },
  ctaText: { fontFamily: FontFamily.bodySemi, fontSize: 14, color: Colors.bg },
});
