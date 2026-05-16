# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npx expo start          # Start dev server (press i for iOS sim, a for Android)
npx expo run:ios        # Build and run on iOS
npx expo run:android    # Build and run on Android
npm run lint            # Run ESLint
npx tsc --noEmit        # Type-check without emitting
```

There is no test suite. Verify correctness with `npx tsc --noEmit` and manual testing.

## Architecture

**Vault** is a dark-themed Pokémon card collection app built on Expo SDK 54 / React Native 0.81.5 / TypeScript strict mode.

### Routing

Expo Router v6 (file-based). All screens are in `app/`:
- `app/(auth)/` — welcome, login, signup (gated when unauthenticated)
- `app/(tabs)/` — index (Home), collection, binders, friends, market
- `app/card/[id].tsx`, `app/binder/[id].tsx`, `app/friend/[id].tsx` — slide-up modal overlays
- `app/scanner.tsx`, `app/search.tsx` — full-screen overlays

Navigation gating lives in `app/_layout.tsx` — it reads `AuthContext` and redirects unauthenticated users to `/(auth)/welcome`.

### Data layer

**Primary card source**: Supabase table `pokemon_cards`. The client is in `lib/supabase.ts` and reads `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`. The row shape is `SupabaseCard` in `lib/api/types.ts`; `mapRow()` in the same file converts a row to the app-level `Card` type.

**Pricing**: `lib/api/pricing.ts` (calls the Scrydex API — credentials must never be in the RN bundle; they live in the server/Edge Function environment).

**Data fetching**: `@tanstack/react-query`. `QueryClientProvider` wraps the app in `app/_layout.tsx`. All API hooks use `useQuery` / `useInfiniteQuery`.

**Local persistence**: `expo-sqlite` via `lib/db/database.ts` (singleton `getDb()`). Tables: `collection_cards`, `binders`, `binder_cards`, `wishlist_cards`. Hooks in `lib/db/collection.ts` and `lib/db/wishlist.ts` call `queryClient.invalidateQueries` after writes.

**Auth**: `lib/auth/AuthContext.tsx` provides `useAuth()` with `status`, `user`, `token`, `login()`, `logout()`. Tokens are stored in `expo-secure-store` via `lib/auth/storage.ts`.

**Mock data**: `data/mock.ts` — target for removal (see `TODO-functional.md`). Do not add new references to `MOCK_DATA`.

### Design system

All tokens are in `constants/theme.ts`. **Never use raw hex values or hardcoded font names** — always import from `Colors`, `FontFamily`, `Spacing`, `Radius`.

- Primary accent: `Colors.gold` (`#FFD700`)
- Backgrounds: `Colors.bg` → `Colors.surface` → `Colors.elevated`
- Fonts: `FontFamily.display` (Instrument Serif, headlines), `FontFamily.body` (Space Grotesk, UI), `FontFamily.mono` (JetBrains Mono, prices/tags)
- Horizontal screen padding: always `Spacing.xl` (22)

### Component conventions

Shared components live in `components/ui/` (`Icon`, `Avatar`, `FilterPills`, `SkeletonCard`, `SkeletonRow`, `ErrorPanel`) and `components/cards/` (`Card3D`, `CardThumb`). Use `ErrorPanel` for error states and `SkeletonCard`/`SkeletonRow` while loading.

### Type utilities

`types/index.ts` exports `Card`, `Binder`, `Friend`, `Listing`, `NewsItem`, `User`, `AppData`. Helper functions `cardBaseName(name)` and `cardNameVariant(name)` extract the base name / variant suffix from a card name string (the `card.variant` field is deprecated in favor of these).

### Supabase schema

Migrations are in `supabase/migrations/`. The schema is tiered by data volatility: Tier 1 (static card metadata), Tier 2 (current pricing), Tier 3 (price history — append-only), plus app collections tables. See `docs/scrydex-api.md` for the Scrydex API reference used for pricing data.

### Roadmap

`TODO-functional.md` is the authoritative list of what is broken or not yet wired. Work through it top-to-bottom (Section 1 → 9) — earlier sections unblock later ones.
