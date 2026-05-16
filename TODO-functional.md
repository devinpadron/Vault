# PokeVault — Functional App Roadmap

Current state as of 2026-05-15. Work through sections top-to-bottom; earlier ones unblock later ones.

---

## Codebase context

- **Framework**: Expo SDK 54, React Native 0.81.5, TypeScript strict mode
- **Routing**: Expo Router v6. Screens in `app/`. Tabs in `app/(tabs)/`. Stack modals in `app/_layout.tsx`.
- **Data fetching**: `@tanstack/react-query`. `QueryClientProvider` wraps app in `app/_layout.tsx`.
- **Card data source**: Supabase (`cards` table + joins to `expansions`, `card_images`, `card_variants`, `card_prices_current`). Wrapper: `useCard`, `useSearchCards`, etc. in `lib/api/cards.ts`.
- **Pricing**: `card_prices_current` via `getCardPricing(cardId)` in `lib/api/pricing.ts`.
- **Local persistence**: `expo-sqlite` via `lib/db/database.ts` (singleton `getDb()`). Tables: `collection_cards`, `binders`, `binder_cards`, `wishlist_cards`.
- **Auth**: `lib/auth/AuthContext.tsx` (`useAuth`) + `lib/auth/storage.ts` (SecureStore).
- **Theme tokens**: `constants/theme.ts` — always use `Colors`, `FontFamily`, `Spacing`, `Radius`.
- **Mock data** (still referenced): `data/mock.ts` exports `MOCK_DATA`. `app/scanner.tsx` still uses `MOCK_DATA.cards[0]`. `lib/api/friends.ts` still uses `MOCK_DATA.friends`. Delete `data/mock.ts` only after both are replaced.

---

## Section 0 — Seed the database (required before anything works)

The schema exists in Supabase but the tables are empty. The app will show blank states until this runs.

- [ ] Set the Edge Function secrets so the deployed sync worker can run:
  ```bash
  supabase secrets set SCRYDEX_API_KEY=... SCRYDEX_TEAM_ID=... --project-ref eibnjwxcmgrtvhcmyhef
  ```
- [ ] Run the initial seed (EN catalog, ~20–30 min):
  ```bash
  cd scripts
  node --env-file=.env seed-catalog.mjs --language EN
  ```
- [ ] Set up a daily `pg_cron` job (Supabase dashboard → Database → Cron) that calls the `prices` phase of the `sync` Edge Function each morning. Suggested schedule: `0 9 * * *` (09:00 UTC). The body: `{"phase":"prices","page":1}`. Chain pages using the returned `nextPage` cursor.
- [ ] Set up a second daily cron for the `history` phase (append-only price snapshots). Suggested: `0 10 * * *`. Same cursor-chaining pattern.

---

## Section 1 — Auth (partially done)

**What's already built**: `AuthProvider`, `useAuth`, `storage.ts`, `AppController` (nav gating), `app/(auth)/_layout.tsx`, `app/(auth)/welcome.tsx` (mock Apple/Google SSO buttons).

**What's missing**:

### 1a — Replace mock auth with real OAuth or email/password

The welcome screen currently calls `login('mock-token-...', { name: 'Trainer', ... })` and never asks for a name. The user's name is always "Trainer". Two viable paths:

**Path A — Supabase OAuth (Apple + Google)**: Replace the `signInWith()` mock in `welcome.tsx` with real Supabase OAuth calls. In `lib/supabase.ts`, enable `autoRefreshToken: true` and `persistSession: true`. In `welcome.tsx`:
```ts
import { supabase } from '@/lib/supabase';
await supabase.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo: ... } });
```
On successful sign-in, build a `User` from the Supabase session and call `login(session.access_token, user)`.

**Path B — Email/password (simpler, no OAuth setup)**: Create `app/(auth)/signup.tsx` and `app/(auth)/login.tsx`. Use `supabase.auth.signUp({ email, password })` and `supabase.auth.signInWithPassword({ email, password })`. On success, call `login(session.access_token, user)`.

Either path: after real auth is working, delete the `Date.now().toString(36)` UUID hack and the `mock-token-` prefix from welcome.tsx.

### 1b — Remove debug log from Home screen

In `app/(tabs)/index.tsx` line 26: remove `console.log('Featured card:', featured)`.

### 1c — Bell button on Home

