# Scrydex API Reference

Scraped from https://scrydex.com/docs on 2026-05-11. Update this file if the API evolves.

---

## Authentication

Every request requires two headers:

```
X-Api-Key: <your_api_key>
X-Team-ID: <your_team_id>
```

No query-param auth. The API key and team ID must never be bundled into the React Native app — they live only in the AWS Lambda environment variables (`SCRYDEX_API_KEY`, `SCRYDEX_TEAM_ID`).

---

## Base URL

```
https://api.scrydex.com/pokemon/v1
```

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/cards` | Search / list cards |
| GET | `/cards/{id}` | Single card detail |
| GET | `/cards/{id}/price_history` | Daily price history |
| GET | `/cards/{id}/listings` | Sold listings for a card |
| GET | `/expansions` | List / search expansions |
| GET | `/expansions/{id}` | Single expansion |
| GET | `/expansions/{id}/cards` | Cards within an expansion |
| POST | `/vision/v1/cards/identify` | Image recognition (Vision) — see below |

> Note: the Vision endpoint is on a different base (`https://api.scrydex.com/vision/v1`) — not under `/pokemon/v1`. Same auth headers.

---

## Query Parameters

### Card Search (`GET /cards`)

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `q` | string | — | Lucene-style query (see syntax below) |
| `page` | integer | 1 | |
| `page_size` | integer | 100 | Max 100 |
| `select` | string | all fields | Comma-separated field names to return |
| `orderBy` | string | — | e.g. `expansion_sort_order ASC` |
| `include` | string | — | Pass `prices` to include variant pricing |
| `casing` | string | — | `camel` or `snake` for output key casing |

### Search Query Syntax (`q` param)

```
# By name
q=name:charizard
q=name:"venusaur v"
q=name:char*          # wildcard
q=!name:charizard     # exact match

# By rarity
q=rarity:"Special Illustration Rare"
q=rarity:"Illustration Rare"
q=rarity:"Rare Holo"

# By type
q=types:fire
q=-types:water        # exclude water

# By HP range
q=hp:[100 TO 150]     # inclusive
q=hp:{100 TO 150}     # exclusive

# Combined (AND is implicit)
q=name:charizard subtypes:mega

# OR
q=(subtypes:vmax OR subtypes:vstar)

# Nested fields
q=expansion.id:sv4
q=attacks.name:Hypnosis
```

### Price History (`GET /cards/{id}/price_history`)

| Param | Type | Notes |
|-------|------|-------|
| `days` | integer | Days back from today |
| `start_date` | string | YYYY-MM-DD |
| `end_date` | string | YYYY-MM-DD |
| `variant` | string | e.g. `holofoil`, `reverseHolofoil` |
| `condition` | string | `NM`, `LP`, `MP`, `DM` |
| `page` / `page_size` | integer | Pagination |

### Listings (`GET /cards/{id}/listings`)

| Param | Type | Notes |
|-------|------|-------|
| `days` | integer | Days since sale |
| `source` | string | e.g. `ebay` |
| `variant` | string | Card variant |
| `grade` | string | PSA grade value |
| `company` | string | Grading company |
| `condition` | string | `NM`, `LP`, etc. |
| `is_perfect` | boolean | |
| `is_error` | boolean | |
| `is_signed` | boolean | |
| `page` / `page_size` | integer | |

---

## Response Envelope

All list endpoints wrap results in:

```json
{
  "status": "success",
  "data": [...],
  "page": 1,
  "pageSize": 100,
  "totalCount": 5000
}
```

Single-resource endpoints return the object directly (no envelope).

---

## TypeScript Interfaces

