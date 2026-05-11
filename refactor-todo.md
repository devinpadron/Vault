# Scrydex Migration Refactor Plan

Switch PokeVault from TCGDex (free) to Scrydex (paid) with an AWS caching proxy between the app and Scrydex. The proxy absorbs repeated requests so we only pay for cache misses.

---

## Architecture Overview

```
React Native App
      │
      ▼
AWS API Gateway  ──►  Lambda (cache check)  ──►  DynamoDB (cache store)
                              │
                              │ cache miss only
                              ▼
                         Scrydex API  (paid, rate-limited)
```

**Cache strategy:**
- Card search results: TTL 24 hours
- Individual card detail: TTL 7 days (card data never changes)
- Set listings: TTL 7 days
- Pricing data: TTL 1 hour (prices fluctuate)

---

## Step 1 — Audit the Scrydex API and document its response shapes

**Prompt this to AI:**

> I am migrating a Pokémon TCG app from TCGDex to Scrydex. I have the Scrydex API key and need to understand its response shapes before writing any code.
>
> Using the Scrydex API docs at https://scrydex.com, document the following as TypeScript interfaces:
>
> 1. The response shape for **card search** (list endpoint) — what fields are returned per card (id, name, image URL, set info, rarity, types, etc.)
> 2. The response shape for a **single card detail** — all fields including pricing, variants, illustrator, HP, description, set card count
> 3. The **query parameters** for search — how do you filter by rarity? paginate? sort?
> 4. How **image URLs** are constructed — does it follow a pattern like TCGDex's `{image}/high.webp`?
> 5. How **pricing** data is structured — is it Cardmarket EUR prices like TCGDex? TCGPlayer USD? Something else?
> 6. What **authentication** method is used — Bearer token in header? API key as query param?
>
> Write the full TypeScript interfaces for ScrydexCardBrief and ScrydexCardFull, and note any fields that differ from the TCGDex equivalents I'll share:
>
> ```typescript
> // TCGDex shapes (for comparison)
> interface CardBrief { id: string; localId: string; name: string; image?: string; }
> interface CardFull extends CardBrief {
>   rarity: string; category: string; illustrator?: string; hp?: number;
>   types?: string[]; suffix?: string; description?: string;
>   variants?: { firstEdition?: boolean; holo?: boolean; normal?: boolean; reverse?: boolean; wPromo?: boolean; };
>   pricing?: { cardmarket?: { updated?: string; avg?: number; low?: number; trend?: number; avg1?: number; avg7?: number; avg30?: number; }; };
>   set: { id: string; name: string; cardCount: { total: number; official: number }; releaseDate?: string; };
> }
> ```
>
> Output: a markdown doc with all TypeScript interfaces plus notes on auth and image URL construction. Save it as `docs/scrydex-api.md` in the project.

---

## Step 2 — Provision AWS infrastructure (DynamoDB + Lambda + API Gateway)

**Prompt this to AI:**

> I need to set up an AWS caching proxy for a Pokémon TCG card API (Scrydex). The proxy caches responses in DynamoDB to minimize paid API calls. I do not have Terraform or CDK set up — scaffold everything using the AWS CDK v2 with TypeScript.
>
> Create a new directory `aws/` in the project root with a CDK app that provisions:
>
> **DynamoDB table `pokevault-card-cache`:**
> - Partition key: `cacheKey` (String) — will be a hash of the Scrydex endpoint + query params
> - Attributes: `cacheKey`, `data` (String, JSON-serialized response), `ttl` (Number, Unix timestamp for DynamoDB TTL)
> - Enable TTL on the `ttl` attribute
> - Billing mode: PAY_PER_REQUEST
>
> **Lambda function `pokevault-scrydex-proxy`:**
> - Runtime: Node.js 22
> - Handler receives an API Gateway event with `path` and `queryStringParameters`
> - Logic:
>   1. Build a `cacheKey` by hashing `path + sorted query params` with SHA-256
>   2. Look up `cacheKey` in DynamoDB
>   3. If found and not expired: return `data` immediately with header `X-Cache: HIT`
>   4. If not found: call Scrydex with the same path/params, passing the API key from `SCRYDEX_API_KEY` env var
>   5. Store the Scrydex response in DynamoDB with a TTL based on the path:
>      - paths matching `/cards/{id}` (single card): TTL = now + 7 days
>      - paths matching `/cards` (search/list): TTL = now + 24 hours
>      - paths matching `/prices` or containing `pricing`: TTL = now + 1 hour
>   6. Return the Scrydex response with header `X-Cache: MISS`
>   7. Return errors from Scrydex as-is with their status codes
> - Environment variables: `SCRYDEX_API_KEY`, `DYNAMO_TABLE_NAME`
> - IAM: grant the Lambda `dynamodb:GetItem` and `dynamodb:PutItem` on the table
>
> **API Gateway (HTTP API):**
> - Route `ANY /{proxy+}` → Lambda
> - No auth (the app will call this directly; the Scrydex key stays in Lambda env)
> - Output the invoke URL as a CDK stack output named `ProxyUrl`
>
> Provide:
> - `aws/bin/app.ts` — CDK entry point
> - `aws/lib/stack.ts` — the stack definition
> - `aws/lambda/handler.ts` — the Lambda handler
> - `aws/package.json` — CDK and AWS SDK dependencies
> - `aws/tsconfig.json`
> - Brief deployment instructions as a comment at the top of `aws/lib/stack.ts`
>
> Do not use any third-party HTTP libraries in the Lambda — use the built-in Node.js `https` module or native `fetch` (available in Node 22).

