# Claude Code Prompt — Scrydex Pokémon API → Supabase Schema

> Paste everything below into Claude Code as the project spec.

---

## Goal

Build a complete Supabase/Postgres schema that mirrors the **Scrydex Pokémon API** (`https://api.scrydex.com/pokemon/v1/`) and is organized by **how often each piece of data changes**. The point is to cache aggressively where I can and only burn Scrydex API credits on the data that actually moves.

Deliverables:

1. Five SQL migration files in `supabase/migrations/`:
   - `001_tier0_extensions_and_helpers.sql`
   - `002_tier1_static_metadata.sql`
   - `003_tier2_current_pricing.sql`
   - `004_tier3_historical.sql`
   - `005_app_collections.sql`
2. A generated `types/database.types.ts` for the Supabase client.
3. A `docs/SYNC_STRATEGY.md` describing refresh cadence per tier.
4. A `supabase/seed.sql` that seeds `cache_refresh_policy` with sensible defaults.

Do not elide fields. Do not collapse types. Do not skip indexes. If a Scrydex field is ambiguous, prefer the more permissive Postgres type (`text` over enum, `jsonb` over rigid structure) and add a `-- TODO` comment.

---

## Conventions (apply to every table)

- Primary keys for **Scrydex-sourced** rows: `text` matching the Scrydex ID exactly (e.g. `base1-4`, `sv10_ja-1`, `base1`). Never auto-generate these.
- Primary keys for **derived/relational** rows: `uuid default gen_random_uuid()`.
- Every table: `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`.
- **Tier 1 and Tier 2** tables also get `synced_at timestamptz` (last time the row was refreshed from Scrydex).
- **Tier 3** tables use `snapshot_date date` and are **append-only** — never `UPDATE`.
- Use a single shared `updated_at` trigger function (declare once in `001`).
- Foreign keys to child rows: `on delete cascade`.
- Upsert-friendly: never rely on serial sequence values for Scrydex-sourced PKs.
- Enable extensions: `pgcrypto` (for `gen_random_uuid`), `pg_trgm` (for fuzzy name search), `btree_gin` (composite GIN).
- All array fields from the API land as Postgres arrays (`text[]`, `integer[]`) when I want to query them, or as `jsonb` when they're nested maps I won't filter on.
- Add a table comment to every table stating its cache tier and refresh cadence.

---

## TIER 0 — Extensions, helpers, sync infrastructure

`001_tier0_extensions_and_helpers.sql`

```sql
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists btree_gin;

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
```

### `sync_log`

Track every API pull so I can budget Scrydex credits (plans go 5k → 250k credits/mo).

| Column        | Type                               | Notes                                    |
| ------------- | ---------------------------------- | ---------------------------------------- |
| id            | bigserial PK                       |                                          |
| endpoint      | text not null                      | e.g. `/pokemon/v1/cards`                 |
| query_params  | jsonb                              |                                          |
| status        | text not null                      | `success` \| `error` \| `partial`        |
| credits_used  | integer                            | parse from response headers if available |
| rows_affected | integer                            |                                          |
| http_status   | integer                            |                                          |
| error_message | text                               |                                          |
| started_at    | timestamptz not null default now() |                                          |
| finished_at   | timestamptz                        |                                          |

Indexes: `(endpoint, started_at desc)`, `(status, started_at desc)`.

### `cache_refresh_policy`

Config table so cadence is tunable without redeploys.

| Column          | Type                          | Notes                                                                                  |
| --------------- | ----------------------------- | -------------------------------------------------------------------------------------- |
| resource        | text PK                       | `expansions`, `cards`, `card_prices_current`, `card_price_history`, `card_pop_reports` |
| max_age_seconds | integer not null              | staleness threshold                                                                    |
| priority        | integer not null default 0    | for sync queue ordering                                                                |
| enabled         | boolean not null default true |                                                                                        |
| updated_at      | timestamptz                   |                                                                                        |

**Seed** (in `seed.sql`):

