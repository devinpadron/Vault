# Code Review — Cleanup & Functional Gaps

Snapshot of findings from a sweep of `app/`, `components/`, `lib/`, `constants/`, `types/`, `data/`. Items reference exact file paths and lines so each one can be opened, judged, and acted on independently.

The list is split into two sections so cleanup PRs and functionality PRs can move in parallel:

1. **CLEANUP** — dead code, dead-end buttons, fake/placeholder data, duplicated logic, unused exports/styles/deps. Pure deletion or rewiring. No behavior change for the user.
2. **BROKEN / LACKING FUNCTIONALITY** — features the UI promises but the code does not deliver. These are the real to-do list.

Inside each section items are ordered by approximate blast radius (highest first).

---

## 1. CLEANUP

### 1.1 Dead files / fully unused modules

| File | Status | Notes |
|------|--------|-------|
| `data/mock.ts` | **DEAD** — no imports anywhere | Verified with `grep MOCK_DATA`. CLAUDE.md still calls it out as "target for removal". Drop the file. |
| `components/haptic-tab.tsx` | **DEAD** — `HapticTab` not imported | TabBar is custom (`components/ui/TabBar.tsx`) so this template leftover is obsolete. |
| `hooks/use-color-scheme.ts` + `hooks/use-color-scheme.web.ts` | **DEAD** | App is dark-only; `useColorScheme` is never imported. |
| `scripts/reset-project.js` | Likely dead | Expo template script; not used by the dev workflow. Keep if you ever plan to "reset", otherwise delete. |

### 1.2 Dead-end buttons (visible, but no handler / no destination)

These render as tappable UI but go nowhere on press.

- `app/card/[id].tsx:436-438` — "Send" icon button in nav row (no `onPress`).
- `app/card/[id].tsx:648-655` — "Trade" icon CTA routes to `/(tabs)/market`, which is a stubbed "Coming soon" screen.
- `app/binder/[id].tsx:101-106` — Two nav buttons in binder header (`send`, `menu`) have no `onPress`.
- `app/binder/[id].tsx:162-170` — Pagination dots set `activePage` state but the grid always renders `binderCards.slice(0, 9)`. Dots are decorative; pages never change.
- `app/binder/[id].tsx:175-181` — "Share binder" + "+" CTAs have no `onPress`.
- `app/binder/[id].tsx:134-156` — Cards in the sleeve grid (`CardThumb`) have no tap handler. Tapping a card in a binder should open `/card/[id]`.
- `app/friend/[id].tsx:124-141` — Public binder rows render a `chevron-right` but the row is a `View`, not a `TouchableOpacity`. They don't navigate.
- `app/profile.tsx:130-140` — "Your collections" rows similarly use a `View` + chevron and don't navigate.
- `app/scanner.tsx:242-248` — "Flash" toggle button has no `onPress`.
- `app/(auth)/welcome.tsx:135-137` — "Terms of Service / Privacy Policy" text is not a link.

### 1.3 Fake / placeholder data still rendered

- `app/scanner.tsx` — The whole flow is a 2.4 s timer that picks a random `useFeaturedCard()` as the "identified" result. `confidence: 97.4%` is hardcoded. Tracked under §2.1.
- `app/binder/[id].tsx` — `NUM_PAGES = 5` is hardcoded; pagination dots are cosmetic (see §1.2).
- `app/(tabs)/index.tsx:115-117` — Featured card chip shows `1/1` as a fixed string regardless of card.
- `app/(tabs)/market.tsx` — Entire screen is a "Coming soon" stub. Not really fake data but the Trade CTA in card detail points here.

### 1.4 Stale / dropped tables still queried

The legacy SQLite tables `collection_cards`, `binders`, `binder_cards`, `wishlist_cards` are dropped by `lib/db/cloud-sync.ts:171` (`dropLegacyUserTables`) on first authenticated launch. Two production reads still target them:

- `lib/api/cards.ts:153-155` (`usePortfolioHistory`) — `SELECT DISTINCT card_id FROM collection_cards`. After sign-in the table no longer exists; the sparkline silently returns `[]`. The Home screen's 30-day chart is therefore always empty in real usage. **Fix once and the home chart starts working.** Tracked under §2.2.
- `lib/api/sync-client.ts:60-63` (`prewarmFromLocalCollection`) — Same problem: queries `collection_cards UNION wishlist_cards`. The try/catch swallows the error so prewarm silently never runs. Tracked under §2.2.

The cloud mirror tables to read from are `cloud_collection_items` joined to `cloud_collections WHERE kind IN ('collection','wishlist')`.

### 1.5 Query-key drift (mutation invalidations that miss)

- `lib/db/collection.ts:78,91` — `useAddToCollection` / `useRemoveFromCollection` invalidate `['collection', user.id]`, but `useCollectionEntries` (line 23) uses `['collection-entries', user?.id]`. React Query's prefix match is exact-segment, so the collection screen does **not** auto-refresh on add/remove. The "in-collection" toggle inside the card detail works (matching key), but the grid behind it goes stale. Cheap one-line fix.

