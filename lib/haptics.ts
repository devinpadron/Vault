// Single haptics vocabulary for the whole app, so feedback intensity stays
// consistent. Fire-and-forget — haptics must never block or throw into UI code.

import * as Haptics from 'expo-haptics';

type HapticKind =
  | 'select'    // tab switches, pickers, toggles, nav taps
  | 'light'     // card taps, minor confirmations
  | 'medium'    // add to collection / wishlist, long-press select
  | 'success'   // completed action (saved, synced, added)
  | 'warning'   // destructive confirm shown
  | 'error';    // failed action

export function haptic(kind: HapticKind = 'select'): void {
  switch (kind) {
    case 'select':
      Haptics.selectionAsync().catch(() => {});
      break;
    case 'light':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      break;
    case 'medium':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      break;
    case 'success':
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      break;
    case 'warning':
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      break;
    case 'error':
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      break;
  }
}
