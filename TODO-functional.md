# PokeVault — Functional App Roadmap

This file replaces speculative feature planning with a ground-up audit of what is currently broken, fake, or missing. Every item here is required before the app can be handed to a real user for testing. Complete each section top-to-bottom before starting the next — earlier sections unblock later ones.

---

## Codebase context (read before starting any task)

- **Framework**: Expo SDK 54, React Native 0.81.5, TypeScript strict mode
- **Routing**: Expo Router v6, file-based. Screens live in `app/`. Tab screens in `app/(tabs)/`. Stack modals are registered in `app/_layout.tsx`.
- **Data fetching**: `@tanstack/react-query`. `QueryClientProvider` wraps the app in `app/_layout.tsx`. All hooks use `useQuery` from `@tanstack/react-query`.
- **Card data source**: TCGDex public REST API. Base URL `https://api.tcgdex.net/v2/en`. Wrapper: `apiFetch<T>(path, params?)` in `lib/api/client.ts`.
- **API hooks**: `lib/api/cards.ts`, `lib/api/binders.ts`, `lib/api/friends.ts`, `lib/api/market.ts`, `lib/api/news.ts`
- **Mock data** (still in use — target for removal): `data/mock.ts` exports `MOCK_DATA` with fictional friends, binders, news, listings, priceHistory, and cards.
- **Theme tokens**: `constants/theme.ts` — use `Colors`, `FontFamily`, `Spacing`, `Radius` everywhere. Never use raw hex values or hardcoded font names.
- **Component library**: `components/cards/`, `components/charts/`, `components/ui/`. Key components: `Card3D`, `CardThumb`, `SkeletonCard`, `SkeletonRow`, `ErrorPanel`, `Avatar`, `Icon`.
- **Types**: `types/index.ts` — `Card`, `Binder`, `Friend`, `Listing`, `NewsItem`, `AppData`.

---

## Section 1 — Authentication & User Identity

**Why this comes first**: Every user-specific screen (home greeting, collection, binders, profile stats) is currently showing hardcoded placeholder data because there is no concept of who is using the app. Auth is the foundation every other section builds on.

### 1a — Add User type and install storage library

- [ ] Open `types/index.ts`. Add a new `User` interface after the existing types:
  ```ts
  export interface User {
    id: string;
    name: string;
    handle: string;
    email: string;
    avatar: [string, string]; // gradient color pair, same shape as Friend.avatar
  }
  ```
- [ ] Run `npx expo install expo-secure-store` to install the secure token storage library.
- [ ] Create `lib/auth/storage.ts`. This file is the only place in the app that should ever touch SecureStore. Export three async functions:
  - `saveAuth(token: string, user: User): Promise<void>` — stores token under key `'auth_token'` and JSON-stringified user under key `'auth_user'`
  - `loadAuth(): Promise<{ token: string; user: User } | null>` — reads both keys; returns null if either is missing
  - `clearAuth(): Promise<void>` — deletes both keys

### 1b — AuthContext

- [ ] Create `lib/auth/AuthContext.tsx`. This file provides auth state to the entire component tree.
  - Define `AuthState`:
    ```ts
    type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';
    interface AuthState {
      status: AuthStatus;
      user: User | null;
      token: string | null;
    }
    ```
  - Create a React context and `AuthProvider` component. On mount, call `loadAuth()` from `lib/auth/storage.ts`. While the async read is in progress, `status` is `'loading'`. If a token is found, set `status: 'authenticated'`. Otherwise `'unauthenticated'`.
  - Export `useAuth()` hook that returns `AuthState` plus two mutators:
    - `login(token: string, user: User): Promise<void>` — calls `saveAuth`, then updates context state to authenticated
    - `logout(): Promise<void>` — calls `clearAuth`, then sets state to unauthenticated
- [ ] In `app/_layout.tsx`, import `AuthProvider` and wrap the entire tree with it, outside `QueryClientProvider` (order: `AuthProvider` → `QueryClientProvider` → `GestureHandlerRootView`).

### 1c — Navigation gating

- [ ] In `app/_layout.tsx`, import `useAuth`. Add logic before the tab layout renders:
  - If `status === 'loading'`: return a `View` with `flex: 1, backgroundColor: Colors.bg` containing a centered `ActivityIndicator` in `Colors.gold`.
  - If `status === 'unauthenticated'`: return `<Redirect href="/(auth)/welcome" />` (import `Redirect` from `expo-router`).
  - If `status === 'authenticated'`: render the normal tab layout as currently written.

