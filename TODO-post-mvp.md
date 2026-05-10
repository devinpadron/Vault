# PokeVault — Post-MVP Implementation Plan

Each section below corresponds to one Post-MVP item from the main TODO. Tasks within each section are ordered so that earlier steps unblock later ones. Complete top-to-bottom within each section before starting the next.

---

## 1 — Real Card Image Assets

Replace the 3-stop gradient placeholders in `CardThumb` with actual card artwork.

### 1a — Asset pipeline
- [ ] Decide on image source: local bundled assets vs. remote CDN (recommend CDN for app size)
- [ ] Define naming convention: `{card-id}.webp` (e.g. `c01.webp`)
- [ ] Add `imageUrl?: string` field to the `Card` type in `types/index.ts`
- [ ] Populate `imageUrl` on all 12 cards in `data/mock.ts` pointing to placeholder URLs for testing

### 1b — CardThumb upgrade
- [ ] Install `expo-image` (preferred over RN's `Image` — built-in blurhash, caching, transitions)
- [ ] Update `CardThumb` to render `<Image>` when `card.imageUrl` is present, gradient fallback when absent
- [ ] Add `blurhash` field to `Card` type and generate blurhashes for each card image (use `expo-image` CLI tool)
- [ ] Pass `placeholder={{ blurhash }}` to `<Image>` so the gradient fades into the real image on load

### 1c — Card3D upgrade
- [ ] Verify foil shimmer still works over the real image (the shimmer overlay sits above `CardThumb`, so it should be transparent-compatible)
- [ ] Add a subtle specular highlight layer for physical card texture (thin white LinearGradient at top-left, 8% opacity)

### 1d — Asset management
- [ ] Create `assets/cards/` directory structure if using local assets
- [ ] Add image optimisation step to CI (convert to WebP, max 800×1120px, ~80% quality)
- [ ] Document CDN upload process in `README.md`

---

## 2 — API Integration

Replace `data/mock.ts` with real network calls. Build the data layer in isolation before touching any screens.

### 2a — API client foundation
- [ ] Install `@tanstack/react-query` (handles caching, background refresh, loading/error states)
- [ ] Create `lib/api/client.ts` — exports a configured `fetch` wrapper with base URL, auth headers, and JSON parsing
- [ ] Create `lib/api/types.ts` — raw API response shapes (may differ from app types; transform in the hook layer)
- [ ] Add `EXPO_PUBLIC_API_BASE_URL` to `app.json` / `.env.local` and document required env vars in `README.md`

### 2b — Endpoint hooks (one per resource)
- [ ] `lib/api/cards.ts` — `useCards()`, `useCard(id)`, `useCardPriceHistory(id, range)`
- [ ] `lib/api/binders.ts` — `useBinders()`, `useBinder(id)`, `useBinderCards(id, page)`
- [ ] `lib/api/friends.ts` — `useFriends()`, `useFriend(id)`, `useFriendBinders(id)`
- [ ] `lib/api/market.ts` — `useListings(sort)`, `useLiveLot()`
- [ ] `lib/api/news.ts` — `useNews()`

### 2c — Screen-by-screen migration (swap mock for hooks)
- [ ] Home screen — `useCards` (featured card), `useNews`, portfolio stats endpoint
- [ ] Collection screen — `useCards` with filter/sort params passed as query args
- [ ] Card Detail screen — `useCard(id)` + `useCardPriceHistory(id, range)` (range change triggers re-fetch)
- [ ] Binders screens — `useBinders` + `useBinder(id)` + `useBinderCards(id, page)` (wire pagination dots to page param)
- [ ] Friends screens — `useFriends` + `useFriend(id)` + `useFriendBinders(id)`
- [ ] Market screen — `useListings(sort)` + `useLiveLot` with WebSocket or polling for live bid updates

### 2d — Loading and error states
- [ ] Create `components/ui/SkeletonCard.tsx` — animated shimmer placeholder matching `CardThumb` dimensions
- [ ] Create `components/ui/SkeletonRow.tsx` — animated shimmer for list rows (friends, listings, news)
- [ ] Add loading skeletons to all screens during initial fetch
- [ ] Add inline error states with a retry button (do not use full-screen error pages for partial failures)
- [ ] Test offline behaviour — `react-query` stale-while-revalidate should serve cached data

### 2e — Optimistic updates
- [ ] "Add to binder" — optimistically add card to binder count before API confirms
- [ ] Price data — show last-cached value instantly, update when fresh data arrives

---

## 3 — Authentication

Gate the app behind login. Authentication state gates navigation, not individual screens.

### 3a — Auth provider setup
- [ ] Choose auth strategy: Expo Auth Session (OAuth) or custom JWT (recommend JWT + refresh token for full control)
- [ ] Create `lib/auth/` directory with `AuthContext.tsx`, `useAuth.ts`, `storage.ts` (SecureStore wrapper)
- [ ] Install `expo-secure-store` for token storage (never `AsyncStorage` for credentials)
- [ ] Define `AuthState`: `{ user: User | null; token: string | null; status: 'loading' | 'authenticated' | 'unauthenticated' }`

### 3b — Auth screens
- [ ] `app/(auth)/welcome.tsx` — full-screen splash with app mark, "Get started" + "Sign in" CTAs
- [ ] `app/(auth)/signup.tsx` — email + username + password fields, gold primary CTA, terms link
- [ ] `app/(auth)/login.tsx` — email + password fields, "Forgot password?" link
- [ ] `app/(auth)/forgot.tsx` — email field, sends reset link, confirmation state
- [ ] Register `(auth)` group in `app/_layout.tsx`; redirect based on `AuthState.status`

### 3c — Navigation gating
- [ ] In root layout, redirect to `/(auth)/welcome` if `status === 'unauthenticated'`
- [ ] Show a full-screen loading state while `status === 'loading'` (token refresh in progress)
- [ ] Redirect to `/(tabs)` immediately after successful login/signup
- [ ] Handle token expiry: silent refresh on 401, re-route to login if refresh fails

### 3d — Profile
- [ ] Add `User` type: `{ id, name, handle, avatar, email }`
- [ ] Pass `user` from `AuthContext` into the Home greeting ("Good evening, {user.name}")
- [ ] `app/profile.tsx` — settings modal: avatar, display name, handle, sign out button

---

## 4 — Expo Camera (Real Scanner)

Replace the animated stub scanner with a live camera feed and real card detection.

### 4a — Camera setup
- [ ] Install `expo-camera` and add `NSCameraUsageDescription` to `app.json` iOS config
- [ ] Request camera permission on first scanner open using `useCameraPermissions()`; show a permission-denied state if refused
- [ ] Render `<CameraView>` filling the screen behind the existing reticle overlay in `app/scanner.tsx`
- [ ] Wire the torch toggle button to `CameraView`'s `enableTorch` prop

### 4b — Card capture
- [ ] Add a `captureRef` to `CameraView` and call `captureRef.current.takePictureAsync({ base64: true, quality: 0.6 })`
- [ ] Trigger capture automatically after 1.5s of stable framing (detect stability via accelerometer) OR add a manual shutter button below the reticle
- [ ] Send the base64 image to the card-recognition API endpoint

### 4c — Recognition flow integration
- [ ] On API response, populate `identifiedCard` state with the returned card data
- [ ] Transition from `'scanning'` to `'identified'` phase (the particle burst + card rise already exist)
- [ ] Display match confidence from the API response (replace the hardcoded 97.4%)
- [ ] Handle low-confidence response (< 70%): show "No match found" state with a Rescan CTA

### 4d — Edge cases
- [ ] Handle camera unavailable (simulator): fall back to current animated demo mode
- [ ] Handle API timeout (> 5s): show "Still looking…" message and allow manual cancel
- [ ] Rate limit UI: disable scanner for 3s after a failed scan to prevent hammering the API

---

## 5 — Push Notifications

Alert users to price moves and friend activity without requiring them to open the app.

### 5a — Infrastructure
- [ ] Install `expo-notifications` and `expo-device`
- [ ] Add `UIBackgroundModes: ['remote-notification']` to `app.json` iOS config
- [ ] Create `lib/notifications/` with `register.ts` (request permission + get Expo push token) and `handlers.ts` (foreground + background handler setup)
- [ ] Send the Expo push token to the backend on login/token refresh

### 5b — Notification types and deep links
- [ ] Define notification payload schema: `{ type: 'price_alert' | 'friend_activity' | 'market_bid', cardId?, friendId?, listingId? }`
- [ ] In `handlers.ts`, map each `type` to an Expo Router `href` and call `router.push(href)` in `lastNotificationResponse` listener
- [ ] Price alert → `/card/${cardId}`
- [ ] Friend activity → `/friend/${friendId}`
- [ ] Market bid outbid → `/(tabs)/market` with `Live` sub-view pre-selected

### 5c — In-app notification centre
- [ ] Add notification history state (last 20 notifications) stored in `expo-secure-store`
- [ ] Bell icon on Home screen navigates to `app/notifications.tsx` — simple list of past alerts
- [ ] Clear the gold dot badge on bell icon when the notifications screen is opened

### 5d — User preferences
- [ ] `app/profile.tsx` notification settings section: toggles for price alerts, friend activity, live auction outbids
- [ ] POST preferences to backend when toggled; backend controls which notification types to send

---

## 6 — Binder Reordering (Drag-and-Drop)

Allow users to reorder binders in the list and cards within a binder page.

### 6a — Foundation
- [ ] Install `react-native-gesture-handler` drag utilities (already installed) — use `Gesture.Pan` + `useSharedValue` for position tracking
- [ ] Define a `reorderBinders(ids: string[])` API mutation (optimistic update: reorder locally, sync on settle)

### 6b — Binder list reordering
- [ ] Wrap each `BinderCover` in a draggable container that uses `Gesture.LongPress` to enter drag mode
- [ ] On long press: card lifts (scale to 1.05, shadow increases), other cards shift using `withSpring` layout animation
- [ ] On drop: snap to nearest slot, call `reorderBinders` mutation, exit drag mode
- [ ] Show a subtle drag handle icon (three horizontal lines) on the right edge of each binder cover, visible only in edit mode

### 6c — Sleeve reordering within a binder page
- [ ] In `app/binder/[id].tsx`, add a long-press drag mode to individual sleeves
- [ ] Sleeves can be swapped within a page; dragging to the edge auto-advances to the next page
- [ ] On drop: call `reorderBinderCards(binderId, page, newOrder)` mutation

### 6d — Edit mode UX
- [ ] Add an "Edit" button to the binder open nav bar that toggles edit mode
- [ ] In edit mode: show drag handles, hide the page pagination dots, show a "Done" button
- [ ] Persist reorder state on "Done"; discard on back navigation without saving (with a confirmation alert)

---

## 7 — Card Grading Submission

Let users submit cards for professional grading (PSA / BGS) directly from the app.

### 7a — Grading data model
- [ ] Add `GradingSubmission` type: `{ id, cardId, service: 'PSA' | 'BGS' | 'CGC', tier, submittedAt, status: 'draft' | 'submitted' | 'in_transit' | 'graded', grade?: number }`
- [ ] Add `submissions` array to `AppData` and populate with mock data

### 7b — Entry point
- [ ] Add a "Submit for grading" button to Card Detail CTAs row (icon button, ghost style, next to Trade)
- [ ] Tapping opens `app/grading/[cardId].tsx` as a `slide_from_bottom` modal
- [ ] Register `grading/[cardId]` route in `app/_layout.tsx`

### 7c — Grading flow screens
- [ ] **Step 1 — Service selection** (`grading/[cardId].tsx`): three cards for PSA / BGS / CGC with logo, turnaround time, price tier grid. Selected card gets gold border
- [ ] **Step 2 — Tier selection**: pill row for service tiers (e.g. PSA Economy / Regular / Express). Each shows estimated turnaround + price
- [ ] **Step 3 — Card condition self-assessment**: simple 1–10 slider with descriptor labels ("Poor" → "Gem Mint"). This pre-fills expected grade for pricing estimates
- [ ] **Step 4 — Shipping label**: pre-filled address form (name, address lines, postcode), printable QR code on submit
- [ ] **Step 5 — Confirmation**: order summary (card, service, tier, estimated grade, total cost), gold "Confirm & pay" CTA

### 7d — Submission tracking
- [ ] `app/grading/status.tsx` — list of in-progress submissions with status badges and a timeline
- [ ] When status changes to `'graded'`, send a push notification with the grade result
- [ ] On the card detail screen, show a "PSA X" badge if the card has a completed grading submission linked to it