### 1.6 Exported but never used

- `lib/api/binders.ts:168` `useDeleteBinder` — exported, no callers. Either wire it into binder detail (currently no delete affordance) or drop.
- `lib/db/cloud-sync.ts:283` `renameCollection` — exported, no callers. Same call: either expose a rename UI or drop.
- `lib/api/listings.ts:34` `useCardListings` — only definition; no callers. The graded-options matrix uses the aggregated `listGradedOptions` path instead. Keep only if the planned market screen needs it; otherwise delete.
- `lib/api/types.ts:68-104` `RARITY_VALUES`, `RARITY_VARIANTS` — both unused. Prices now come from `card_prices_current`; variant labels come from `card_variants[0].name`. Drop both tables — they encode the old mock pricing model.
- `lib/api/types.ts:106-112` `HIGH_VALUE_RARITIES` — unused. Only `FEATURED_RARITIES` is referenced.
- `package.json` — `expo-symbols` and `expo-auth-session` are listed but never imported anywhere in `app/`, `components/`, `lib/`. Remove from dependencies.

### 1.7 Unused styles (lint-cheap to remove)

These StyleSheet keys are defined but never referenced in their own file:

- `app/card/[id].tsx`: `divider` (992), `sourceRow` (997), `sourceValue` (1001).
- `app/(tabs)/index.tsx`: `iconBtnRelative` (286), `badge` (296).

### 1.8 Duplication that should consolidate

- `AVATAR_PALETTE` + `avatarFor()` are defined twice with identical contents: `lib/auth/AuthContext.tsx:29-41` and `lib/api/profiles.ts:23-35`. CLAUDE.md even calls out they're "Kept in sync manually." Move to one shared util (e.g. `lib/avatar.ts`) and import from both.
- `TONE_PAIRS` / `TONE_PALETTE` for binder gradient swatches is defined three times with the same 6-entry list:
  - `app/(tabs)/binders.tsx:15-22`
  - `app/card/[id].tsx:35-42`
  - `lib/api/friends.ts:110-117` and `lib/db/cloud-sync.ts:216-223`
  Consolidate.
- `PLACEHOLDER_CARD` literal is defined twice with near-identical content: `lib/api/binders.ts:15-31` and `lib/api/friends.ts:125-141`. Export one and reuse.
- Local `fmt(n)` USD-formatter is duplicated across at least 5 screens (`app/(tabs)/index.tsx`, `app/(tabs)/collection.tsx`, `app/wishlist.tsx`, `app/card/[id].tsx`, `app/search.tsx`, `app/scanner.tsx`). Move to a single `lib/format.ts`.
- The "NewsRow" component is defined twice with the same gradient/image/meta layout: `app/(tabs)/index.tsx:187-237` and `app/news.tsx:61-107`. Extract to `components/news/NewsRow.tsx`.
- Nav-button styling (`width: 38, height: 38, borderRadius: full, borderWidth: 1, ...`) is recreated in every modal screen. Extract a `NavBtn` component to enforce a single look.

### 1.9 Stale comments / docs

- `CLAUDE.md` "Data layer" still says local persistence uses `collection_cards`, `binders`, `binder_cards`, `wishlist_cards`. Those have been replaced by `cloud_collections` + `cloud_collection_items` + `pending_ops`. Update.
- `CLAUDE.md` "Auth" still claims `useAuth()` exposes `token` and `login()`, and that storage lives in `lib/auth/storage.ts`. None of that exists — `AuthContext` uses Supabase OAuth via Apple/Google, with AsyncStorage for session persistence (see `lib/supabase.ts:11-18`). Update.
- `CLAUDE.md` "Mock data" calls out `data/mock.ts` as a removal target — once §1.1 lands, drop the section.
- `data/mock.ts:3-7` flag `MOCK_DATA_ENABLED = true` — moot, no one reads it. Goes away with the file.
- `lib/db/database.ts:29-55` still `CREATE TABLE IF NOT EXISTS` for the four legacy tables, only to immediately drop them after sign-in. Drop the CREATEs (the dropper stays for users on old installs).

---

## 2. BROKEN / LACKING FUNCTIONALITY

Ordered roughly by user-visible impact.

### 2.1 Scanner is theatre, not recognition
**Where:** `app/scanner.tsx` (whole file)
**What's there:** Camera preview + 2.4 s animation + result sheet that adds a **random featured card** to the user's collection.
**What's missing:**
- Real image-recognition pipeline (Scrydex `/identify` or an alternative).
- Honest confidence/match number wired to the recognizer instead of `97.4%`.
- Flash toggle on the camera (button exists, no handler).
- Failure state: "couldn't identify — try again / search manually".

### 2.2 Home-screen portfolio chart is always empty
**Where:** `lib/api/cards.ts:147-239` `usePortfolioHistory` queries the dropped `collection_cards` table.
**Effect:** `data` always resolves to `[]`, so the `<Sparkline>` on `app/(tabs)/index.tsx:107` renders nothing for every authenticated user.
**Fix:** Read card ids from `cloud_collection_items` joined to `cloud_collections WHERE kind='collection'`. (Same fix unblocks `prewarmFromLocalCollection` in `lib/api/sync-client.ts:60-63`.)