- `expansions` → 604800 (1 week)
- `cards` → 604800 (1 week)
- `card_variants` → 604800 (1 week)
- `card_prices_current` → 86400 (1 day)
- `card_price_history` → 86400 (1 day, append)
- `card_pop_reports` → 86400 (1 day, append)

---

## TIER 1 — STATIC METADATA (refresh weekly, or on-demand when Scrydex adds new content)

`002_tier1_static_metadata.sql`

Card text, expansion data, attacks, abilities, images — none of this changes after a set is released (except occasional Scrydex corrections). Cache it hard.

### `expansions`

Source: `GET /pokemon/v1/expansions`, also embedded as `expansion` object on every card.

| Column                 | Type                  | Notes                                  |
| ---------------------- | --------------------- | -------------------------------------- |
| id                     | text PK               | e.g. `base1`, `sv10_ja`                |
| name                   | text not null         |                                        |
| series                 | text                  |                                        |
| code                   | text                  |                                        |
| total                  | integer               | includes secret rares                  |
| printed_total          | integer               | denominator on the card face           |
| language               | text                  | `English`, `Japanese`                  |
| language_code          | text                  | `EN`, `JA`                             |
| release_date           | date                  | Scrydex returns `YYYY/MM/DD`; parse it |
| is_online_only         | boolean default false | true for Pocket sets                   |
| logo_url               | text                  |                                        |
| symbol_url             | text                  |                                        |
| synced_at              | timestamptz           |                                        |
| created_at, updated_at |                       |                                        |

Indexes: `(language_code)`, `(release_date desc)`, `(series)`, `gin (name gin_trgm_ops)`.

### `cards`

Source: `GET /pokemon/v1/cards/<id>` and `GET /pokemon/v1/cards`. Pricing lives in Tier 2.

| Column                   | Type                                    | Notes                                                        |
| ------------------------ | --------------------------------------- | ------------------------------------------------------------ |
| id                       | text PK                                 | e.g. `base1-4`                                               |
| expansion_id             | text not null references expansions(id) |                                                              |
| name                     | text not null                           |                                                              |
| supertype                | text                                    | `Pokémon`, `Trainer`, `Energy`                               |
| subtypes                 | text[]                                  | `Stage 2`, `MEGA`, `GX`, `VMAX`, etc.                        |
| types                    | text[]                                  | `Fire`, `Water`, …                                           |
| hp                       | text                                    | string in API — sometimes `30`, sometimes `200+`             |
| level                    | text                                    | older sets only                                              |
| evolves_from             | text[]                                  |                                                              |
| rules                    | text[]                                  |                                                              |
| ancient_trait            | jsonb                                   | `{name, text}`                                               |
| abilities                | jsonb                                   | array of `{type, name, text}`                                |
| attacks                  | jsonb                                   | array of `{cost, converted_energy_cost, name, text, damage}` |
| weaknesses               | jsonb                                   | array of `{type, value}`                                     |
| resistances              | jsonb                                   | array of `{type, value}`                                     |
| retreat_cost             | text[]                                  |                                                              |
| converted_retreat_cost   | integer                                 |                                                              |
| number                   | text                                    | `87` from `87/160`                                           |
| printed_number           | text                                    | `87/160`, `SWSH101`                                          |
| rarity                   | text                                    |                                                              |
| rarity_code              | text                                    | `★H`, etc.                                                   |
| artist                   | text                                    |                                                              |
| national_pokedex_numbers | integer[]                               |                                                              |
| flavor_text              | text                                    |                                                              |
| regulation_mark          | text                                    | introduced with Sword & Shield                               |
| language                 | text                                    |                                                              |
| language_code            | text                                    | `EN`, `JA`                                                   |
| expansion_sort_order     | integer                                 | for in-set ordering                                          |
| translation              | jsonb                                   | full `translation.en.*` blob for JP cards                    |
| raw_payload              | jsonb                                   | full original Scrydex card object for forward-compat         |
| synced_at                | timestamptz                             |                                                              |
| created_at, updated_at   |                                         |                                                              |