In `app/(tabs)/index.tsx`, the bell `TouchableOpacity` (top-right) has no `onPress` and shows a gold badge that's always visible. Replace with `onPress={() => router.push('/profile')}` and remove the always-on badge dot (it should only show when there are real notifications).

---

## Section 2 — Local persistence (done — verify and clean up)

The SQLite layer is fully implemented. Collection, binders, wishlist all read/write from `pokevault.db`. This section is done except for two loose ends:

- [ ] **Wishlist hooks exist but aren't wired to the UI**. In `app/card/[id].tsx`, the heart icon (`<Icon name="heart">`) in the nav bar has no `onPress` and doesn't reflect wishlist state. Import `useIsWishlisted`, `useAddToWishlist`, `useRemoveFromWishlist` from `lib/db/wishlist.ts` and wire them. When `isWishlisted`, tint the icon `Colors.gold`. On press: toggle.
- [ ] **Share on binder open** (`app/binder/[id].tsx`) has the "Share binder" button rendering text but no `onPress`. Add: `onPress={() => Share.share({ message: \`Check out my binder "${binder.name}" — ${binderCards.length} cards on PokeVault\` })}`.
- [ ] **Menu on binder open** — the three-dot menu icon has no action. Add: `ActionSheetIOS.showActionSheetWithOptions` (or `Alert.alert` on Android) with "Rename" and "Delete binder" options. Rename: prompt for new name, run `UPDATE binders SET name = ? WHERE id = ?`, invalidate `['binders']`. Delete: call `useDeleteBinder` (already in `lib/api/binders.ts`), then `router.back()`.

---

## Section 3 — Search (done — one gap)

Search queries Supabase, filter pills are wired, infinite scroll works, sort options work. The only missing piece:

- [ ] **Recent searches** — the search screen currently shows no recent searches (the hardcoded list was removed but AsyncStorage replacement was never added). On mount: `AsyncStorage.getItem('recent_searches')` → parse `string[]`. When user taps a result and navigates to it: prepend the query string (max 5, no duplicates). Show an `×` button next to each that removes it. Use `@react-native-async-storage/async-storage` (already in `package.json`).

---

## Section 4 — Profile screen

No profile screen exists. The bell/profile button on Home currently does nothing (Section 1c fixes the `onPress`; this section builds the destination).

- [ ] Create `app/profile.tsx`. Register it in `app/_layout.tsx` as `<Stack.Screen name="profile" options={{ presentation: 'modal', headerShown: false }} />`.
- [ ] Layout: safe-area scroll view, `Colors.bg` background.
  - **Header**: `Avatar` component (from `components/ui/Avatar.tsx`) with `user.avatar` colors, size 80. Display name in `FontFamily.display` 28px. Handle in `FontFamily.mono` 11px `Colors.text3`.
  - **Stats row**: Total value (`useCollectionCards()` sum), card count, binder count (`useBinders().length`). Same style as `app/friend/[id].tsx` stats row.
  - **Account section**: `Colors.surface` card with `Colors.line` border. Editable `TextInput` rows for Name and Handle. Read-only row for Email. Gold "Save changes" button that calls `saveAuth(token, updatedUser)` from `lib/auth/storage.ts` then updates context state.
  - **Sign out**: Red-tinted `TouchableOpacity` at the bottom that calls `logout()`. Auth gating in `app/_layout.tsx` redirects automatically to `/(auth)/welcome` after logout.

---

## Section 5 — Fix remaining hardcoded values

Small isolated fixes. None require a backend.

- [ ] **Scanner confidence** — `app/scanner.tsx` line 39: replace `MOCK_DATA.cards[0]` with a card from `useFeaturedCard()` or `useCard()` as a placeholder until real recognition exists. Replace the hardcoded `'97.4% · MATCH'` string with `const [confidence] = useState(() => (91 + Math.random() * 8).toFixed(1))`. This also removes the last `MOCK_DATA` reference; delete `data/mock.ts` once done.
- [ ] **Friend profile card count** — `app/friend/[id].tsx`: replace the hardcoded `'184'` with `String(friend.binders * 22)`.
- [ ] **Card detail price source labels** — `app/card/[id].tsx`: the three price comparison rows use fake multipliers and fabricated source labels. Rename to `'EST. EBAY'`, `'EST. TCGPLAYER'`, `'EST. PSA 10'` and add a small `(estimated)` caption in `Colors.text3` below the row.

---

## Section 6 — Wire remaining dead-end buttons

Every tappable element that silently does nothing must either navigate somewhere, trigger a data change, or show a "coming soon" message.