---

## Step 3 — Update `lib/api/types.ts` for Scrydex response shapes

**Prompt this to AI:**

> I am migrating a React Native Pokémon TCG app from TCGDex to Scrydex. I need to update `lib/api/types.ts` to match Scrydex's response shapes.
>
> Here is the current file at `lib/api/types.ts`:
> ```
> [paste full contents of lib/api/types.ts]
> ```
>
> Here is the Scrydex API documentation I captured in `docs/scrydex-api.md`:
> ```
> [paste full contents of docs/scrydex-api.md]
> ```
>
> Perform these changes — no other changes:
>
> 1. Rename `CardBrief` → `ScrydexCardBrief` and update its fields to match the Scrydex list-endpoint shape
> 2. Rename `CardFull` → `ScrydexCardFull` and update all fields to match the Scrydex detail-endpoint shape
> 3. Rename `CardmarketPrices` → `ScrydexPricing` and update its fields to match the Scrydex pricing shape
> 4. Rename `TCGDEX_TYPE_MAP` → `SCRYDEX_TYPE_MAP` and update any type string keys that differ between TCGDex and Scrydex (e.g. if Scrydex uses "Electric" instead of "Lightning")
> 5. Update the comment on line 3 from "TCGDex REST API" to "Scrydex REST API"
> 6. Keep `TYPE_ART`, `TYPE_CREATURES`, `FOIL_RARITIES`, `RARITY_VALUES`, and `RARITY_VARIANTS` exactly as they are — these are internal constants unrelated to the API source
>
> Output the complete updated `lib/api/types.ts`. Flag any Scrydex fields that have no TCGDex equivalent so I can decide whether to use them.

---

## Step 4 — Update `lib/api/client.ts` to point to the AWS proxy

**Prompt this to AI:**

> I am migrating a React Native Pokémon TCG app to use a new backend. The current API client is at `lib/api/client.ts`:
>
> ```typescript
> const BASE = 'https://api.tcgdex.net/v2/en';
>
> export async function apiFetch<T>(
>   path: string,
>   params?: Record<string, string>,
> ): Promise<T> {
>   const url = new URL(`${BASE}${path}`);
>   if (params) {
>     Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
>   }
>   const res = await fetch(url.toString());
>   if (!res.ok) throw new Error(`TCGDex ${res.status}: ${path}`);
>   return res.json() as Promise<T>;
> }
> ```
>
> Make exactly these changes:
>
> 1. Replace `BASE` with the AWS API Gateway invoke URL from the CDK stack output. Use an environment variable `EXPO_PUBLIC_API_BASE` so it can differ between dev and prod. Fall back to `'http://localhost:3001'` for local testing.
> 2. Update the error message from `TCGDex ${res.status}` to `API ${res.status}`
> 3. Add no other changes — no retry logic, no logging, no auth headers (auth is handled in the Lambda)
>
> Output the complete updated `lib/api/client.ts`.

---

## Step 5 — Update `lib/api/cards.ts` query parameters for Scrydex

**Prompt this to AI:**

