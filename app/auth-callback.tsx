import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { parseOAuthRedirect } from '@/lib/auth/parseOAuthRedirect';
import { Colors } from '@/constants/theme';

// Landing route for the vault://auth-callback OAuth redirect. The normal flow
// never reaches it — openAuthSessionAsync intercepts the redirect inside
// welcome.tsx — but some Android browsers hand the deep link to the OS
// instead, which routes here. Without this file that lands on "Unmatched
// route" and the sign-in is lost.
export default function AuthCallbackScreen() {
  const router = useRouter();
  const url = Linking.useURL();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current || !url) return;
    const tokens = parseOAuthRedirect(url);
    if (!tokens) return;
    handled.current = true;
    supabase.auth
      .setSession(tokens)
      .then(({ error }) => {
        if (error) throw error;
        router.replace('/(tabs)');
      })
      .catch(() => router.replace('/(auth)/welcome'));
  }, [url, router]);

  // If no tokens ever arrive (manual navigation, malformed redirect), don't
  // strand the user on a spinner.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!handled.current) router.replace('/(auth)/welcome');
    }, 8000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <View style={styles.root}>
      <ActivityIndicator color={Colors.gold} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