Indexes:

- `(expansion_id)`
- `(expansion_id, expansion_sort_order)` — primary set-listing query
- `(language_code)`
- `(rarity)`
- `gin (name gin_trgm_ops)` — fuzzy name search
- `gin (types)`, `gin (subtypes)`, `gin (national_pokedex_numbers)`
- `gin (attacks jsonb_path_ops)`, `gin (abilities jsonb_path_ops)` — to support `attacks.name:` style queries
- `gin (translation jsonb_path_ops)`

### `card_images`

One row per (card, type, size) so the app can pick a size without parsing JSON.

| Column                 | Type                                                 | Notes                      |
| ---------------------- | ---------------------------------------------------- | -------------------------- |
| id                     | uuid PK default gen_random_uuid()                    |                            |
| card_id                | text not null references cards(id) on delete cascade |                            |
| type                   | text not null                                        | `front`, `back`            |
| size                   | text not null                                        | `small`, `medium`, `large` |
| url                    | text not null                                        |                            |
| created_at, updated_at |                                                      |                            |

Unique `(card_id, type, size)`. Index `(card_id)`.

### `card_variants`

A card can have many collectible variants (`unlimitedHolofoil`, `firstEditionShadowlessHolofoil`, `reverseHolofoil`, `normal`, `foil`, etc.). Variant **definition** is static; **prices** live in Tier 2.

| Column                 | Type                                                 | Notes                                                                       |
| ---------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------- |
| id                     | uuid PK default gen_random_uuid()                    |                                                                             |
| card_id                | text not null references cards(id) on delete cascade |                                                                             |
| name                   | text not null                                        | the variant key from Scrydex                                                |
| display_name           | text                                                 | optional pretty version                                                     |
| images                 | jsonb                                                | array of `{type, small, medium, large}` for variant-specific art if present |
| synced_at              | timestamptz                                          |                                                                             |
| created_at, updated_at |                                                      |                                                                             |

Unique `(card_id, name)`. Index `(card_id)`.

### Triggers (Tier 1)

Attach `set_updated_at` BEFORE UPDATE on every Tier 1 table.

---

## TIER 2 — CURRENT MARKET PRICING (refresh daily, ~hourly for hot cards)

`003_tier2_current_pricing.sql`

Returned via `?include=prices` on the cards endpoints. One row per **(variant, type, condition, grader, grade, modifier flags)**. This is what the card-detail page shows _right now_.

### `card_prices_current`

| Column                 | Type                                                         | Notes                                           |
| ---------------------- | ------------------------------------------------------------ | ----------------------------------------------- |
| id                     | uuid PK default gen_random_uuid()                            |                                                 |
| variant_id             | uuid not null references card_variants(id) on delete cascade |                                                 |
| type                   | text not null                                                | `raw` or `graded`                               |
| condition              | text                                                         | `NM`, `LP`, `MP`, `HP`, `DM` — raw only         |
| grader                 | text                                                         | `PSA`, `CGC`, `BGS`, `TAG`, `ACE` — graded only |
| grade                  | text                                                         | `10`, `9.5`, `9`, … — graded only               |
| is_perfect             | boolean not null default false                               |                                                 |
| is_signed              | boolean not null default false                               |                                                 |
| is_error               | boolean not null default false                               |                                                 |
| low                    | numeric(12,2)                                                |                                                 |
| market                 | numeric(12,2)                                                |                                                 |
| mid                    | numeric(12,2)                                                | if returned                                     |
| high                   | numeric(12,2)                                                | if returned                                     |
| currency               | text not null default 'USD'                                  |                                                 |
| trend_1d_change        | numeric(12,2)                                                | `trends.days_1.price_change`                    |
| trend_1d_pct           | numeric(8,4)                                                 | `trends.days_1.percent_change`                  |
| trend_7d_change        | numeric(12,2)                                                |                                                 |
| trend_7d_pct           | numeric(8,4)                                                 |                                                 |
| trend_30d_change       | numeric(12,2)                                                | if returned                                     |
| trend_30d_pct          | numeric(8,4)                                                 | if returned                                     |
| trend_90d_change       | numeric(12,2)                                                | if returned                                     |
| trend_90d_pct          | numeric(8,4)                                                 | if returned                                     |
| raw_payload            | jsonb                                                        | full original price entry                       |
| synced_at              | timestamptz not null                                         |                                                 |
| created_at, updated_at |                                                              |                                                 |