```typescript
// ─── Images ──────────────────────────────────────────────────────────────────

export interface ScrydexImage {
  type: string;     // "front" | "back"
  small: string;    // https://images.scrydex.com/pokemon/{id}/small
  medium: string;
  large: string;
}

// ─── Expansion (set) ─────────────────────────────────────────────────────────

export interface ScrydexExpansion {
  id: string;
  name: string;
  series: string;
  code: string;
  total: number;           // total cards incl. secret rares
  printed_total?: number;  // cards shown in printed numbering
  language: string;
  language_code: string;   // "EN", "JA"
  release_date?: string;   // "YYYY/MM/DD"
  is_online_only: boolean;
  logo?: string;
  symbol?: string;
}

// ─── Pricing ─────────────────────────────────────────────────────────────────

export interface ScrydexPrice {
  variant: string;      // "normal" | "holofoil" | "reverseHolofoil" | "unlimitedHolofoil"
  condition: string;    // "NM" | "LP" | "MP" | "DM"
  type: string;         // "raw" | "graded"
  low: number;          // USD
  market: number;       // USD — use this as the display price
  currency: string;     // "USD"
  is_perfect: boolean;
  is_signed: boolean;
  is_error: boolean;
}

export interface ScrydexVariant {
  name: string;           // e.g. "unlimitedHolofoil"
  prices: ScrydexPrice[]; // populated only when include=prices
}

// ─── Card (brief — returned by list/search) ───────────────────────────────────

export interface ScrydexCardBrief {
  id: string;                    // e.g. "base1-4"
  name: string;
  supertype: string;             // "Pokémon" | "Trainer" | "Energy"
  subtypes?: string[];           // ["Stage 2"] | ["V"] | ["VMAX"] | etc.
  types?: string[];              // ["Fire"] | ["Water"] | etc. — same strings as TCGDex
  hp?: string;                   // NOTE: string, not number ("120")
  number: string;                // card number within expansion ("4")
  printed_number?: string;       // as printed on card ("4/102")
  rarity?: string;               // "Rare Holo" | "Special Illustration Rare" | etc.
  rarity_code?: string;          // "★H"
  artist?: string;               // was `illustrator` in TCGDex
  images: ScrydexImage[];        // use images[0].large for full card display
  expansion: ScrydexExpansion;   // was `set` in TCGDex
  language_code: string;
  expansion_sort_order: number;  // numerical position in expansion (was `localId` in TCGDex)
  variants?: ScrydexVariant[];   // populated only when include=prices
}

// ─── Card (full — returned by GET /cards/{id}) ────────────────────────────────

export interface ScrydexAttack {
  cost: string[];
  converted_energy_cost: number;
  name: string;
  text: string;
  damage: string;
}

export interface ScrydexAbility {
  type: string;
  name: string;
  text: string;
}

export interface ScrydexWeaknessResistance {
  type: string;
  value: string;
}

export interface ScrydexCardFull extends ScrydexCardBrief {
  abilities?: ScrydexAbility[];
  attacks?: ScrydexAttack[];
  weaknesses?: ScrydexWeaknessResistance[];
  resistances?: ScrydexWeaknessResistance[];
  retreat_cost?: string[];
  converted_retreat_cost?: string;
  flavor_text?: string;          // was `description` in TCGDex
  regulation_mark?: string;
  national_pokedex_numbers?: number[];
}

// ─── Price History ────────────────────────────────────────────────────────────

export interface ScrydexPriceHistoryEntry {
  date: string;               // "YYYY-MM-DD"
  prices: ScrydexPrice[];
}

export interface ScrydexPriceHistoryResponse {
  data: ScrydexPriceHistoryEntry[];
  page: number;
  page_size: number;
  count: number;
  total_count: number;
}

// ─── Listing ─────────────────────────────────────────────────────────────────

export interface ScrydexListing {
  id: string;
  source: string;         // "ebay"
  card_id: string;
  title: string;
  variant: string;
  company?: string;        // grading company: "PSA" | "CGC" | "TAG"
  grade?: string;
  is_perfect: boolean;
  is_error: boolean;
  is_signed: boolean;
  url: string;
  price: number;           // USD
  currency: string;        // "USD"
  sold_at: string;         // "YYYY/MM/DD"
}

// ─── List response wrapper ────────────────────────────────────────────────────

export interface ScrydexListResponse<T> {
  status: string;          // "success"
  data: T[];
  page: number;
  pageSize: number;
  totalCount: number;
}
```

---

## Image URL Pattern

Scrydex returns image URLs directly in the `images` array. No suffix appending needed.

```typescript
// TCGDex (old):
const url = `${raw.image}/high.webp`;

// Scrydex (new):
const url = raw.images[0]?.large ?? raw.images[0]?.medium;
```

Sizes: `small` (~100px wide), `medium` (~300px), `large` (~600px).

---

## Key Differences vs TCGDex