### 1d — Auth screens

- [ ] Create `app/(auth)/_layout.tsx` — a simple Stack layout with no header:
  ```tsx
  import { Stack } from 'expo-router';
  export default function AuthLayout() {
    return <Stack screenOptions={{ headerShown: false }} />;
  }
  ```
- [ ] Create `app/(auth)/welcome.tsx`. This is the first screen unauthenticated users see. Layout: full screen with `Colors.bg` background. Center-aligned: the text "POKEVAULT" in `FontFamily.display` at 48px in `Colors.gold`, a subtitle "Your collection. Your vault." in `FontFamily.body` at 16px in `Colors.text2`, then two buttons stacked vertically: primary gold button "Create account" → `router.push('/(auth)/signup')`, ghost button "Sign in" → `router.push('/(auth)/login')`. No mock data needed.
- [ ] Create `app/(auth)/signup.tsx`. Form fields: Full name, Email, Password (all using `TextInput` styled to match the app theme — dark background, `Colors.line` border, `FontFamily.body` font). A gold "Create account" CTA at the bottom. On press:
  1. Validate that all fields are non-empty; show an inline error message if not.
  2. Generate a UUID user ID: `const id = Date.now().toString(36) + Math.random().toString(36).slice(2)`.
  3. Build a `User` object: `{ id, name, handle: '@' + name.toLowerCase().replace(/\s+/g, ''), email, avatar: ['#FFD700', '#FF7A3A'] }`.
  4. Call `login('mock-token-' + id, user)` from `useAuth()`.
  5. After `login` resolves, navigate to `/(tabs)` using `router.replace('/(tabs)')`.
  - Add a "Already have an account? Sign in" link at the bottom that calls `router.replace('/(auth)/login')`.
- [ ] Create `app/(auth)/login.tsx`. Form fields: Email, Password. On press:
  1. Call `loadAuth()` from `lib/auth/storage.ts` to get stored credentials.
  2. If the stored user's email matches the input email, call `login()` with the stored token and user. Otherwise show "Invalid email or password" inline error.
  3. Navigate to `/(tabs)` on success.
  - Add a "Don't have an account? Sign up" link.

### 1e — Replace hardcoded identity in the UI

- [ ] Open `app/(tabs)/index.tsx`. Import `useAuth` from `lib/auth/AuthContext`.
- [ ] Replace the static string `'05 · 10 · SAT'` with a dynamic date. Use:
  ```ts
  const now = new Date();
  const dateLabel = now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', weekday: 'short' }).toUpperCase();
  ```
- [ ] Replace the hardcoded greeting and name. Compute greeting based on hour:
  ```ts
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const { user } = useAuth();
  ```
  In JSX: `{greeting},{'\n'}<Text style={styles.greetingName}>{user?.name ?? 'Trainer'}</Text>`
- [ ] Open `app/friend/[id].tsx`. In the stats row, the card count `'184'` is hardcoded. Replace it with `String(friend.binders * 22)` as an estimate until a real cards-per-friend API exists. This is clearly imprecise but avoids showing the same static number for every friend.

---

## Section 2 — Local Data Persistence

**Why this comes second**: The "Add to binder" button in card detail currently does an optimistic React Query update that resets on reload. Binder creation does nothing. The user's collection doesn't exist anywhere. All of this requires a local database.

### 2a — SQLite setup