Because several columns are nullable (graded rows have no `condition`, raw rows have no `grader`/`grade`), enforce uniqueness via a **partial/expression unique index** using `coalesce`:

```sql
create unique index card_prices_current_uniq
  on card_prices_current (
    variant_id, type,
    coalesce(condition,''),
    coalesce(grader,''),
    coalesce(grade,''),
    is_perfect, is_signed, is_error
  );
```

Other indexes:

- `(variant_id)`
- `(synced_at)` — find stale rows for refresh
- `(market desc) where type = 'raw' and condition = 'NM'` — top raw movers
- `(trend_7d_pct desc) where type = 'raw' and condition = 'NM'` — trending raw
- `(grader, grade) where type = 'graded'`

Trigger: `set_updated_at` BEFORE UPDATE.

---

## TIER 3 — HISTORICAL TIME-SERIES (append-only daily)

`003_tier3_historical.sql`

Pure history. **Never UPDATE these rows.** Mirrors the structure Scrydex uses for price history endpoints (see Riftbound `/price-history` for shape).

### `card_price_history`

| Column        | Type                                                         | Notes             |
| ------------- | ------------------------------------------------------------ | ----------------- |
| id            | bigserial PK                                                 |                   |
| variant_id    | uuid not null references card_variants(id) on delete cascade |                   |
| snapshot_date | date not null                                                |                   |
| type          | text not null                                                | `raw` or `graded` |
| condition     | text                                                         |                   |
| grader        | text                                                         |                   |
| grade         | text                                                         |                   |
| is_perfect    | boolean not null default false                               |                   |
| is_signed     | boolean not null default false                               |                   |
| is_error      | boolean not null default false                               |                   |
| low           | numeric(12,2)                                                |                   |
| market        | numeric(12,2)                                                |                   |
| currency      | text not null default 'USD'                                  |                   |
| created_at    | timestamptz not null default now()                           |                   |

Unique (expression-based with `coalesce`) on `(variant_id, snapshot_date, type, condition, grader, grade, is_perfect, is_signed, is_error)`.

Indexes:

- `(variant_id, snapshot_date desc)` — primary chart query
- BRIN on `snapshot_date` — this table will grow into the tens of millions of rows
- `-- TODO: partition by month on snapshot_date once row count > 50M`

### `card_pop_reports`

Graded population data from PSA / CGC / BGS / TAG / ACE. Snapshot-style — one row per (card, variant, grader, grade, date).

| Column            | Type                                                 | Notes                                         |
| ----------------- | ---------------------------------------------------- | --------------------------------------------- |
| id                | bigserial PK                                         |                                               |
| card_id           | text not null references cards(id) on delete cascade |                                               |
| variant_name      | text                                                 | nullable; only set if pop is variant-specific |
| snapshot_date     | date not null                                        |                                               |
| grader            | text not null                                        | `PSA`, `CGC`, `BGS`, `TAG`, `ACE`             |
| grade             | text not null                                        | `10`, `9`, `Authentic`, `Qualifier`, …        |
| population        | integer not null                                     |                                               |
| population_higher | integer                                              | cumulative count at this grade or higher      |
| total_graded      | integer                                              | grand total at this grader across all grades  |
| raw_payload       | jsonb                                                | full original pop entry                       |
| created_at        | timestamptz not null default now()                   |                                               |

Unique on `(card_id, snapshot_date, grader, grade, coalesce(variant_name,''))`.

Indexes:

- `(card_id, snapshot_date desc)`
- `(grader, grade)`
- BRIN on `snapshot_date`