- [ ] **Share on card detail** — the send icon in the nav bar of `app/card/[id].tsx` has no `onPress`. Add: `Share.share({ message: \`${card.name} ${card.variant} · ${card.set} · $${fmt(card.value)} — PokeVault\` })`.
- [ ] **Trade button on friend rows** — `app/(tabs)/friends.tsx`: the TRADE button next to each friend row should `router.push('/(tabs)/market')`.
- [ ] **Friend profile buttons** — `app/friend/[id].tsx`: Trade button → `router.push('/(tabs)/market')`. Message button → `Alert.alert('Coming soon', 'Direct messaging will be available in a future update.')`. Menu icon → `Alert.alert` with "Remove friend" (destructive, shows "requires a backend") and "Cancel".
- [ ] **Watch button in Market Live** — `app/(tabs)/market.tsx`: add `const [watching, setWatching] = useState(false)`. When watching, change button border to `Colors.gold` and label to `'Watching ✓'`.
- [ ] **Place Bid in Market Live** — `app/(tabs)/market.tsx`: `onPress: () => Alert.alert('Place bid', \`Confirm bid of $\${fmt(bid + 25)}?\`, ...)`. On confirm, increment `bid` state by 25.
- [ ] **VIEW ALL on Home news** — `app/(tabs)/index.tsx`: the "VIEW ALL →" label has no `onPress`. Create `app/news.tsx` — full-screen ScrollView showing all news items from `useNews()`, registered in `app/_layout.tsx`. Set `onPress={() => router.push('/news')}`.
- [ ] **Add to collection from Scanner** — `app/scanner.tsx`: the "Add to collection" button in the `identified` phase has no `onPress`. Import `useAddToCollection` from `lib/db/collection.ts`. `onPress`: call `addToCollection(IDENTIFIED_CARD)`, then `Alert.alert('Added', IDENTIFIED_CARD.name)`, then `router.back()`.

---

## Section 7 — Camera Scanner (real feed)

The scanner is a fully animated demo — there is no camera feed. This section adds a real live view; card recognition still uses a mock result until a recognition API is integrated.

- [ ] Run `npx expo install expo-camera`.
- [ ] In `app.json`, inside the `ios` object, add: `"NSCameraUsageDescription": "PokeVault uses the camera to scan and identify your Pokémon cards."`.
- [ ] In `app/scanner.tsx`, import `CameraView` and `useCameraPermissions` from `expo-camera`.
- [ ] Add permission check before the main render. If `!permission.granted`: show a centered `Colors.bg` view with "Camera access is required to scan cards" and a gold "Allow Camera" button calling `requestPermission()`. If `permission.canAskAgain === false`, change button to "Open Settings" and call `Linking.openSettings()`.
- [ ] In the scanning phase render, add `<CameraView style={StyleSheet.absoluteFill} facing="back" />` as the first child of the root View, behind the overlay and reticle.

---

## Section 8 — Notifications (groundwork)

- [ ] Run `npx expo install expo-notifications expo-device`.
- [ ] Create `lib/notifications/register.ts` that exports `requestNotificationPermission(): Promise<boolean>`. Use `Notifications.getPermissionsAsync()` / `requestPermissionsAsync()`, guard with `Device.isDevice` check (simulators can't receive push).
- [ ] In `app/_layout.tsx`, call `requestNotificationPermission()` in a `useEffect` that fires once when `status === 'authenticated'`. Fire-and-forget; don't block rendering.
- [ ] Create `app/notifications.tsx` — full-screen with a back button, title "Notifications" in `FontFamily.display`, and an empty state (bell icon, "No notifications yet"). Register in `app/_layout.tsx` as a stack screen with `headerShown: false`.

---

## Done criteria

The app is ready for real user testing when:

1. A new user can sign in (real OAuth or email/password) and be greeted by name.
2. A user can search for any real Pokémon card and see real results with images and prices.
3. A user can tap a card, view its real data, and add it to their collection. The collection persists after app restart.
4. A user can create a binder, add cards to it, and see those cards in the sleeve grid.
5. Every button in the app navigates, triggers a data change, or shows a "coming soon" message.
6. The home screen shows the user's real name, the current date, and stats from their actual collection.
7. The camera opens in the scanner on a real device.
8. `grep -rn "MOCK_DATA" app/` returns no results.
9. `npx tsc --noEmit` returns zero errors.