- [ ] Run `npx expo install expo-sqlite`.
- [ ] Create `lib/db/database.ts`. This file opens the database once and creates all tables. Export a single function `getDb()` that returns the open `SQLiteDatabase` instance (use a module-level variable to ensure it's a singleton). On first open, run:
  ```sql
  CREATE TABLE IF NOT EXISTS collection_cards (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL,
    card_json TEXT NOT NULL,
    added_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS binders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    subtitle TEXT NOT NULL DEFAULT '',
    tone_start TEXT NOT NULL DEFAULT '#1F0E3A',
    tone_end TEXT NOT NULL DEFAULT '#7A6BFF',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS binder_cards (
    id TEXT PRIMARY KEY,
    binder_id TEXT NOT NULL,
    card_id TEXT NOT NULL,
    card_json TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS wishlist_cards (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL,
    card_json TEXT NOT NULL,
    added_at INTEGER NOT NULL
  );
  ```
  Use `db.execAsync()` for the CREATE statements. Import `SQLiteDatabase` from `expo-sqlite`.

### 2b — Collection hooks

- [ ] Create `lib/db/collection.ts`. All functions use `getDb()` from `lib/db/database.ts` and `@tanstack/react-query`.
  - `useCollectionCards()`: `useQuery({ queryKey: ['collection'], queryFn: async () => { const rows = await db.getAllAsync('SELECT card_json FROM collection_cards ORDER BY added_at DESC'); return rows.map(r => JSON.parse(r.card_json) as Card); } })`. Import `Card` from `@/types`.
  - `useIsInCollection(cardId: string)`: `useQuery({ queryKey: ['in-collection', cardId], queryFn: async () => { const row = await db.getFirstAsync('SELECT id FROM collection_cards WHERE card_id = ?', [cardId]); return row !== null; } })`. Returns `boolean`.
  - `useAddToCollection()`: Returns a function `(card: Card) => Promise<void>` that inserts into `collection_cards` with `id = Date.now().toString(36)`, then calls `queryClient.invalidateQueries({ queryKey: ['collection'] })` and `queryClient.invalidateQueries({ queryKey: ['in-collection', card.id] })`.
  - `useRemoveFromCollection()`: Returns a function `(cardId: string) => Promise<void>` that deletes by `card_id` and invalidates the same query keys.

### 2c — Wishlist hooks

- [ ] Create `lib/db/wishlist.ts` with the same pattern as `lib/db/collection.ts` but using the `wishlist_cards` table. Export `useWishlistCards()`, `useIsWishlisted(cardId)`, `useAddToWishlist()`, `useRemoveFromWishlist()`.

### 2d — Binder hooks (replace mock)

- [ ] Replace the contents of `lib/api/binders.ts` entirely. The new version reads from and writes to SQLite, not `MOCK_DATA`.
  - `useBinders()`: Reads all rows from `binders` table ordered by `created_at DESC`. For each binder, reads the first card from `binder_cards` (by `binder_id` and `position = 0`) to use as `cover`. If no cards exist yet, use a placeholder card (create a `PLACEHOLDER_CARD` constant locally with a dark gradient and empty values). Map to `Binder[]`.
  - `useBinder(id: string)`: Reads one binder row by `id`. Returns `Binder | null`.
  - `useBinderCards(binderId: string)`: Reads all rows from `binder_cards WHERE binder_id = ?` ordered by `position`, parses `card_json`, returns `Card[]`.
  - `useCreateBinder()`: Returns `(name: string, toneStart: string, toneEnd: string) => Promise<void>`. Inserts into `binders` table, invalidates `['binders']`.
  - `useAddCardToBinder()`: Returns `(binderId: string, card: Card) => Promise<void>`. Checks for duplicate (skip if card already in binder), finds current max position, inserts into `binder_cards`, invalidates `['binder-cards', binderId]` and `['binders']`.
  - `useDeleteBinder()`: Returns `(id: string) => Promise<void>`. Deletes from `binders` and `binder_cards WHERE binder_id = id`, invalidates `['binders']`.

### 2e — Wire binder creation to the UI

- [ ] Open `app/(tabs)/binders.tsx`. The `+` button currently has no `onPress`. Add state `const [sheetOpen, setSheetOpen] = useState(false)`.
- [ ] Render a bottom sheet `Modal` (same pattern as the add-to-binder sheet in `app/card/[id].tsx`) that contains:
  - A `TextInput` for binder name (styled to match the app theme)
  - A row of 6 color swatches, each being a small `TouchableOpacity` with a `LinearGradient`. The 6 tone pairs are: `['#1F0E3A','#7A6BFF']`, `['#3A0E0E','#FF7A3A']`, `['#0E1F3A','#5FD2FF']`, `['#0E2F1F','#9CFF6E']`, `['#3A2A0E','#FFE03A']`, `['#1F0E2A','#FF7AE0']`. The selected swatch gets a gold border.
  - A gold "Create binder" button at the bottom that calls `useCreateBinder()` with the input name and selected tone, then closes the sheet.
- [ ] After creation, the `useBinders()` query auto-refreshes because React Query's `invalidateQueries` is called inside `useCreateBinder()`.

### 2f — Wire binder cards to screens

- [ ] Open `app/binder/[id].tsx`. Replace the sleeve card source with `useBinderCards(id ?? '')`. Remove the `MOCK_DATA` import and the `apiCards.length >= 9` fallback. If `binderCards` is empty, render a centered `'No cards yet'` message in `Colors.text3` with an "Add cards to your collection" subtitle. If there are cards, show them in the 3×3 grid (only the first 9 per page; pagination can stay as a future improvement).
- [ ] Open `app/card/[id].tsx`. The add-to-binder sheet calls `useAddCardToBinder`. Update the `onPress` handler for each binder row in the sheet:
  1. Call `await addCardToBinder(b.id, card)` (the `card` from `useCard(id)`)
  2. Close the sheet
  3. Show `Alert.alert('Added', \`${card.name} added to ${b.name}\`)` for feedback.

### 2g — Wire collection to card detail

- [ ] Open `app/card/[id].tsx`. Import `useIsInCollection` and `useAddToCollection` from `lib/db/collection.ts`.
- [ ] In the component, call both hooks with `card?.id ?? ''`.
- [ ] In the CTA row (where "Add to binder" is the primary button), add a secondary button to the left:
  - Label: `isInCollection ? 'In collection ✓' : 'Add to collection'`
  - Style: ghost button (border `Colors.line`, transparent bg) when not in collection; gold border and text when already in collection.
  - `onPress`: if not in collection, call `addToCollection(card)`. If already in collection, do nothing (or show a toast that it's already added).

### 2h — Wire collection stats to Home screen

- [ ] Open `app/(tabs)/index.tsx`. Import `useCollectionCards` from `lib/db/collection.ts`. Replace the `STATS` constant:
  ```ts
  const { data: collectionCards = [] } = useCollectionCards();
  const totalValue = collectionCards.reduce((sum, c) => sum + c.value, 0);
  const totalChange = collectionCards.reduce((sum, c) => sum + c.change, 0);
  const cardCount = collectionCards.length;
  ```
- [ ] Replace the three hardcoded `STATS.*` values in the JSX with `totalValue`, `totalChange`, and `cardCount`.
- [ ] If `cardCount === 0`, instead of showing `$0.00` in the stats card, show a prompt: `'Add cards to start tracking your collection'` in `Colors.text3`.
- [ ] Replace `MOCK_DATA.priceHistory` in the `Sparkline` with `useCardPriceHistory('portfolio', '1M', totalValue)` from `lib/api/cards.ts`. This gives a generated sparkline scaled to the real collection total.

---

## Section 3 — Search (Real API)

**Why**: Search currently filters 12 fictional card names. It should search the full TCGDex catalog of thousands of real Pokémon cards.

### 3a — Search API hook

- [ ] Open `lib/api/cards.ts`. Add a new exported hook at the bottom:
  ```ts
  export function useSearchCards(query: string) {
    return useQuery<AppCard[]>({
      queryKey: ['search', query],
      queryFn: async () => {
        const briefs = await apiFetch<CardBrief[]>('/cards', {
          'name': query,
          'pagination:itemsPerPage': '20',
          'pagination:page': '1',
        });
        const full = await fetchFullCards(briefs); // reuse existing helper
        return full.map((c, i) => mapCard(c, i));  // reuse existing mapper
      },
      enabled: query.trim().length >= 2,
      staleTime: 1000 * 60 * 10,
    });
  }
  ```

### 3b — Replace mock search in the screen

- [ ] Open `app/search.tsx`. Remove the `MOCK_DATA` import.
- [ ] Call `const { data: results = [], isFetching, isError, refetch } = useSearchCards(query)` at the top of the component.
- [ ] In the results grid, show `<SkeletonCard width={104} />` (import from `components/ui/SkeletonCard`) for three cells when `isFetching && query.trim().length >= 2` and results are empty. Show `<ErrorPanel onRetry={refetch} />` when `isError`.
- [ ] Remove the hardcoded recent searches array `['Aether Prime', 'Drakorvex Rainbow', 'M. Volkov · Artist', 'PSA 10']`. Replace with `AsyncStorage`:
  - Install `@react-native-async-storage/async-storage` if not already installed (run `npx expo install @react-native-async-storage/async-storage`).
  - On mount, read `AsyncStorage.getItem('recent_searches')` and parse as `string[]`.
  - When the user taps a result card and navigates to it, prepend the searched query to the stored list (max 5 items, no duplicates).
  - Render the stored items in the "Recent" section.
  - Add an `×` button next to each recent item that removes it from the list.

### 3c — Wire active filter pills to search params

- [ ] In `app/search.tsx`, the filter pills (`Name`, `Set/Pack`, `Pokémon`, `Artist`, `Rarity`) currently toggle visual state but don't affect the query. Update `useSearchCards` to accept a second `filter` parameter:
  ```ts
  export function useSearchCards(query: string, filter: string = 'Name')
  ```
  Inside the `queryFn`, map filter to the correct TCGDex param key:
  - `'Name'` → `{ 'name': query }`
  - `'Set/Pack'` → `{ 'set.name': query }`
  - `'Pokémon'` → `{ 'name': query }` (same as Name — TCGDex doesn't distinguish)
  - `'Artist'` → `{ 'illustrator': query }`
  - `'Rarity'` → `{ 'rarity': query }`
- [ ] Pass the first active filter from `activeFilters` state to `useSearchCards(query, activeFilters[0] ?? 'Name')`.

---

## Section 4 — Profile Screen

**Why**: There is no profile or settings screen. The user cannot see their own identity, change their name, or sign out.

### 4a — Create the screen

- [ ] Create `app/profile.tsx`. Register it in `app/_layout.tsx` as a stack screen with `presentation: 'modal'` and `headerShown: false`.
- [ ] Layout (scroll view, matches app dark theme):
  - **Header**: Avatar circle (use `Avatar` component from `components/ui/Avatar.tsx` with `user.avatar` colors, size 80), display name in `FontFamily.display` at 28px, handle in `FontFamily.mono` at 11px `Colors.text3`. Below avatar, a "Edit photo" placeholder link (disabled for now).
  - **Stats row**: Three stats pulled from live hooks — `Total value` from `useCollectionCards()` sum, `Cards` count, `Binders` count from `useBinders()`. Same style as the stats row on the friend profile screen (`app/friend/[id].tsx` lines 53–65).
  - **Account section**: A `Colors.surface` card with border `Colors.line`. Two editable rows: "Name" and "Handle" using `TextInput`. One read-only row: "Email". A gold "Save changes" button that updates `user` in `AuthContext` by calling `saveAuth(token, updatedUser)` then refreshes context state.
  - **Sign out**: A red-tinted `TouchableOpacity` at the bottom ("Sign out") that calls `logout()` from `useAuth()`. After logout completes, the navigation gating in `app/_layout.tsx` will automatically redirect to `/(auth)/welcome`.

### 4b — Entry point

- [ ] Open `app/(tabs)/index.tsx`. The notification bell `TouchableOpacity` currently has no `onPress`. Replace it with a profile avatar button: render `<Avatar colors={user?.avatar ?? ['#FFD700','#FF7A3A']} size={32} />` inside the `TouchableOpacity`. Set `onPress={() => router.push('/profile')}`. Remove the static gold badge dot from the bell icon (it should not show unless there are real unread notifications).

---

## Section 5 — Fix All Remaining Hardcoded Values

**Why**: These are quick, isolated changes that make the app feel like real software instead of a design mockup. None require a backend.

- [ ] **Market listing count** — Open `app/(tabs)/market.tsx`. Replace the static string `'22,418 active'` with a value computed once on mount: `const activeCount = useMemo(() => (Math.floor(Math.random() * 12000) + 18000).toLocaleString(), [])`. This changes each session, which is far less jarring than a frozen number.

- [ ] **Market live — starting bid** — In the `Live` component in `app/(tabs)/market.tsx`, replace `useState(2840)` with `useState(() => Math.floor((lot?.value ?? 2000) * 0.3))` so the starting bid scales with the real card's value. Replace `useState(42)` for seconds with `useState(() => 45 + Math.floor(Math.random() * 30))`.

- [ ] **Market live — lot position** — Replace the hardcoded string `'Current lot · 04 of 12'` with `'Current lot · 01 of 12'`. This is still fake but at least no longer implies you missed the first three lots.

- [ ] **Market live — chat comments** — The `CHAT_COMMENTS` array in `app/(tabs)/market.tsx` uses fictional usernames that match the mock friends. Replace with neutral anonymous handles: `[{ user: '@collector99', msg: 'foil quality is 🔥' }, { user: '@vaultuser', msg: 'hoping for PSA 10' }, { user: '@raredrop', msg: 'fairly priced tbh' }]`. These are still static but no longer cross-reference dead fictional users.

- [ ] **Scanner confidence** — Open `app/scanner.tsx`. Replace the hardcoded `'97.4% · MATCH'` string with a value generated when the identified phase begins: `const [confidence] = useState(() => (91 + Math.random() * 8).toFixed(1))`. Render `\`${confidence}% · MATCH\``. This randomizes each scan session.

- [ ] **Friend profile card count** — Open `app/friend/[id].tsx`. Replace the hardcoded `'184'` with `String(friend.binders * 22)`. This is imprecise but scales with the friend's binder count instead of being constant.

- [ ] **Friend profile binder timestamp** — Replace `'LAST UPDATED 2D AGO'` with `'LAST UPDATED RECENTLY'`. Avoid any specific time claim until real timestamps come from the API.

- [ ] **Card detail price comparison** — Open `app/card/[id].tsx`. The three price rows (`EBAY 30D: value * 0.94`, `TCGPLAYER: value`, `PSA 10: value * 1.8`) use fake multipliers. Rename the labels to make the estimation explicit: `'EST. EBAY'`, `'EST. TCGPLAYER'`, `'EST. PSA 10'`. This is honest — the values are estimates, not live prices. Add a small `(estimated)` caption below the row in `Colors.text3`.

---

## Section 6 — Wire Up All Dead-End Buttons

**Why**: Every tappable element that does nothing destroys user trust. Each button below gets the minimum meaningful action — a real navigation, a confirmation alert, or a functional state change.

- [ ] **Wishlist / heart on card detail** (`app/card/[id].tsx`, heart icon in the nav bar): Import `useIsWishlisted` and `useAddToWishlist` and `useRemoveFromWishlist` from `lib/db/wishlist.ts`. Fill the heart icon when `isWishlisted` is true (use `name="heart-filled"` if the icon exists, or tint it `Colors.gold`). `onPress`: if wishlisted, call `removeFromWishlist(card.id)`; else call `addToWishlist(card)`.

- [ ] **Share on card detail** (`app/card/[id].tsx`, send icon in the nav bar): Use React Native's built-in `Share` API (no extra install needed — `import { Share } from 'react-native'`). `onPress: () => Share.share({ message: \`${card.name} ${card.variant} · ${card.set} · $${fmt(card.value)} — PokeVault\` })`.

- [ ] **Trade icon on card detail** (`app/card/[id].tsx`, trade icon in CTA row): Navigate to the market tab: `router.push('/(tabs)/market')`. This is the closest meaningful action until a real trade flow exists.

- [ ] **Share on binder open** (`app/binder/[id].tsx`, send icon): `Share.share({ message: \`Check out my binder "${binder.name}" — ${sleeveCards.length} cards on PokeVault\` })`.

- [ ] **Menu on binder open** (`app/binder/[id].tsx`, menu icon): Show an `ActionSheetIOS.showActionSheetWithOptions` on iOS (or `Alert.alert` on Android using `Platform.OS`). Options: `'Rename'`, `'Delete binder'`, `'Cancel'`. Rename: show an `Alert.prompt` (iOS) or a separate small modal with a `TextInput` to enter a new name, then call a `useRenameBinder(id)` hook that runs `UPDATE binders SET name = ? WHERE id = ?` and invalidates `['binders']`. Delete: confirm with `Alert.alert`, then call `useDeleteBinder(id)` from `lib/api/binders.ts` and navigate back.

- [ ] **Menu on friend profile** (`app/friend/[id].tsx`, menu icon): `Alert.alert('Options', '', [{ text: 'Remove friend', style: 'destructive', onPress: () => Alert.alert('Coming soon', 'Friend management requires a backend.') }, { text: 'Cancel', style: 'cancel' }])`.

- [ ] **Trade button on friend profile** (`app/friend/[id].tsx`): Navigate to market tab: `router.push('/(tabs)/market')`.

- [ ] **Message button on friend profile** (`app/friend/[id].tsx`): `Alert.alert('Coming soon', 'Direct messaging will be available in a future update.')`.

- [ ] **TRADE button on friend rows** (`app/(tabs)/friends.tsx`): Navigate to market tab: `router.push('/(tabs)/market')`.

- [ ] **Watch button in market live** (`app/(tabs)/market.tsx`): Add `const [watching, setWatching] = useState(false)`. `onPress: () => setWatching(w => !w)`. When `watching`, change the button border to `Colors.gold` and label to `'Watching ✓'`.

- [ ] **Place bid button in market live** (`app/(tabs)/market.tsx`): `onPress: () => Alert.alert('Place bid', \`Confirm bid of $\${fmt(bid + 25)}?\`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Confirm', onPress: () => setBid(b => b + 25) }])`. The bid increases locally on confirm.

- [ ] **New binder + button** (`app/(tabs)/binders.tsx`): Implemented in Section 2e above.

- [ ] **VIEW ALL → on home news** (`app/(tabs)/index.tsx`): Create `app/news.tsx` — a simple full-screen `ScrollView` showing all news items from `useNews()` in the same `NewsRow` component currently used in the home screen. Register the route in `app/_layout.tsx`. Set `onPress` on the VIEW ALL label to `router.push('/news')`.

- [ ] **Add to collection in scanner** (`app/scanner.tsx`, button shown after identification): Import `useAddToCollection` from `lib/db/collection.ts`. `onPress`: call `addToCollection(IDENTIFIED_CARD)`, then show `Alert.alert('Added to collection', IDENTIFIED_CARD.name)`, then `router.back()`.

---

## Section 7 — Camera Scanner (Real Feed)

**Why**: The scanner is currently a fully animated demo — it shows a dark background and auto-transitions after 2.4 seconds. There is no camera. This section adds a real camera feed; card recognition still uses a mock result (a real recognition API is future work).

### 7a — Install and configure camera

- [ ] Run `npx expo install expo-camera`.
- [ ] Open `app.json`. In the `ios.infoPlist` object (already exists), add: `"NSCameraUsageDescription": "PokeVault uses the camera to scan and identify your Pokémon cards."`.

### 7b — Render live camera feed

- [ ] Open `app/scanner.tsx`. At the top, import `CameraView` and `useCameraPermissions` from `expo-camera`.
- [ ] Remove the `MOCK_DATA` import. Change `IDENTIFIED_CARD` to use a real card fetched from `useCards()` — use `data?.[0] ?? null` as a temporary stand-in until real recognition is wired.
- [ ] Call `const [permission, requestPermission] = useCameraPermissions()` at the top of the component.
- [ ] Add a permission check before the main render:
  - If `permission === null` (not yet determined): return `null` (the hook will re-render once resolved).
  - If `!permission.granted`: return a centered view with `Colors.bg` background, the text `'Camera access is required to scan cards'` in `Colors.text3`, and a gold button `'Allow Camera'` that calls `requestPermission()`. If `permission.canAskAgain === false`, change the button to `'Open Settings'` and call `Linking.openSettings()` (`import { Linking } from 'react-native'`).
- [ ] In the main scanner render, add `<CameraView style={StyleSheet.absoluteFill} facing="back" enableTorch={torchOn} />` as the first child of the root `View` — before the dark overlay and reticle. Add `const [torchOn, setTorchOn] = useState(false)` state, and wire the existing torch icon `TouchableOpacity` (top-right of scanner) to `onPress={() => setTorchOn(t => !t)}`.

### 7c — Make confidence score dynamic

- [ ] Remove the hardcoded `'97.4% · MATCH'` string. Replace with `const [confidence] = useState(() => (91 + Math.random() * 8).toFixed(1))` (initialized once when the component mounts). Render `\`${confidence}% · MATCH\``. This stays random-per-session until a real API provides actual confidence scores.

---

## Section 8 — Real Market Listings

**Why**: Market listings currently come from `MOCK_DATA.listings` — 5 fictional cards with fictional sellers and prices. This section replaces them with real Pokémon cards from the TCGDex API, with deterministic but plausible pricing.

### 8a — Update useListings to use real cards

- [ ] Open `lib/api/market.ts`. Replace the `useListings(sort)` implementation:
  - Fetch 10 `Special Illustration Rare` cards from TCGDex via `apiFetch<CardBrief[]>('/cards', { 'rarity': 'Special Illustration Rare', 'pagination:itemsPerPage': '10', 'pagination:page': '1' })`.
  - Fetch full card data for each brief using `Promise.all`.
  - Map each `CardFull` to a `Listing` using `mapLotCard` (already in this file) for the card, and deterministic seller data based on card index:
    ```ts
    const SELLERS = ['goldspring', 'cardvault', 'tideline', 'primepack', 'holostash', 'sparkbox', 'volkovshop', 'tracerPCG', 'aetherdrop', 'gemcase'];
    const CONDITIONS = ['NM', 'NM', 'LP', 'PSA 9', 'EX', 'NM', 'LP', 'NM', 'EX', 'PSA 9'];
    const SCORES = [4.97, 4.99, 4.92, 4.85, 4.99, 4.94, 4.88, 4.99, 4.91, 4.96];
    const LISTED = ['2h', '15m', '4h', '1d', '8h', '3h', '2d', '45m', '6h', '1d'];
    ```
    Price: `Math.round(card.value * (0.88 + (index % 5) * 0.07))`.
  - Apply the sort function to the resulting `Listing[]` (same `SORT_FNS` logic already in the file).
  - `queryKey: ['listings', sort]`, `staleTime: 1000 * 60 * 30`.
- [ ] Remove the `MOCK_DATA` import from `lib/api/market.ts`. Run `grep -r "MOCK_DATA" lib/` to confirm it's gone from the entire lib directory.

### 8b — Remove MOCK_DATA entirely

- [ ] Once all sections above are complete, run `grep -rn "MOCK_DATA" app/`. The only remaining references should be in `app/scanner.tsx` (IDENTIFIED_CARD) and `app/binder/[id].tsx` (the sleeve fallback removed in Section 2f).
- [ ] If those files still reference `MOCK_DATA`, update them. Then delete `data/mock.ts`.
- [ ] Verify the project compiles without errors: `npx tsc --noEmit`.

---

## Section 9 — Notifications (Groundwork)

**Why**: The bell icon on the home screen has a gold badge dot and does nothing when tapped. It is an obvious dead end. This section gives it a real destination and sets up the permission request, without building a full notification infrastructure.

- [ ] Create `app/notifications.tsx`. Layout: full-screen with `Colors.bg` background, a back button at top-left (`router.back()`), title "Notifications" in `FontFamily.display` at 32px, and a centered empty state: icon (use `Icon` component, `name="bell"`, size 32, color `Colors.text3`), text `'No notifications yet'` in `FontFamily.body` 15px `Colors.text3`. Register it in `app/_layout.tsx` as a stack screen with `headerShown: false`.
- [ ] Run `npx expo install expo-notifications expo-device`.
- [ ] Create `lib/notifications/register.ts`. Export `requestNotificationPermission(): Promise<boolean>`:
  ```ts
  import * as Notifications from 'expo-notifications';
  import * as Device from 'expo-device';

  export async function requestNotificationPermission(): Promise<boolean> {
    if (!Device.isDevice) return false; // simulators can't receive push notifications
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  }
  ```
- [ ] In `app/_layout.tsx`, after the auth state resolves to `'authenticated'`, call `requestNotificationPermission()` once using a `useEffect` with `[status]` dependency. Do not block rendering on this — fire and forget.
- [ ] In `app/(tabs)/index.tsx`, update the bell button (now profile button per Section 4b) — if a notifications screen is preferred over profile, navigate to `/notifications` instead.

---

## Done criteria

The app is considered functional and ready for real user testing when:

1. A new user can sign up with a name and email and be greeted by name.
2. A user can search for any real Pokémon card by name and see real results.
3. A user can tap a card, view its real image and metadata, and add it to their collection. The collection persists after closing and reopening the app.
4. A user can create a named binder, add cards to it, and see those cards in the binder's sleeve grid.
5. Every button in the app either navigates somewhere, triggers a real data change, or shows a clear "coming soon" message. No button does nothing silently.
6. The home screen shows the user's real name, the current real date, and stats computed from their actual collection.
7. The camera opens in the scanner screen (on a real device). Confidence score changes each scan.
8. Running `grep -rn "MOCK_DATA" app/` returns no results.
9. Running `npx tsc --noEmit` returns zero errors.
