import { useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { Colors, FontFamily, Radius, Spacing } from '@/constants/theme';

// `vault://` is the scheme configured in app.json. We use a flat callback
// path (no expo-router groups) so the URL stays clean for Supabase's
// allowed-redirect-URL check. Supabase appends tokens in the URL fragment.
const REDIRECT_URL = Linking.createURL('auth-callback');
if (__DEV__) console.log('[auth] OAuth redirect URL =', REDIRECT_URL);

export default function WelcomeScreen() {
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);

  // ── Apple ────────────────────────────────────────────────────────────────
  async function signInWithApple() {
    setBusy('apple');
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error('Apple returned no identity token.');
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) throw error;
      // AuthContext picks up the new session via onAuthStateChange and the
      // root layout redirects to /(tabs).
    } catch (e) {
      // Apple throws `ERR_REQUEST_CANCELED` when the user cancels — silent there.
      const code = (e as { code?: string })?.code;
      if (code !== 'ERR_REQUEST_CANCELED' && code !== 'ERR_CANCELED') {
        Alert.alert('Sign in failed', errorMessage(e));
      }
    } finally {
      setBusy(null);
    }
  }

  // ── Google ───────────────────────────────────────────────────────────────
  // Uses Supabase's hosted OAuth via expo-web-browser. The web flow handles
  // the Google consent screen and redirects back to vault://(auth)/welcome
  // with a session in the URL fragment.
  async function signInWithGoogle() {
    setBusy('google');
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: REDIRECT_URL,
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;
      if (!data?.url) throw new Error('Supabase did not return an OAuth URL.');

      const result = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT_URL);

      if (result.type === 'success' && result.url) {
        // Pull the tokens out of the redirect URL fragment and stash the session.
        const parsed = Linking.parse(result.url);
        const fragment = (result.url.split('#')[1] ?? '');
        const params = new URLSearchParams(fragment);
        const access_token  = params.get('access_token')  ?? (parsed.queryParams?.access_token as string | undefined);
        const refresh_token = params.get('refresh_token') ?? (parsed.queryParams?.refresh_token as string | undefined);
        if (!access_token || !refresh_token) {
          throw new Error('OAuth response missing tokens.');
        }
        const { error: setErr } = await supabase.auth.setSession({ access_token, refresh_token });
        if (setErr) throw setErr;
      }
      // result.type === 'cancel' or 'dismiss' — silent fall-through.
    } catch (e) {
      Alert.alert('Sign in failed', errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['rgba(255,215,0,0.06)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.logo}>THE VAULT</Text>
          <Text style={styles.tagline}>Your collection. Your vault.</Text>
        </View>

        <View style={styles.actions}>
          {Platform.OS === 'ios' && (
            <TouchableOpacity
              style={styles.appleBtn}
              onPress={signInWithApple}
              activeOpacity={0.85}
              disabled={busy !== null}
            >
              <Ionicons name="logo-apple" size={20} color="#000" />
              <Text style={styles.appleBtnText}>
                {busy === 'apple' ? 'Signing in…' : 'Continue with Apple'}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.googleBtn}
            onPress={signInWithGoogle}
            activeOpacity={0.85}
            disabled={busy !== null}
          >
            <Ionicons name="logo-google" size={18} color={Colors.text} />
            <Text style={styles.googleBtnText}>
              {busy === 'google' ? 'Signing in…' : 'Continue with Google'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.legal}>
            By continuing you agree to our Terms of Service and Privacy Policy.
          </Text>
        </View>
      </View>
    </View>
  );
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e ?? 'Unknown error');
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: '35%',
    paddingBottom: 48,
  },
  hero: {
    alignItems: 'center',
    gap: 14,
  },
  logo: {
    fontFamily: FontFamily.display,
    fontSize: 48,
    color: Colors.gold,
    letterSpacing: 2,
  },
  tagline: {
    fontFamily: FontFamily.body,
    fontSize: 16,
    color: Colors.text2,
  },
  actions: {
    width: '100%',
    gap: 12,
    alignItems: 'center',
  },
  appleBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 15,
    borderRadius: Radius.md,
    backgroundColor: '#fff',
  },
  appleBtnText: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 15,
    color: '#000',
  },
  googleBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 15,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.lineStrong,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  googleBtnText: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 15,
    color: Colors.text,
  },
  legal: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: Colors.text3,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 4,
  },
});