> Note: as of writing, Scrydex's documented Pokémon endpoints expose graded prices but a dedicated pop-report endpoint may still be on the roadmap. Build the table now so we can backfill when the endpoint lands.

---

## TIER 4 — APP-LAYER (collection management)

`004_app_collections.sql`

Not from Scrydex. Powers collection tracking, friends comparison, and price search per the app spec.

### `profiles`

Mirror of `auth.users` with public-facing fields.

| Column                 | Type                                                | Notes |
| ---------------------- | --------------------------------------------------- | ----- |
| id                     | uuid PK references auth.users(id) on delete cascade |       |
| username               | text unique not null                                |       |
| display_name           | text                                                |       |
| avatar_url             | text                                                |       |
| bio                    | text                                                |       |
| created_at, updated_at |                                                     |       |

Index `gin (username gin_trgm_ops)` for friend search.

### `collections`

Users can have multiple collections (Main, Wishlist, For-Trade, PC).

| Column                 | Type                                                      | Notes                                     |
| ---------------------- | --------------------------------------------------------- | ----------------------------------------- |
| id                     | uuid PK default gen_random_uuid()                         |                                           |
| user_id                | uuid not null references auth.users(id) on delete cascade |                                           |
| name                   | text not null                                             |                                           |
| description            | text                                                      |                                           |
| kind                   | text not null default 'collection'                        | `collection` \| `wishlist` \| `for_trade` |
| is_public              | boolean not null default false                            |                                           |
| created_at, updated_at |                                                           |                                           |

Index `(user_id)`.

### `collection_items`

| Column                 | Type                                                       | Notes                               |
| ---------------------- | ---------------------------------------------------------- | ----------------------------------- |
| id                     | uuid PK default gen_random_uuid()                          |                                     |
| collection_id          | uuid not null references collections(id) on delete cascade |                                     |
| card_id                | text not null references cards(id)                         |                                     |
| variant_id             | uuid references card_variants(id)                          | nullable for "any printing" entries |
| quantity               | integer not null default 1 check (quantity > 0)            |                                     |
| condition              | text                                                       | for raw cards: `NM`, `LP`, …        |
| grader                 | text                                                       |                                     |
| grade                  | text                                                       |                                     |
| cert_number            | text                                                       | for graded cards                    |
| is_signed              | boolean not null default false                             |                                     |
| is_error               | boolean not null default false                             |                                     |
| acquired_at            | date                                                       |                                     |
| acquired_price         | numeric(12,2)                                              | what I paid                         |
| acquired_currency      | text default 'USD'                                         |                                     |
| notes                  | text                                                       |                                     |
| created_at, updated_at |                                                            |                                     |

Indexes: `(collection_id)`, `(card_id)`, `(collection_id, card_id)`.

### `friendships`

| Column                 | Type                                                             | Notes |
| ---------------------- | ---------------------------------------------------------------- | ----- |
| id                     | uuid PK default gen_random_uuid()                                |       |
| requester_id           | uuid not null references auth.users(id) on delete cascade        |       |
| addressee_id           | uuid not null references auth.users(id) on delete cascade        |       |
| status                 | text not null check (status in ('pending','accepted','blocked')) |       |
| created_at, updated_at |                                                                  |       |

Unique `(requester_id, addressee_id)` with `check (requester_id <> addressee_id)`.

### `price_alerts`

Optional but mentioned in the price-search feature.

| Column                 | Type                                                         | Notes |
| ---------------------- | ------------------------------------------------------------ | ----- |
| id                     | uuid PK default gen_random_uuid()                            |       |
| user_id                | uuid not null references auth.users(id) on delete cascade    |       |
| variant_id             | uuid not null references card_variants(id) on delete cascade |       |
| condition              | text                                                         |       |
| grader                 | text                                                         |       |
| grade                  | text                                                         |       |
| direction              | text not null check (direction in ('above','below'))         |       |
| threshold              | numeric(12,2) not null                                       |       |
| currency               | text not null default 'USD'                                  |       |
| is_active              | boolean not null default true                                |       |
| last_triggered_at      | timestamptz                                                  |       |
| created_at, updated_at |                                                              |       |

