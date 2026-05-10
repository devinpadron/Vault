# PokeVault — Implementation TODO

Work is split into six phases. Complete each phase top-to-bottom before moving to the next. Items within a phase can be done in parallel where marked.

---

## Phase 0 — Foundation

Everything that every screen depends on. Do not build screens until this is done.

- [ ] **Design tokens** — Expand `constants/theme.ts` with all color tokens (`gold`, `bg`, `surface`, `elevated`, `line`, `lineStrong`, `text`, `text2`, `text3`, `up`, `down`) and spacing scale
- [ ] **Typography** — Load `Instrument Serif`, `Space Grotesk`, and `JetBrains Mono` via `expo-font`. Export a `Typography` constant with pre-built style objects (`display`, `displayItalic`, `body`, `mono`, `eyebrow`)
- [ ] **Types** — Create `types/index.ts` with interfaces: `Card`, `Binder`, `Friend`, `Listing`, `NewsItem`, `PriceHistory`
- [ ] **Mock data** — Create `data/mock.ts` that exports `MOCK_DATA` matching the shape in `../data.js` (same cards, binders, friends, listings, news, priceHistory)
- [ ] **Icon component** — Port the SVG icon set from `../icons.jsx` into `components/ui/Icon.tsx`. Accept `name`, `size`, `color`, `strokeWidth` props. Use `react-native-svg`
- [ ] **Navigation skeleton** — Restructure `app/(tabs)/_layout.tsx` with five tabs: Home, Collection, Scan (FAB), Friends, Market. Add Binders as a sixth tab or decide on placement
- [ ] **Custom tab bar** — Build `components/ui/TabBar.tsx`. The center "Scan" button is a raised gold circle (`#FFD700`) elevated 12px above the bar. All other tabs show icon + uppercase mono label. Active tab color is gold
- [ ] **Root layout** — Update `app/_layout.tsx` to apply dark background, load fonts, and register modal routes

---

## Phase 1 — Core Screens (Home + Collection + Card Detail)

These three screens form the primary loop and share the most components.

### Shared components (build once, use everywhere)

- [ ] **CardThumb** — `components/cards/CardThumb.tsx`. Renders a card as a flat art gradient rectangle (aspect ratio ~1.4) with a subtle gloss overlay. Props: `card: Card`, `width: number`
- [ ] **Card3D** — `components/cards/Card3D.tsx`. Wraps CardThumb in a Reanimated gesture handler (gyroscope or pan gesture) to produce a 3D tilt effect matching the prototype. Props: `card: Card`, `width: number`, `large?: boolean`
- [ ] **Sparkline** — `components/charts/Sparkline.tsx`. SVG line + area fill using a `number[]` data array. Matches the green sparkline on the Home screen
- [ ] **PriceChart** — `components/charts/PriceChart.tsx`. SVG polyline + gradient fill with a current-price dot. Used on Card Detail. Accepts range picker state and a `number[]` data array
- [ ] **FilterPills** — `components/ui/FilterPills.tsx`. Horizontally scrolling row of pill buttons. Active pill: gold background, dark text. Inactive: transparent with border. Props: `options: string[]`, `value: string`, `onChange`

### Screen 01 — Home

- [ ] Top bar with date eyebrow, greeting ("Good evening, Mira"), search icon button, bell icon button with gold dot badge
- [ ] Stats card — portfolio total value (large mono), 24h change (green arrow + amount), card count, Sparkline below
- [ ] Featured card section — Card3D centered, card name + variant, rarity and price chips, aurora gradient background
- [ ] "The Brief" news feed — list of NewsItem rows: art thumbnail, tag + timestamp, title, read time

### Screen 02 — Collection

- [ ] Page header with card count + set count eyebrow, large "Your collection" display title
- [ ] FilterPills row (All / Foil / Set / Rarity / Value) + Sort button
- [ ] 2-column grid of Card3D tiles — each cell has card below with name, variant, price, and change indicator
- [ ] Filter logic: "Foil" filter narrows to cards where `foil === true`; other filters are stubs for now

### Screen 03b — Card Detail

- [ ] Sticky back-button header with share and heart icon buttons
- [ ] Hero Card3D centered with art-colored radial background glow
- [ ] Card name + variant display title, rarity chip, type chip
- [ ] Price module: market price (large), 30d change %, PriceChart with range picker (1W / 1M / 6M / 1Y / ALL), multi-source price row (eBay 30d / TCGPlayer / PSA 10)
- [ ] Card info metadata table: Artist, Set, Number, Released, Rarity — each row alternating `bg` / `surface`
- [ ] CTAs: "Add to binder" (gold, full width) + Trade icon button (ghost, square)
- [ ] Add-to-Binder bottom sheet — backdrop + sheet with binder list rows and a "New binder" dashed button

---

## Phase 2 — Binders

- [ ] **Screen 03 — Binders list**
  - [ ] Header with binder count + card count eyebrow, "Binders" italic display title, + icon button
  - [ ] Vertical list of binder cover cards — each is a gradient panel (168px tall) with: spine shadow on the left, three decorative ring dots, two stacked CardThumbs in the top-right corner, binder name + subtitle + card count in the bottom-left
  - [ ] Gloss overlay on each binder cover (linear-gradient with a highlight)
  - [ ] Tap navigates to Binder Open

