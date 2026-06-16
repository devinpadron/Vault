import { AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter, useSegments, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import { InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import { SpaceGrotesk_400Regular, SpaceGrotesk_600SemiBold } from '@expo-google-fonts/space-grotesk';
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/lib/auth/AuthContext';
import { addNotificationTapListener } from '@/lib/notifications/push';
import { Colors, FontFamily, Radius, Spacing } from '@/constants/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 60,
    },
  },
});

// React Query's focus heuristics are web-only — wire them to AppState so
// stale queries (notifications, activity, prices) refetch when the app
// returns to the foreground instead of polling while it's backgrounded.
AppState.addEventListener('change', state => {
  focusManager.setFocused(state === 'active');
});

SplashScreen.preventAutoHideAsync();

// Picked up by expo-router as the global error boundary. Without it, an
// uncaught render error white-screens the app (or strands it on the splash
// if the error fires before the first hide).
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <View style={styles.errorRoot}>
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.errorSubtitle}>
        An unexpected error interrupted the app. Your collection is safe — try again.
      </Text>
      {__DEV__ && <Text style={styles.errorDetail}>{error.message}</Text>}
      <TouchableOpacity
        style={styles.errorBtn}
        onPress={retry}
        accessibilityRole="button"
        accessibilityLabel="Try again"
      >
        <Text style={styles.errorBtnText}>TRY AGAIN</Text>
      </TouchableOpacity>
    </View>
  );
}

// Sits inside AuthProvider — coordinates splash hide and auth-based navigation.
// Keeps the splash screen visible until both fonts and auth status are known,
// then navigates to the correct route before revealing any UI.
function AppController({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Route notification taps (foreground + cold start) to the right screen.
  useEffect(() => addNotificationTapListener(), []);

  useEffect(() => {
    if (!fontsLoaded || status === 'loading') return;

    // auth-callback is part of the sign-in flow: it arrives via deep link
    // while the user is still unauthenticated, so it must not be bounced
    // back to the welcome screen before it can process the OAuth tokens.
    // Widened to string: the generated route union only refreshes when the
    // dev server runs, so a fresh checkout wouldn't know the route yet.
    const segment = segments[0] as string | undefined;
    const inAuthFlow = segment === '(auth)' || segment === 'auth-callback';

    if (status === 'unauthenticated' && !inAuthFlow) {
      router.replace('/(auth)/welcome');
    } else if (status === 'authenticated' && inAuthFlow) {
      router.replace('/(tabs)');
    }

    SplashScreen.hideAsync();
  }, [fontsLoaded, status, segments, router]);

  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    SpaceGrotesk_400Regular,
    SpaceGrotesk_600SemiBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });
  // A font-load failure must not strand the app on the splash screen —
  // proceed with system-font fallbacks instead.
  const fontsReady = fontsLoaded || !!fontError;

  // Do NOT hide the splash here — AppController does it once both fonts
  // and auth status are resolved, preventing any intermediate flash.
  if (!fontsReady) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <GestureHandlerRootView style={styles.root}>
          <AppController fontsLoaded={fontsReady} />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="auth-callback" />
            <Stack.Screen name="card/[id]" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="scanner" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="search" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
            <Stack.Screen name="binder/[id]" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="friend/[id]" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="friend-diff" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="notifications" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="activity" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="u/[username]" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="wishlist" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="settings" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="profile" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="profile-edit" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="friends-search" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="friend-requests" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="news" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
          </Stack>
          <StatusBar style="light" />
        </GestureHandlerRootView>
      </AuthProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  errorRoot: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: 12,
  },
  errorTitle: {
    fontFamily: FontFamily.display,
    fontSize: 28,
    color: Colors.text,
    textAlign: 'center',
  },
  errorSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: Colors.text3,
    textAlign: 'center',
    lineHeight: 19,
  },
  errorDetail: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    color: Colors.down,
    textAlign: 'center',
    lineHeight: 14,
  },
  errorBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.glass,
  },
  errorBtnText: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 1.6,
    color: Colors.text2,
  },
});
