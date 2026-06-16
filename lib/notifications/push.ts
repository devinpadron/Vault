// Expo push registration + tap routing. Push requires a real device build
// (not Expo Go) and is a no-op on simulators / web. The token is upserted into
// the `device_tokens` table for server-side push delivery. Tap handling
// deep-links to the relevant screen via the payload's `data`
// (e.g. { actor_id } → /friend/[id]).

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';

// Foreground presentation: show a banner + bump the badge even while the app
// is open, so a notification arriving mid-session is still visible.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

const projectId =
  Constants.expoConfig?.extra?.eas?.projectId ??
  Constants.easConfig?.projectId;

/**
 * Request permission, fetch the Expo push token, and upsert it for `userId`.
 * Safe to call on every sign-in — it dedups on the unique token. Returns the
 * token, or null when push isn't available (simulator, denied, web).
 */
export async function registerPushToken(userId: string): Promise<string | null> {
  if (!Device.isDevice) return null;        // simulators have no push token
  if (Platform.OS === 'web') return null;

  try {
    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      const req = await Notifications.requestPermissionsAsync();
      granted = req.granted;
    }
    if (!granted) return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    if (!token) return null;

    // onConflict on the unique token column re-points the row at this user if
    // the device was previously signed in as someone else.
    const { error } = await supabase
      .from('device_tokens')
      .upsert(
        { user_id: userId, expo_push_token: token, platform: Platform.OS },
        { onConflict: 'expo_push_token' },
      );
    if (error && __DEV__) console.warn('[push] token upsert failed:', error.message);

    return token;
  } catch (err) {
    if (__DEV__) console.warn('[push] registration failed:', err);
    return null;
  }
}

/** Remove this device's token on sign-out so the user stops getting pushes. */
export async function unregisterPushToken(): Promise<void> {
  if (!Device.isDevice || Platform.OS === 'web') return;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    if (token) {
      await supabase.from('device_tokens').delete().eq('expo_push_token', token);
    }
  } catch (err) {
    if (__DEV__) console.warn('[push] unregister failed:', err);
  }
}

/** Route a notification payload to the right screen. */
function routeFromData(data: Record<string, unknown> | undefined) {
  if (!data) return;
  if (typeof data.actor_id === 'string') {
    router.push(`/friend/${data.actor_id}`);
  }
}

/**
 * Wire the tap listener. Call once from a mounted component; returns an
 * unsubscribe. Also handles the cold-start case where the app was launched
 * by tapping a notification.
 */
export function addNotificationTapListener(): () => void {
  Notifications.getLastNotificationResponseAsync().then(resp => {
    const data = resp?.notification.request.content.data as
      | Record<string, unknown>
      | undefined;
    routeFromData(data);
  });

  const sub = Notifications.addNotificationResponseReceivedListener(resp => {
    const data = resp.notification.request.content.data as
      | Record<string, unknown>
      | undefined;
    routeFromData(data);
  });
  return () => sub.remove();
}