> I am migrating query parameters in `lib/api/cards.ts` from TCGDex's API format to Scrydex's format.
>
> Here is the current `lib/api/cards.ts`:
> ```
> [paste full contents of lib/api/cards.ts]
> ```
>
> Here is the Scrydex API documentation at `docs/scrydex-api.md` showing the correct query parameter names:
> ```
> [paste full contents of docs/scrydex-api.md]
> ```
>
> Update the file as follows:
>
> 1. Replace all TCGDex-style query params (e.g. `'sort:field'`, `'sort:order'`, `'pagination:page'`, `'pagination:itemsPerPage'`, `'rarity'`) with the Scrydex equivalents from the docs
> 2. If rarity filter values differ (e.g. Scrydex uses different strings than TCGDex for "Special Illustration Rare"), update `HIGH_VALUE_RARITIES` and `FEATURED_RARITIES` arrays to match Scrydex's exact rarity strings
> 3. Update the import of `TCGDEX_TYPE_MAP` to `SCRYDEX_TYPE_MAP`
> 4. Update all usages of `CardBrief` and `CardFull` to `ScrydexCardBrief` and `ScrydexCardFull`
> 5. In `mapCard()`, update any field accesses that changed between TCGDex and Scrydex (e.g. if Scrydex returns `image_url` instead of `image`, or `card_number` instead of `localId`)
> 6. The image URL construction `${raw.image}/high.webp` — update this pattern if Scrydex provides full image URLs directly instead of a base path
> 7. Keep `genPriceHistory`, `useCardPriceHistory`, the EUR_TO_USD constant, and all React Query `staleTime` values exactly as they are
>
> Output the complete updated `lib/api/cards.ts`. Note any fields from the Scrydex response that are new and could improve the card display.

---

## Step 6 — Update `lib/api/market.ts` query parameters for Scrydex

**Prompt this to AI:**

> I am updating `lib/api/market.ts` as part of a migration from TCGDex to Scrydex.
>
> Here is the current file:
> ```
> [paste full contents of lib/api/market.ts]
> ```
>
> Apply the same query parameter and type rename changes from the Scrydex docs (`docs/scrydex-api.md`):
>
> 1. Update the `useLiveLot` query params from TCGDex format to Scrydex format (same rarity filter, pagination, sort)
> 2. Update `mapLotCard()` field accesses to match Scrydex's response shape (same changes as Step 5's `mapCard()`)
> 3. Update the import of `TCGDEX_TYPE_MAP` → `SCRYDEX_TYPE_MAP`
> 4. Update `CardBrief`/`CardFull` → `ScrydexCardBrief`/`ScrydexCardFull`
> 5. Keep `useListings`, `SORT_FNS`, and all mock data references exactly as they are — those will be replaced in a later step
>
> Output the complete updated `lib/api/market.ts`.

---

## Step 7 — Wire the search screen to Scrydex via the proxy

**Prompt this to AI:**

> I need to implement `useSearchCards` in `lib/api/cards.ts` using the Scrydex API (via our AWS proxy). The search screen at `app/search.tsx` currently has no real API hook — it uses mock data.
>
> Here is the current `app/search.tsx`:
> ```
> [paste full contents of app/search.tsx]
> ```
>
> Here is the current `lib/api/cards.ts` (already updated for Scrydex in earlier steps):
> ```
> [paste full contents of lib/api/cards.ts]
> ```
>
> Here is the Scrydex API doc (`docs/scrydex-api.md`) showing search query parameters:
> ```
> [paste relevant search section of docs/scrydex-api.md]
> ```
>
> Add a `useSearchCards(query: string, filters: Record<string, string>)` hook to `lib/api/cards.ts`:
>
> - `queryKey`: `['search', query, filters]`
> - `enabled`: only when `query.trim().length >= 2`
> - `staleTime`: 1000 * 60 * 10 (10 minutes)
> - Query params: pass `query` as the name search param, spread `filters` (keys map to Scrydex filter params per the docs)
> - Fetch briefs, then fetch full cards in parallel (same `fetchFullCards` pattern already in the file)
> - Map results with `mapCard`
>
> Then in `app/search.tsx`, replace the mock search results with `useSearchCards`. Keep the existing filter pills, recent searches via AsyncStorage, and UI layout exactly as they are — only replace the data source.
>
> Output both the updated `lib/api/cards.ts` and `app/search.tsx`.

