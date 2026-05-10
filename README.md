# Vault

A dark, premium trading-card vault app built with Expo (React Native + TypeScript).

The design reference is `../Vault.html` — a fully interactive hi-fi prototype showing all 9 screens with live animations and a 3D card-tilt effect. Every screen and component in this codebase is a direct translation of that prototype into native React Native.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Expo SDK (managed workflow) |
| Language | TypeScript (strict) |
| Navigation | Expo Router (file-based) |
| Styling | StyleSheet + design tokens from `constants/theme.ts` |
| Animation | React Native Reanimated 3 |
| Icons | Custom SVG icon set (matching `../icons.jsx` in the prototype) |
| Camera / Scan | Expo Camera |

---

## Design System

All visual decisions come from the prototype. Token values live in `constants/theme.ts`.

### Colors

| Token | Value | Usage |
|---|---|---|
| `gold` | `#FFD700` | Primary accent — active tab, CTAs, price displays |
| `bg` | `#0A0A0C` | App background |
| `surface` | `#111114` | Card cells, list rows |
| `elevated` | `#18181C` | Bottom sheets, modals |
| `line` | `rgba(255,255,255,0.08)` | Dividers, borders |
| `lineStrong` | `rgba(255,255,255,0.14)` | Focused input borders |
| `text` | `#FFFFFF` | Primary text |
| `text2` | `rgba(255,255,255,0.6)` | Secondary text |
| `text3` | `rgba(255,255,255,0.35)` | Tertiary / labels |
| `up` | `#4ADE80` | Positive price change |
| `down` | `#FF5C5C` | Negative price change |

### Typography

Three roles, each with a dedicated font family:

| Role | Font | Notes |
|---|---|---|
| Display | Instrument Serif | Headlines, card names, screen titles — italic variant used for accented words |
| Body / UI | Space Grotesk | Paragraphs, buttons, general copy |
| Mono | JetBrains Mono | Prices, eyebrow labels, tags, metadata |

### Spacing

Base unit is `4`. Common values: `8 · 10 · 14 · 18 · 22`. Horizontal screen padding is always `22`.

---

## Screens

The prototype labels each screen with a number. These map directly to Expo Router file paths.

```
Section 01 — The Hub
  01  Home            app/(tabs)/index.tsx
  02  Collection      app/(tabs)/collection.tsx
  03  Binders         app/(tabs)/binders.tsx

Section 02 — Card-first detail
  03b Card Detail     app/card/[id].tsx         (slide-up overlay)
  04b Binder Open     app/binder/[id].tsx        (slide-up overlay)
  08  Search          app/search.tsx             (full-screen overlay)

Section 03 — Active states
  05  Scanner         app/scanner.tsx            (full-screen overlay)
  06  Friends         app/(tabs)/friends.tsx
  06b Friend Profile  app/friend/[id].tsx        (slide-up overlay)
  07  Market          app/(tabs)/market.tsx
```

### Screen Details

**01 Home** — Dashboard with portfolio value + 24h change, a sparkline, a featured card of the day (large 3D tilt), and a news feed called "The Brief."

**02 Collection** — 2-column card grid with filter pills: All / Foil / Set / Rarity / Value. Each cell shows the card thumbnail, name, and price with a change indicator.

**03 Binders** — Vertical list of binder covers. Each cover is a full-bleed gradient panel with a spine effect, decorative rings, stacked card thumbnails, and binder metadata. Tap opens Binder Open.

**03b Card Detail** — Slide-up detail page with: hero card (large 3D tilt), name + rarity chips, price module (SVG chart + range picker + multi-source prices), card metadata table, and Add-to-Binder / Trade CTAs.

**04b Binder Open** — Binder title header, then a 3×3 sleeve grid rendered on a gradient background. Pagination dots below. Share binder + Add card CTAs.

**05 Scanner** — Full-screen dark camera view. Two phases: `scanning` (animated corner-bracket reticle with sweeping gold beam) → `identified` (card materializes with particle burst, match result sheet slides up with Rescan / Add to collection buttons).

**06 Friends** — Story-style online-avatar row at top, then a scrollable list of all friends showing avatar, handle, binder count, last-added card, portfolio value, and a Trade button.

**06b Friend Profile** — Avatar with gradient ring, display name, stats row (Value / Binders / Cards), Trade + Message CTAs, list of the friend's public binders.

**07 Market** — Segmented control with two sub-views:
- *Listings* — sort pill row + vertical listing cards (thumbnail, card info, condition badge, seller score, price)
- *Live* — simulated video tile with LIVE badge and chat overlay, current-lot bid with real-time tick, bidder count, Place Bid CTA

**08 Search** — Full-screen overlay. Auto-focused search bar, multi-select filter pills (Name / Set / Pokémon / Artist / Release / Rarity), recent searches list, live 3-column results grid.

---

## Navigation Structure

```
RootLayout           app/_layout.tsx
└── TabNavigator     app/(tabs)/_layout.tsx
    ├── Home         (index)
    ├── Collection   (collection)
    ├── [Scan FAB]   → launches Scanner as a modal overlay
    ├── Friends      (friends)
    └── Market       (market)
    └── Binders      (binders)

Modal overlays (presented over the tab bar)
    ├── Card Detail     /card/[id]
    ├── Binder Open     /binder/[id]
    ├── Friend Profile  /friend/[id]
    ├── Search          /search
    └── Scanner         /scanner
```

The center tab item is a raised gold FAB that triggers the Scanner — it does not navigate to a tab screen, so the tab bar uses a custom component.

---

## Data Layer

The prototype's `../data.js` defines the full shape of every entity. These become TypeScript interfaces in `types/index.ts`:

- `Card` — id, name, variant, set, rarity, value, change, foil, art (3-stop gradient tuple), types, artist, release, no
- `Binder` — id, name, subtitle, count, cover (Card ref), tone (2-stop gradient tuple)
- `Friend` — id, name, handle, avatar (2-stop gradient tuple), value, binders, online, recent
- `Listing` — id, card (Card), price, condition, seller, seller_score, listed
- `NewsItem` — id, tag, when, title, art, minutes
- `PriceHistory` — number[]

In production these come from an API. During the initial build, use `data/mock.ts` which directly mirrors `../data.js`.

---

## Running the App

```bash
cd Vault
npm install
npx expo start
```

Press `i` for iOS Simulator, `a` for Android emulator.
