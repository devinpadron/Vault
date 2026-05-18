  ---
  PokeVault — Full Codebase Audit

  Scope: read-only review of app/, lib/, components/, supabase/, data/, types/ at main (commit 0c0ecda). No code changes made.

  ---
  CATEGORY 1 — DEAD LINKS AND BROKEN NAVIGATION

  Routes that are declared but lead to placeholder/missing screens

  - app/(auth)/login and app/(auth)/signup — CLAUDE.md documents these screens, but only app/(auth)/welcome.tsx and app/(auth)/_layout.tsx exist on disk. There is no email/password flow, no signup
  form, no password reset.
  - app/(auth)/welcome.tsx:39-55 — both "Continue with Apple" and "Continue with Google" call the same signInWith() function that fabricates a hex token and a fake Trainer user. There is no real OAuth
  — these are non-functional sign-in buttons that resolve to a logged-in mock state.

  Buttons / icons with no onPress handler (or no-op handler)

  - app/(tabs)/index.tsx:71-78 — Notifications bell in Home top bar. Has a gold badge dot but no handler and no destination route exists for it.
  - app/(tabs)/index.tsx:167 — "VIEW ALL →" on The Brief news section is just a Text element, not touchable.
  - app/(tabs)/collection.tsx:111-114 — Sort button (icon + "Sort" label) has no onPress. Only the FilterPills actually change state.
  - app/(tabs)/friends.tsx:105 — TRADE button on each friend row. No handler.
  - app/card/[id].tsx:157-159 — Heart icon in card detail nav bar. Clearly intended to toggle wishlist; lib/db/wishlist.ts (useAddToWishlist, useRemoveFromWishlist, useIsWishlisted) is fully wired but
  unused.
  - app/card/[id].tsx:160-162 — Send/share icon in card detail nav bar. No handler.
  - app/card/[id].tsx:308-315 — Trade icon CTA routes to /(tabs)/market without pre-filtering by card; effectively a dead end for "trade this card."
  - app/binder/[id].tsx:64-66 — Send/share icon in binder header. No handler.
  - app/binder/[id].tsx:67-69 — Menu icon in binder header. No handler.
  - app/binder/[id].tsx:138-140 — "Share binder" CTA. No handler.
  - app/binder/[id].tsx:141-143 — + (add card) icon at the bottom. No handler; the obvious flow is "search → add to this binder" but it's not wired.
  - app/binder/[id].tsx:127-132 — Pagination dots call setActivePage(i) but activePage never feeds into the rendered card slice; only the first 9 cards (binderCards.slice(0, 9)) are ever shown.
  NUM_PAGES = 5 is hard-coded.
  - app/friend/[id].tsx:40-43 — Menu icon in friend profile nav. No handler.
  - app/friend/[id].tsx:80-82 — Trade primary CTA in friend profile. No handler.
  - app/friend/[id].tsx:83-85 — Message secondary CTA. No handler. Also: no messaging surface exists.
  - app/friend/[id].tsx:96-112 — Friend's public binder rows are plain Views, not TouchableOpacity, so they don't navigate anywhere (e.g. to /binder/[id]).
  - app/(tabs)/market.tsx:315-317 — Watch button on Live auction. No handler.
  - app/(tabs)/market.tsx:318-322 — Place bid CTA with pulsing animation. No handler; bid amount changes are simulated by setInterval (lines 183-189).
  - app/scanner.tsx:153-159 — Flash toggle icon in scanner top bar. No handler (no actual camera anyway).
  - app/scanner.tsx:233-244 — "Add to collection" in scanner result sheet calls Haptics.notificationAsync and router.back() but never calls useAddToCollection — the card is not actually added.

  Tab bar / FAB

  - components/ui/TabBar.tsx:13 — Synthetic __scan__ tab is correctly handled as a FAB that routes to /scanner. OK.
  - All five real tabs (index, collection, binders, friends, market) resolve to real screens. No orphan tabs.

  Deep links / dynamic routes

  - card/[id], binder/[id], friend/[id] all resolve to real screens. OK.
  - app/scanner.tsx:191 — tapping the identified card routes to /card/${IDENTIFIED_CARD.id}, but IDENTIFIED_CARD = MOCK_DATA.cards[0] (id 'c01') which does not exist in Supabase — the destination
  renders nothing (useCard returns null and the screen return nulls, see app/card/[id].tsx:137-138).

  Missing screens implied by existing UI

  - No notifications screen — bell badge in Home implies one.
  - No settings / profile / logout screen — AuthContext.logout() is implemented but never invoked anywhere; users have no way to sign out.
  - No wishlist screen — DB schema and hooks exist; no UI route.
  - No "all news" screen — implied by "VIEW ALL →" on Home.

  ---
  CATEGORY 2 — UI CHANGES AND POLISH

  Screens that are incomplete or stubbed

  - Home (app/(tabs)/index.tsx) — console.log('Featured card:', featured) left in at line 26. Stats card draws a Sparkline (line 107) but useCardPriceHistory always resolves to [] (see Category 3), so
  the sparkline component returns null and silently leaves a gap. The 30D change label hangs off totalChange = sum(card.change) where card.change is the 7-day change pulled from
  card_prices_current.trend_7d_change — labelling it "30D" is wrong.
  - Scanner (app/scanner.tsx) — entirely a fake 2.4-second timer animation. No expo-camera import, no image processing, no Scrydex match. The "identified" card is MOCK_DATA.cards[0] (Emberwyrm EX)
  every single time.
  - Market Live (app/(tabs)/market.tsx) — every element on the Live tab is simulated client-side: bid amount, bidder count, viewer count, chat strip (CHAT_COMMENTS at lines 169-173), and countdown.
  There is no live auctions table or websocket.
  - Market Listings (app/(tabs)/market.tsx) — listings are fabricated from cards (see Category 3). Hard-coded "22,418 active" eyebrow (line 53). Listings tab has no skeleton state — screen is blank
  while loading.
  - Binder open (app/binder/[id].tsx) — only the first 9 cards display; pagination dots are decorative. Returns null while loading instead of a skeleton.
  - Friend profile (app/friend/[id].tsx) — if (isLoading) return null (line 18) renders a blank screen instead of a skeleton. Stat "CARDS = friend.binders * 22" (line 68) is a fake derivation. Binder
  rows hard-code "LAST UPDATED 2D AGO" (line 107).

  Hardcoded placeholder / fake content

  - app/(tabs)/market.tsx:53 — "22,418 active" — fake count.
  - app/(tabs)/market.tsx:169-173 — CHAT_COMMENTS array — three hand-written messages.
  - app/(tabs)/market.tsx:178 — initial bid 2840, bidders 34, countdown 42 — hard-coded.
  - app/(tabs)/market.tsx:258 — Math.floor(bidders * 8.4) viewer-count derivation.
  - app/(tabs)/market.tsx:274 — "Current lot · 04 of 12" — hard-coded.
  - lib/api/market.ts:16-19 — SELLERS, CONDITIONS, SCORES, LISTED arrays rotated by index modulo 10.
  - app/(tabs)/friends.tsx — entire screen reads from MOCK_DATA.friends via useFriends.
  - app/(tabs)/index.tsx — Brief section reads from MOCK_DATA.news.
  - app/scanner.tsx:39 — IDENTIFIED_CARD = MOCK_DATA.cards[0].
  - app/scanner.tsx:211 — "97.4% · MATCH" hard-coded confidence.
  - app/friend/[id].tsx:68 — friend.binders * 22 for total cards.
  - app/friend/[id].tsx:107 — "LAST UPDATED 2D AGO" string.

  Missing loading states

  - app/(tabs)/market.tsx — Listings and Live render no skeletons while their queries are pending; the listings list just appears empty.
  - app/(tabs)/index.tsx — featured card has SkeletonCard, but the news block has nothing while loading (acceptable since MOCK_DATA.news resolves immediately; will become a gap once real).
  - app/card/[id].tsx:137-138 — if (cardLoading) return null shows a blank screen.
  - app/binder/[id].tsx:39 — if (!binder) return null shows a blank screen.
  - app/friend/[id].tsx:18 — if (isLoading) return null shows a blank screen.

  Missing empty states

  - app/search.tsx — when query.length >= 2 && !isFetching && results.length === 0, no "no results" message renders (only the live-fetching skeleton handler is present at lines 144-148).
  - app/(tabs)/market.tsx — no empty state for an empty listings list.
  - Friend profile — no message when binders is empty.

  Missing error states

  - app/(tabs)/index.tsx — useFeaturedCard, useNews, useCollectionCards, useCardPriceHistory are not wired to ErrorPanel. A Supabase outage shows nothing.
  - app/(tabs)/collection.tsx — useCollectionCards is local SQLite (won't fail in practice), but no error UI exists.
  - app/card/[id].tsx — neither useCard nor useCardPricing shows an error state; both silently render nothing.
  - app/scanner.tsx — no error UI (and the "match" is fake anyway).

  Theme / token violations

  - app/_layout.tsx:69 — contentStyle: { backgroundColor: '#0A0A0C' } should be Colors.bg.
  - components/ui/TabBar.tsx:43 — '#0A0A0C' literal in LinearGradient colors should be Colors.bg.
  - app/(auth)/welcome.tsx:44, 112-113 — color="#000", color: '#0A0A0C' literals.
  - app/(tabs)/binders.tsx:454 and many similar — color: '#0A0A0C' in CTA text styles is repeated across card/[id].tsx, binder/[id].tsx, friend/[id].tsx, market.tsx, scanner.tsx. Define a token like
  Colors.onGold and use it everywhere.
  - app/(tabs)/binders.tsx:222-225 — emptyTitle/emptySubtitle use 'rgba(255,255,255,0.6)' and 'rgba(255,255,255,0.4)'; should be Colors.text2 / Colors.text3.

  Modals / overlays

  - app/(tabs)/binders.tsx Create-binder sheet, app/card/[id].tsx Add-to-binder sheet, app/search.tsx Sort sheet — all open/close correctly.
  - All three sheets handle the backdrop tap and onRequestClose. No regressions found.
  - The card detail sheet uses Modal animationType="slide"; the search sort sheet uses the same. Consistent.
  - No animated transition issues observed in code.

  ---
  CATEGORY 3 — DATA AND API IMPLEMENTATION

  Surfaces still rendering mock data

  - lib/api/news.ts:5-11 — useNews resolves MOCK_DATA.news. No news table exists in supabase/migrations/*. Drives Home's "The Brief" (app/(tabs)/index.tsx:170-173).
  - lib/api/friends.ts:5-29 — useFriends, useFriend, useFriendBinders all return mock. Drives the entire Friends tab and friend profile, plus the avatars in the Market Live bidders row
  (app/(tabs)/market.tsx:299-307). Supabase schema already has profiles and friendships tables (supabase/migrations/005_app_collections.sql:10-191) — they're never queried.
  - app/scanner.tsx:18, 39, 189-191, 213-223 — scanner is hard-wired to MOCK_DATA.cards[0].

  Supabase queries / schema gaps

  - lib/api/market.ts:42 — useListings selects from cards filtered to rarity = 'Special Illustration Rare' and fabricates Listing objects in cardToListing(). There is no listings table in the schema.
  Same for useLiveLot (lines 55-73).
  - lib/api/cards.ts:110-116 — useCardPriceHistory is a stub that always returns []. Schema has card_price_history (supabase/migrations/004_tier3_historical.sql) but no portfolio-level aggregation
  exists. Home stats card sparkline never renders as a result.
  - lib/api/pricing.ts:35-122 — getCardPricing only fetches type='raw' condition='NM'. Schema supports type='graded', grader, grade (003_tier2_current_pricing.sql:14-19) but UI ignores them.
  - lib/api/pricing.ts:88-95 — price history is hard-capped to 90 rows. CardPricing carries min_all_time, max_all_time, but the UI's PriceChart only offers 7D/30D/90D ranges
  (components/charts/PriceChart.tsx:5). 1Y / ALL ranges are unimplemented despite the data layer being half-prepared for them.
  - lib/api/cards.ts:79-80, 100-101 — useSearchCards price sort fetches a single page of 200 (PRICE_SORT_LIMIT) and sorts client-side. getNextPageParam explicitly returns undefined for price sort → no
  pagination on price-sorted searches.
  - lib/api/cards.ts:77 — search uses .ilike(col, '%query%'). The schema has trigram indexes (cards_name_trgm_idx, expansions_name_trgm_idx) but the query doesn't use websearch_to_tsquery or trigram
  operators — leading-wildcard ilike won't use the index efficiently.
  - lib/api/cards.ts:53 — FILTER_COLUMN maps a "Pokémon" filter to the name column, but the search screen's FILTERS array (app/search.tsx:13) doesn't expose it. Dead mapping.

  External APIs

  - lib/api/client.ts:1-14 — apiFetch is hard-coded to https://api.tcgdex.net/v2/en. Dead code — nothing imports it. The app has migrated to Scrydex via Supabase. Delete or repurpose.
  - supabase/functions/sync/scrydex.ts + phases — Scrydex sync logic is built and looks complete, but:
    - There is no scheduling primitive in the repo (no pg_cron, no scheduled function, no GitHub Action) — the README/CLAUDE.md mentions daily 04:00 ET, but nothing in supabase/migrations or workflows
  wires it up.
    - The function expects SCRYDEX_API_KEY + SCRYDEX_TEAM_ID env vars (supabase/functions/sync/index.ts:34-41); no documentation in repo confirming they're set in the deployed project.
  - supabase/functions/sync/index.ts:58 — writes to a sync_log table. The migration that creates sync_log and cache_refresh_policy lives in 001_tier0_extensions_and_helpers.sql (not read here but
  referenced). Verify both tables exist before relying on the function.

  Price data coverage

  - Raw NM pricing only — graded prices and other conditions (LP/MP/HP/DM) are never surfaced. The PSA-graded condition badge on market listings (app/(tabs)/market.tsx:142-145) is purely cosmetic (from
   the hard-coded CONDITIONS array).
  - No portfolio history — useCardPriceHistory returns [], so the Home portfolio sparkline never renders even with real collection data.
  - No refresh-on-focus — useCardPricing has staleTime: 24h; prices on the card detail page won't reflect new sync data for up to a day after a sync completes.

  Search / filtering

  - Sort by relevance is just .order('rarity', { ascending: false }) — i.e. rarest first regardless of how well names match (lib/api/cards.ts:90-92). Not real relevance.
  - Filter pills "Name / Set/Pack / Artist / Rarity" map to specific columns, but no combined query is possible (you can't search by name AND rarity).
  - Set/Pack filter calls .ilike('expansions.name', ...), which requires the embedded expansions table to be filterable — depends on !inner join in CARD_SELECT (which is present, line 176) but only
  works as a referenced filter — this likely silently fails or filters incorrectly. Worth a manual smoke test.

  Collection management end-to-end

  - lib/db/collection.ts — add/remove are wired. Quantity, condition, grade, acquired price are not. Schema-level collection_items has all those columns; local collection_cards does not. No "update
  quantity" or "edit condition" UI.
  - Collection is local-only (expo-sqlite, pokevault.db). Uninstall = data loss. Schema's collections/collection_items tables (005_app_collections.sql:47-148) are never touched.
  - Binders the same — local-only.
  - useAddCardToBinder dedupes by card_id (lib/api/binders.ts:127-131) — no UI feedback when a duplicate is silently rejected.

  Auth flows

  - app/(auth)/welcome.tsx:11-21 — signInWith() doesn't talk to Supabase Auth. Generates a hex token locally.
  - lib/supabase.ts — explicitly disables session features: autoRefreshToken: false, persistSession: false, detectSessionInUrl: false. Consistent with the mock-auth approach but means no real session
  can be persisted.
  - lib/auth/AuthContext.tsx — login() accepts an opaque token and User blob and saves to expo-secure-store. There's no validation against Supabase, no token refresh.
  - app/_layout.tsx:36-42 — routing gate works for the mock state, but is one redirect cycle. Acceptable.
  - No protected-route enforcement at the data layer — anonymous queries against Supabase will be RLS-blocked once you turn on the policies in 005_app_collections.sql. Once real auth lands, anonymous
  users will get empty results, not redirects.

  Pagination

  - app/search.tsx:109-118 — infinite scroll wired for non-price sorts. ✅
  - app/(tabs)/collection.tsx — loads all cards at once. Currently fine (SQLite) but unbounded.
  - app/(tabs)/market.tsx Listings — useListings limits to 10 cards. No "load more."
  - app/binder/[id].tsx — only first 9 cards rendered; no pagination.
  - Search price sort disables pagination (see above).

  ---
  CATEGORY 4 — FEATURE SUGGESTIONS AND ADDITIONS

  Each item: what exists today → what's missing → complexity.

  1. Wishlist — lib/db/wishlist.ts is fully implemented; app/card/[id].tsx:157-159 heart icon is unwired; no list screen. Wire the heart button to useAddToWishlist/useRemoveFromWishlist/useIsWishlisted
   and add a /wishlist screen (or a tab on Collection). Small.
  2. Price history charts (1Y / ALL ranges) — card_price_history schema exists; client fetches up to 90 rows; UI offers 7/30/90 only. Extend getCardPricing to fetch up to 365 days, add 1Y and ALL
  ranges to RANGES in components/charts/PriceChart.tsx, render min_all_time / max_all_time callouts in app/card/[id].tsx. Small.
  3. Portfolio dashboard — Home stats card and sparkline are scaffolded but the sparkline is empty (useCardPriceHistory is a stub). Build a Supabase RPC get_portfolio_history(user_id, range) that
  aggregates collection_items × card_prices_current × card_price_history. Add a "Top movers" section beneath the stats card. Medium.
  4. Graded card tracking — Schema columns ready (card_prices_current.{type,grader,grade}, collection_items.{grader,grade,cert_number}). Add a "Raw / PSA / CGC / BGS" segmented control to the card
  detail price module, fetch graded variants in getCardPricing, and add a grade picker to the "Add to collection" flow. Medium.
  5. Set completion tracker — expansions.printed_total exists; cards.expansion_id exists. Build a /set/[id] screen with a checklist grid showing owned vs. missing, sourced from a join on
  collection_items. Add an "Expansions" entry point from the Collection tab. Medium.
  6. TCGPlayer / eBay quick-buy — Card detail already has CTA infrastructure. Add two outbound buttons that deep-link to
  https://www.tcgplayer.com/search/pokemon/product?productLineName=pokemon&q=<name> and https://www.ebay.com/sch/i.html?_nkw=<name>+pokemon. Small.
  7. Price alerts — price_alerts table fully designed (005_app_collections.sql:198-233). Need: add-alert sheet on card detail, alerts list screen, Edge Function that runs after the daily price sync to
  compare current prices to thresholds, push notification dispatch. Large.
  8. Push notifications — Nothing scaffolded. Add expo-notifications, register tokens against a new device_tokens table, dispatch via a Supabase Edge Function. Needed for #7 and for new-set
  announcements. Medium.
  9. Real camera scanning — Current scanner is a fake animation. Add expo-camera, on-capture POST the image hash to a Supabase Edge Function that wraps Scrydex's lookup endpoint, render the real match.
   The UI animations in app/scanner.tsx are already production-quality; only the data plumbing is missing. Large.
  10. CSV export for insurance/resale — Iterate collection_cards (locally) joined with current price; write a CSV with expo-file-system and trigger expo-sharing. Small.
  11. Real auth (Supabase Auth) — Replace mocked signInWith() with supabase.auth.signInWithOAuth({ provider: 'apple' }) / 'google', plus an email/password fallback for the missing login/signup screens
  that CLAUDE.md references. Re-enable persistSession in lib/supabase.ts. Medium.
  12. Settings / profile screen — Currently no logout UI even though AuthContext.logout() exists. Add a settings entry point in the Home top bar (replacing or alongside the bell), with profile edit,
  notification prefs, logout. Small.
  13. Cloud sync of collections & binders — Move local SQLite to authoritative Supabase collections + collection_items with optimistic-update SQLite mirror. Eliminates the data-loss-on-uninstall risk.
  Large.
  14. Friends / social, real — profiles + friendships tables ready; profiles_username_trgm_idx ready for handle search. Build a friends search screen, friend-request inbox, and read public collections
  via the is_public flag. Large.
  15. Trading flow — TRADE buttons in Market and Friends tabs are dead. Needs a new trade_requests table, a UI for proposing/accepting trades, and a deep link from card detail. Large.
  16. Quantity + condition per collection card — collection_items.quantity and .condition exist in the schema but the local collection_cards table has neither. Migrate the local table to support a
  quantity field and add +/- controls + a condition picker on card detail. Medium.
  17. Pop-report display for graded cards — card_pop_reports table ready (004_tier3_historical.sql:62-97). Surface "PSA 10 population: 142" on card detail when graded mode is selected. Depends on #4.
  Small once #4 lands.
  18. Notifications screen — Empty bell badge implies one. Even before push notifications exist, an in-app feed of "price moved", "friend added card", "set released" events would justify the badge.
  Small.
  19. Search by multiple filters at once — Combine name + rarity + set + type into a single sheet. Schema supports it (GIN indexes on types, subtypes). Medium.
  20. Recent searches / saved searches — store in SQLite; show on the search screen when query is empty. Small.

  ---
  PRIORITY SUMMARY — Top 10 (impact ÷ effort)

  1. Wire the heart icon to wishlist (app/card/[id].tsx:157-159) and add a wishlist screen — DB layer is done, this is pure plumbing. Small.
  2. Fix the scanner "Add to collection" to actually call useAddToCollection (app/scanner.tsx:237-244) — single-line fix; right now the button lies. Trivial.
  3. Remove console.log('Featured card:', featured) at app/(tabs)/index.tsx:26. Trivial.
  4. Replace MOCK_DATA.cards[0] in the scanner (app/scanner.tsx:18, 39) with a real fetch — either random featured card or a Scrydex match. Small.
  5. Stop sending users to /card/c01 from the scanner — the destination renders blank because that ID isn't in Supabase. Trivial after #4.
  6. Implement useCardPriceHistory — schema is ready. The portfolio sparkline on Home is currently a hole. Small–Medium.
  7. Add empty-state and error-state to app/search.tsx, app/(tabs)/market.tsx, app/card/[id].tsx, app/binder/[id].tsx, app/friend/[id].tsx — silent blank screens today. Small.
  8. Add a settings screen with logout — AuthContext.logout() exists but is unreachable. Users currently cannot sign out. Small.
  9. Real Supabase Auth + create login.tsx / signup.tsx under app/(auth)/ — removes the entire mock-auth lie and unblocks RLS-protected features. Medium.
  10. Migrate collections/binders to Supabase collection_items with SQLite as cache — fixes data loss on uninstall and unblocks friends, trading, and public collection sharing. Large but foundational.

  Honorable mentions just below the line: delete dead lib/api/client.ts (TCGDex), wire collection Sort button, ship a real listings table (or remove the Market Listings tab until ready), and replace
  the fake Live auction with either a real auctions service or a clearly-labeled "Coming soon."