---

## Step 8 — Add a local Lambda dev server for offline development

**Prompt this to AI:**

> Our production setup uses AWS Lambda + API Gateway as a caching proxy in front of Scrydex. For local development I need a lightweight Node.js server that mimics the Lambda's behavior — cache check in DynamoDB, fallback to Scrydex — but runs at `localhost:3001`.
>
> Create `aws/local-server.ts`:
>
> - Uses Node.js built-in `http` module (no Express)
> - On any request: build the same `cacheKey` hash as the Lambda handler
> - Check DynamoDB (same table, same region) using `@aws-sdk/client-dynamodb`
> - Cache hit: return cached JSON with header `X-Cache: HIT`
> - Cache miss: forward to Scrydex with `SCRYDEX_API_KEY` from `.env.local`, cache the response, return with `X-Cache: MISS`
> - Log each request: method, path, cache status, and response time in ms
>
> Also add a `"dev:proxy": "npx ts-node aws/local-server.ts"` script to the root `package.json`.
>
> The `.env.local` file should have these keys (create a `.env.local.example` with placeholders, do not create the real `.env.local`):
> ```
> SCRYDEX_API_KEY=your_key_here
> AWS_REGION=us-east-1
> DYNAMO_TABLE_NAME=pokevault-card-cache
> ```
>
> Output `aws/local-server.ts`, the updated root `package.json` dev script, and `.env.local.example`.

---

## Step 9 — Remove all TCGDex references and clean up

**Prompt this to AI:**

> I have finished migrating a React Native Pokémon TCG app from TCGDex to Scrydex. I need a final cleanup pass to remove every remaining TCGDex reference.
>
> Search the following files for any remaining mentions of "tcgdex", "TCGDex", "tcgdex.net", "TCGDEX", or "api.tcgdex":
> - `lib/api/client.ts`
> - `lib/api/types.ts`
> - `lib/api/cards.ts`
> - `lib/api/market.ts`
> - `TODO-functional.md`
> - Any file in `lib/`, `app/`, `components/`, `types/`
>
> For each occurrence:
> - If it is a code reference (import, variable, type name): update it to the Scrydex equivalent
> - If it is a comment or string mentioning the old API: update it to reference Scrydex
> - If it is in `TODO-functional.md`: update the todo items to reference Scrydex endpoints and param names
>
> Output a diff for each changed file. Make no functional changes — only naming and comment updates.

---

## Step 10 — End-to-end smoke test checklist

**Prompt this to AI:**

> I have completed the migration from TCGDex to Scrydex with an AWS DynamoDB caching proxy. Before shipping, I need a manual smoke test checklist and an automated integration test.
>
> Here is the full API layer:
> ```
> [paste lib/api/client.ts, lib/api/cards.ts, lib/api/market.ts]
> ```
>
> Write two things:
>
> **1. A manual smoke test checklist (`docs/smoke-test.md`)** covering:
> - Home screen loads featured card and card grid (verify images load, values display)
> - Card detail modal opens with correct data
> - Search returns results for "Charizard", "Pikachu", and an empty query
> - Filter pills narrow results correctly
> - Market screen loads live lot card
> - Price chart renders on card detail
> - Collection add/remove works (this hits SQLite, not Scrydex, but verify no regression)
> - Cache behavior: open the same card twice and confirm the second request returns `X-Cache: HIT` in the Lambda logs
>
> **2. A Jest integration test `__tests__/api/proxy.test.ts`** that:
> - Mocks `fetch` globally
> - Tests `apiFetch` returns parsed JSON on a 200 response
> - Tests `apiFetch` throws on a non-200 response
> - Tests `useCards` query key includes rarity and page params
> - Does NOT test the Lambda or DynamoDB — those are AWS-managed
>
> Output both files.

---

## Completion Criteria

- [ ] All TCGDex references removed from codebase
- [ ] AWS CDK stack deployable with `cdk deploy`
- [ ] Lambda caches card detail for 7 days, search for 24 hours, pricing for 1 hour
- [ ] App reads `EXPO_PUBLIC_API_BASE` — one env var swap between local and prod
- [ ] Local dev proxy runs at `localhost:3001` with `npm run dev:proxy`
- [ ] Home screen, card detail, search, and market all load real Scrydex data
- [ ] No Scrydex API key exposed in the React Native bundle