| Concern | TCGDex | Scrydex |
|---------|--------|---------|
| Auth | None (public) | `X-Api-Key` + `X-Team-ID` headers |
| Base URL | `https://api.tcgdex.net/v2/en` | `https://api.scrydex.com/pokemon/v1` |
| Card list param | `pagination:page` / `pagination:itemsPerPage` | `page` / `page_size` |
| Sort param | `sort:field` / `sort:order` | `orderBy` (e.g. `expansion_sort_order ASC`) |
| Rarity filter | `rarity=Special Illustration Rare` | `q=rarity:"Special Illustration Rare"` |
| Image URL | `${image}/high.webp` (string concat) | `images[0].large` (array lookup) |
| Card position in set | `localId` (string) | `expansion_sort_order` (number) |
| Set object key | `set` | `expansion` |
| Set total count | `set.cardCount.total` / `.official` | `expansion.total` / `.printed_total` |
| Illustrator | `illustrator` | `artist` |
| Card description | `description` | `flavor_text` |
| HP type | `number` | `string` (parse with `parseInt`) |
| Pricing currency | EUR (Cardmarket) | USD (eBay sold listings) |
| Pricing location | Inline `pricing.cardmarket` | `variants[].prices` via `include=prices` |
| Type strings | "Fire", "Lightning", "Darkness" | "Fire", "Lightning", "Darkness" (same) |
| Variant flags | `variants.holo` / `.reverse` / etc. (booleans) | `variants[].name` strings |
| Response envelope | Array directly | `{ status, data, page, pageSize, totalCount }` |

### Rarity string parity
Scrydex uses the same rarity strings as TCGDex for modern sets. The `FOIL_RARITIES` set and `RARITY_VALUES` map in `lib/api/types.ts` do **not** need to change.

### Type string parity
`types[]` values ("Fire", "Water", "Grass", "Lightning", "Psychic", "Darkness", "Metal", "Dragon", "Fairy", "Colorless", "Fighting") are the same in both APIs. The type map needs only renaming, not content changes.

---

## Pricing: Getting Market Value

To get a display price for a card, request `include=prices` and extract the NM raw market price for the holofoil variant (or normal for common/uncommon):

```typescript
function getMarketPrice(card: ScrydexCardFull): number | undefined {
  const holoVariant = card.variants?.find(v =>
    v.name === 'holofoil' || v.name === 'unlimitedHolofoil'
  );
  const fallbackVariant = card.variants?.find(v => v.name === 'normal');
  const variant = holoVariant ?? fallbackVariant;
  const nmPrice = variant?.prices.find(p => p.condition === 'NM' && p.type === 'raw');
  return nmPrice?.market;
}
```

Prices are already USD — no EUR→USD conversion needed (unlike TCGDex Cardmarket data).

---

## Vision API (`POST /vision/v1/cards/identify`)

Image recognition for trading cards. Used by the in-app scanner (RN client →
Supabase `identify` Edge Function → Scrydex Vision). The Edge Function is the
only place the API key is allowed to touch — the RN bundle never sees it.

**Base URL:** `https://api.scrydex.com/vision/v1` (note: NOT under `/pokemon/v1`)
**Cost:** 5 credits per request (vs 1 for metadata). Captured in `X-Credits-Used`.
**Latency:** typically 1–3 seconds.
**Image limits:** JPEG / PNG / WebP, ≤ 20 MB. Recommended 1500–2500 px on the long side, 200–500 KB after optimization.

### Inputs (two modes)

1. **Image URL** — JSON body:
   ```json
   { "image_url": "https://…/card.jpg", "games": ["pokemon"] }
   ```
2. **File upload** — `multipart/form-data` with fields `image` (binary) and `games` (comma-separated string). This is the mobile path.

### Response

```json
{
  "data": {
    "analysis": {
      "type": "raw" | "graded",
      "game": "pokemon",
      "language_code": "EN",
      "graded_details": {                  // present when type === "graded"
        "company":      "PSA",
        "grade_code":   "GEM-MT",
        "grade_label":  "Gem Mint",
        "grade_number": "10",
        "year":         "2026",
        "cert":         "149202555"
      }
    },
    "matches": [
      {
        "score":   1.13252,                // combined visual + data signal
        "variant": "holofoil",             // optional
        "card":    { /* ScrydexCardBrief */ }
      }
    ],
    "page_size":   100,
    "count":       1,
    "total_count": 1
  }
}
```

Scores typically sit in **0.7 – 1.3+**. Bucketing used by the scanner (`lib/api/vision.ts:confidenceLabel`):
- `>= 1.0` — strong match
- `0.85 – 1.0` — likely
- `< 0.85` — possible (still shown, but flagged)
- below `MIN_MATCH_SCORE = 0.7` — treated as no match.

The matched `card.id` uses the same scheme as `/cards/{id}` (e.g. `me2pt5-284`), so we route the top match to our existing `/card/[id]` screen.