### 2.3 Collection grid doesn't refresh after add/remove
**Where:** `lib/db/collection.ts:78,91` (invalidations use the wrong key).
**Effect:** Adding a card from `card/[id]` doesn't update the Collection tab until a full re-mount. Same for remove.
**Fix:** Change invalidation key to `['collection-entries', user.id]`. One-line.

### 2.4 Binder detail screen has no real binder behavior
**Where:** `app/binder/[id].tsx`
**What's missing:**
- **Multi-page rendering.** Only the first 9 cards are ever shown (`binderCards.slice(0, 9)`). Pagination dots are decorative.
- **Card open.** Tapping a card in a sleeve does nothing — `CardThumb` has no `onPress`.
- **Share binder.** Button has no handler. Need either a deep link (e.g. `vault://binder/<id>`) or a Linking/Share invocation.
- **Add card to binder from binder.** The "+" icon in `ctaRow` has no handler; today users have to enter binder-add from card detail.
- **Delete / rename binder.** `useDeleteBinder` and `renameCollection` are written, but no UI wires them.

### 2.5 Market tab is a stub
**Where:** `app/(tabs)/market.tsx`
**Effect:** Tab and the Trade CTA in card detail both land on a "Coming soon" card.
**What's expected (per the stub copy):**
- Real eBay/sold-listing browser per card. (`useCardListings` in `lib/api/listings.ts` already exists — wire it.)
- Quick-buy from trusted sellers.
- Live auctions.

If the marketplace is not on the near roadmap, hide the "Trade" CTA from `app/card/[id].tsx:648-655` so it doesn't dead-end users.

### 2.6 Friend detail "Public binders" don't open
**Where:** `app/friend/[id].tsx:124-141` (rows are `View`).
**Fix:** Make rows `TouchableOpacity` and route to `/binder/[id]`. (Requires `app/binder/[id].tsx` to gracefully render someone else's binder via RLS — verify the query path.)

### 2.7 Own-profile "Your collections" don't open
**Where:** `app/profile.tsx:130-140` (rows are `View`).
**Fix:** Decide a destination — likely `/(tabs)/collection` for kind=`collection`, `/wishlist` for kind=`wishlist`, `/binder/[id]` for kind=`binder`. Then make them tappable.

### 2.8 No sign-up or email/password auth path
**Where:** `app/(auth)/`
**Status:** Only `welcome.tsx` exists. CLAUDE.md mentions `app/(auth)/login.tsx` and `app/(auth)/signup.tsx`; neither exists. Apple + Google OAuth are the only sign-in paths.
**What's missing:**
- Decision: keep OAuth-only (then update CLAUDE.md and remove the references), or add email/password flows and the missing screens.
- Terms / Privacy links from `welcome.tsx:135-137` need real URLs.

### 2.9 Card detail "Send" action is unimplemented
**Where:** `app/card/[id].tsx:436-438`.
**Likely intent:** share a card with a friend (in-app messaging or external Share sheet). Either implement or remove the icon.

### 2.10 No way to remove a card from a binder
There is `useAddCardToBinder` but no corresponding remove hook in `lib/api/binders.ts`. `removeItemFromCollectionByCard` in `lib/db/cloud-sync.ts:334-347` exists at the layer below — just needs a hook wrapper + UI affordance in `app/binder/[id].tsx`.

### 2.11 Friends list missing presence + portfolio value
**Where:** `lib/api/friends.ts:14-25` — `value` is hardcoded `0`, `online` is hardcoded `false`. The Friends tab rows already render around this assumption (no $ shown), but the Friend type still carries those fields.
**Decision:** Either trim the type and the placeholder defaults, or build the presence + portfolio aggregation.

### 2.12 Auth state has no error / blocked path
**Where:** `lib/auth/AuthContext.tsx:78-103`
**Edge cases not handled:**
- `pullCollectionsFromCloud` failure leaves the user signed in but with an empty mirror — UI still shows "No cards yet" with no retry. Worth surfacing a banner.
- No "you're signed out due to expired token" message — refresh silently drops state.

### 2.13 News tab "minutes" is an estimate, not a real read-time
`lib/api/news.ts:78-82` computes `Math.round(wordCount / 220)` over the (often null) `summary`. That's fine, but worth noting as not-from-data if the field ever becomes user-facing in a meaningful way.

### 2.14 No-op pagination dots in binder detail
Already listed under §2.4 — calling out separately because it's the most obviously broken affordance on that screen.

---

## How to use this list

- For PRs whose only job is cleanup: take items from §1 in order. They're independent and almost all are pure deletions.
- For PRs whose job is to make a feature actually work: pick a §2 item, scope it, and ship. §2.2 and §2.3 are one-line fixes with outsized impact and should go first.
- §1.4 + §1.5 are technically bugs that masquerade as "cleanup" because the symptoms are silent. Treat them as P1.
