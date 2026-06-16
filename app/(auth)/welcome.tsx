import { useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/AuthContext';
import { parseOAuthRedirect } from '@/lib/auth/parseOAuthRedirect';
import { Colors, FontFamily, Radius, Spacing } from '@/constants/theme';

// `vault://` is the scheme configured in app.json. We use a flat callback
// path (no expo-router groups) so the URL stays clean for Supabase's
// allowed-redirect-URL check. Supabase appends tokens in the URL fragment.
const REDIRECT_URL = Linking.createURL('auth-callback');
if (__DEV__) console.log('[auth] OAuth redirect URL =', REDIRECT_URL);

// Served from docs/legal/ via GitHub Pages (repo settings → Pages → main,
// /docs folder). Apple's review checks that these resolve.
const TERMS_URL   = 'https://devinpadron.github.io/Vault/legal/terms.html';
const PRIVACY_URL = 'https://devinpadron.github.io/Vault/legal/privacy.html';

export default function WelcomeScreen() {
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);
  const { signedOutReason, clearSignedOutReason } = useAuth();

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
        const tokens = parseOAuthRedirect(result.url);
        if (!tokens) {
          throw new Error('OAuth response missing tokens.');
        }
        const { error: setErr } = await supabase.auth.setSession(tokens);
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

        {signedOutReason === 'expired' && (
          <View style={styles.expiredNotice}>
            <Text style={styles.expiredText}>
              Your session expired — sign in again to continue.
            </Text>
            <TouchableOpacity
              onPress={clearSignedOutReason}
              accessibilityLabel="Dismiss expiration notice"
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={styles.expiredDismiss}>×</Text>
            </TouchableOpacity>
          </View>
        )}

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
            By continuing you agree to our{' '}
            <Text
              style={styles.legalLink}
              onPress={() => WebBrowser.openBrowserAsync(TERMS_URL).catch(() => {})}
              accessibilityRole="link"
              accessibilityLabel="Open Terms of Service"
            >
              Terms of Service
            </Text>
            {' '}and{' '}
            <Text
              style={styles.legalLink}
              onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL).catch(() => {})}
              accessibilityRole="link"
              accessibilityLabel="Open Privacy Policy"
            >
              Privacy Policy
            </Text>.
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
    backgroundColor: Colors.text,
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
    backgroundColor: Colors.glass,
  },
  googleBtnText: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 15,
    color: Colors.text,
  },
  expiredNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.3)',
    backgroundColor: Colors.goldFaint,
    marginBottom: 20,
  },
  expiredText: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: Colors.text,
    lineHeight: 17,
  },
  expiredDismiss: {
    fontFamily: FontFamily.display,
    fontSize: 22,
    color: Colors.text3,
    paddingHorizontal: 6,
  },
  legal: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: Colors.text3,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 4,
  },
  legalLink: {
    color: Colors.text2,
    textDecorationLine: 'underline',
  },
});