Index `(user_id, is_active)`, `(variant_id, is_active)`.

### Row-Level Security

Enable RLS on every app-layer table.

- `profiles`: readable by everyone; writable only by `auth.uid() = id`.
- `collections`: select if `is_public` OR `user_id = auth.uid()` OR (user is friend with `accepted` status AND `is_public = true`); insert/update/delete only by owner.
- `collection_items`: piggyback on `collections` visibility (use a `using (exists (select 1 from collections c where c.id = collection_id and (c.user_id = auth.uid() or c.is_public)))` policy).
- `friendships`: select if `requester_id = auth.uid()` OR `addressee_id = auth.uid()`; insert only as requester; update status only as addressee.
- `price_alerts`: only owner can read/write.

Tier 1/2/3 tables: **leave RLS off for now** — these are reference data refreshed by a service-role sync worker; we'll add read-only policies later.

---

## TypeScript types

Generate `types/database.types.ts` using Supabase's typegen conventions, or hand-write equivalent types matching the schema 1:1. Include explicit union types for:

- `card.supertype`: `'Pokémon' | 'Trainer' | 'Energy' | string`
- `card_prices_current.type` / `card_price_history.type`: `'raw' | 'graded'`
- `card_prices_current.condition`: `'NM' | 'LP' | 'MP' | 'HP' | 'DM' | null`
- `card_prices_current.grader`: `'PSA' | 'CGC' | 'BGS' | 'TAG' | 'ACE' | null`
- `friendship.status`: `'pending' | 'accepted' | 'blocked'`

---

## `docs/SYNC_STRATEGY.md`

Write a short doc covering:

1. **Tier 1 (static)** — refresh weekly via cron (Sunday 03:00 ET). Trigger off-cycle when Scrydex announces a new set. Pull `/expansions` first, diff against local, then walk `/expansions/<id>/cards` for any new or changed set.
2. **Tier 2 (current prices)** — daily cron (04:00 ET) for the full catalog. On-read lazy refresh: if `card_prices_current.synced_at` is older than `cache_refresh_policy.max_age_seconds`, kick off a background refresh for that variant. Hot cards (anything in any user's collection or wishlist) get refreshed every hour.
3. **Tier 3 (history + pop)** — daily cron (05:00 ET), append-only. Never re-write existing snapshots. If a snapshot for today's date already exists for a (variant, …) tuple, skip.
4. **Credit budget** — log every call to `sync_log` with credit usage. Halt non-essential syncs if monthly credit usage exceeds 90% of plan limit.
5. **Backfill** — on first run, walk `/expansions` → cards (no prices) → then prices in a second pass to keep Tier 1 inserts isolated from Tier 2 churn.

---

## Acceptance checks

Before considering this done, verify:

- [ ] Every Scrydex card field documented in the API reference has a home in `cards`, `card_images`, or `card_variants`.
- [ ] `raw_payload jsonb` exists on `cards` and `card_prices_current` so we don't lose data if Scrydex adds new fields.
- [ ] All Tier 1/2 tables have `synced_at`.
- [ ] All Tier 3 tables have `snapshot_date` and no `UPDATE` paths.
- [ ] Unique constraints handle nullable columns correctly via `coalesce` expression indexes.
- [ ] `pg_trgm` GIN index on `cards.name` and `profiles.username`.
- [ ] BRIN indexes on `snapshot_date` for both history tables.
- [ ] RLS enabled on every `005_app_collections.sql` table, disabled on every Scrydex-mirror table.
- [ ] `cache_refresh_policy` is seeded.
- [ ] TypeScript types file compiles against the migrations.

Be thorough. Don't shorthand. If anything is ambiguous in the Scrydex docs, pick the more permissive Postgres type and leave a `-- TODO` comment with the question.