- [ ] **Screen 04b — Binder Open**
  - [ ] Sticky back-button header with share and overflow-menu icon buttons
  - [ ] Subtitle eyebrow + binder name display title
  - [ ] 3×3 sleeve grid — each sleeve is a dark inset rectangle containing a CardThumb with a sleeve-sheen overlay
  - [ ] Pagination dots below the grid (active dot is wider)
  - [ ] "Share binder" CTA (gold) + Add card icon button

---

## Phase 3 — Overlays (Scanner + Search)

### Screen 05 — Scanner

- [ ] Full-screen dark overlay (no tab bar)
- [ ] Close button (top-left), "SCAN MODE" pill (center), torch toggle button (top-right)
- [ ] `scanning` phase: animated corner-bracket reticle (gold corners, no fill), gold scanning beam that sweeps vertically with `pv-scan` animation
- [ ] Auto-advance to `identified` phase after ~2.4 seconds
- [ ] `identified` phase: particle burst (14 colored dots radiating outward), Card3D materializes center-screen with a rise animation
- [ ] Result sheet at bottom: match confidence label, card name + set + price, Rescan + "Add to collection" buttons

### Screen 08 — Search

- [ ] Full-screen overlay with auto-focused search input
- [ ] Clear button appears in the input when text is present. Cancel button dismisses the overlay
- [ ] Multi-select filter pills (Name / Set / Pokémon / Artist / Release / Rarity) — active pills are gold-tinted
- [ ] "Recent" list when query is empty — tapping a recent item pre-fills the input
- [ ] 3-column card grid of live results below — updates as the user types

---

## Phase 4 — Friends

### Screen 06 — Friends list

- [ ] Header with online count eyebrow, "The circle" display title
- [ ] Horizontal story-style row of online friends — each has a gold-to-pink gradient ring around the avatar, first-name label below
- [ ] Full friend list rows — avatar (with green online dot when online), display name, handle + binder count, last-added card name, portfolio value (mono gold), Trade button

### Screen 06b — Friend Profile

- [ ] Back-button header + overflow menu button
- [ ] Avatar with gradient ring (gold → pink), display name, handle eyebrow
- [ ] Stats row: Value / Binders / Cards
- [ ] Trade (gold) + Message (ghost) CTAs
- [ ] "Public binders" section — list of the friend's binder cards (same style as Binders screen)

---

## Phase 5 — Market

### Screen 07 — Market

- [ ] Header with active listing count eyebrow, "Market" italic display title
- [ ] Segmented control: Listings | Live (Live has a red dot indicator)

- [ ] **Listings sub-view**
  - [ ] Sort pill row: Trending / Lowest price / Ending soon / PSA Graded
  - [ ] Vertical list of listing rows — CardThumb (64px), card name + variant, set number, condition badge (PSA condition = gold-tinted), seller handle + star rating, listing age, price + "BUY NOW" eyebrow

- [ ] **Live sub-view**
  - [ ] Video placeholder tile (gradient "table" background, Card3D center) — `LIVE` badge top-left, viewer count top-right, chat comment strip bottom
  - [ ] Current lot panel: lot number, card name, HIGH BID (animated ticking mono number), countdown timer, bidder count with stacked avatars
  - [ ] Watch (ghost) + "Place bid · $X" (gold, pulsing) CTAs — bid amount increments with the ticking bid

---

## Phase 6 — Polish

These can overlap with earlier phases but should be reviewed in full once all screens exist.

- [ ] **Reanimated entry animations** — All list items and grid cells should fade + slide up on mount, staggered by index (matching the `pv-rise` animation in the prototype)
- [ ] **Card 3D tilt** — Finalize the `Card3D` gyroscope or pan-gesture tilt: perspective transform, foil shimmer gradient that follows pointer/tilt angle, subtle drop shadow that shifts with tilt
- [ ] **Foil shimmer** — Foil cards get a rainbow gradient overlay whose position updates with the tilt gesture
- [ ] **Scanner beam animation** — Looping vertical sweep using Reanimated `withRepeat` + `withTiming`
- [ ] **Scanner particle burst** — 14 colored dots animate outward from center using Reanimated on phase transition
- [ ] **Live bid tick animation** — The bid number on the Live sub-view pulses (scale briefly up then back) each time the value increments
- [ ] **Tab bar haptics** — Confirm `HapticTab` fires on every tab press (already partially wired)
- [ ] **Bottom sheet gesture** — Add drag-to-dismiss to the Add-to-Binder sheet using a pan gesture + spring animation
- [ ] **Safe area** — Audit every screen for safe-area insets (status bar, home indicator, notch)
- [ ] **Dark splash screen** — Update `app.json` splash background to `#0A0A0C`
- [ ] **Accessibility** — Add `accessibilityLabel` and `accessibilityRole` to all interactive elements

---

## Deferred / Post-MVP

These are not needed for the initial build but should be planned for.

- [ ] Real card image assets (replace gradient art placeholders)
- [ ] API integration — replace `data/mock.ts` with real network calls
- [ ] Authentication — login / signup flow
- [ ] Expo Camera integration for the real scanner
- [ ] Push notifications for price alerts and friend activity
- [ ] Binder reordering (drag-and-drop)
- [ ] Card grading submission flow
