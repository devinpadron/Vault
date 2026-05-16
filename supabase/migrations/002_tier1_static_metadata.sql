-- TIER 1: Static metadata — expansions, cards, images, variants
-- Refresh cadence: weekly (Sunday 03:00 ET) or on-demand when Scrydex adds new content.
-- These tables use text PKs matching Scrydex IDs exactly. Never auto-generate them.
-- All Tier 1 tables carry synced_at to track the last Scrydex pull per row.

-- ---------------------------------------------------------------------------
-- expansions
-- Source: GET /pokemon/v1/expansions, also embedded on every card response.
-- Tier 1 | refresh weekly
-- ---------------------------------------------------------------------------
create table if not exists expansions (
  id               text        primary key,                -- e.g. base1, sv10_ja
  name             text        not null,
  series           text,
  code             text,
  total            integer,                                -- includes secret rares
  printed_total    integer,                                -- denominator on card face
  language         text,                                   -- English, Japanese
  language_code    text,                                   -- EN, JA
  release_date     date,                                   -- parsed from YYYY/MM/DD
  is_online_only   boolean     not null default false,     -- true for Pocket sets
  logo_url         text,
  symbol_url       text,
  synced_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table expansions is
  'TIER 1 — weekly. Scrydex expansion/set metadata. PK matches Scrydex ID exactly.';

create index if not exists expansions_language_code_idx
  on expansions (language_code);

create index if not exists expansions_release_date_idx
  on expansions (release_date desc);

create index if not exists expansions_series_idx
  on expansions (series);

create index if not exists expansions_name_trgm_idx
  on expansions using gin (name gin_trgm_ops);

create or replace trigger expansions_set_updated_at
  before update on expansions
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- cards
-- Source: GET /pokemon/v1/cards/<id> and GET /pokemon/v1/cards
-- Pricing lives in Tier 2 (card_prices_current). Images in card_images.
-- Tier 1 | refresh weekly
-- ---------------------------------------------------------------------------
create table if not exists cards (
  id                        text        primary key,       -- e.g. base1-4, sv10_ja-1
  expansion_id              text        not null references expansions (id) on delete cascade,
  name                      text        not null,
  supertype                 text,                          -- Pokémon | Trainer | Energy
  subtypes                  text[],                        -- Stage 2, MEGA, GX, VMAX, …
  types                     text[],                        -- Fire, Water, …
  hp                        text,                          -- string in API; sometimes "200+"
  level                     text,                          -- older sets only
  evolves_from              text[],
  rules                     text[],
  ancient_trait             jsonb,                         -- {name, text}
  abilities                 jsonb,                         -- [{type, name, text}, …]
  attacks                   jsonb,                         -- [{cost, converted_energy_cost, name, text, damage}, …]
  weaknesses                jsonb,                         -- [{type, value}, …]
  resistances               jsonb,                         -- [{type, value}, …]
  retreat_cost              text[],
  converted_retreat_cost    integer,
  number                    text,                          -- "87" from "87/160"
  printed_number            text,                          -- "87/160", "SWSH101"
  rarity                    text,
  rarity_code               text,                          -- ★H, etc.
  artist                    text,
  national_pokedex_numbers  integer[],
  flavor_text               text,
  regulation_mark           text,                          -- introduced with Sword & Shield
  language                  text,
  language_code             text,                          -- EN, JA
  expansion_sort_order      integer,                       -- for in-set ordering
  translation               jsonb,                         -- full translation.en.* blob for JP cards
  raw_payload               jsonb,                         -- full original Scrydex card object for forward-compat
  synced_at                 timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

comment on table cards is
  'TIER 1 — weekly. Scrydex card static data. Pricing in card_prices_current. PK matches Scrydex ID.';

create index if not exists cards_expansion_id_idx
  on cards (expansion_id);

create index if not exists cards_expansion_id_sort_order_idx
  on cards (expansion_id, expansion_sort_order);            -- primary set-listing query

create index if not exists cards_language_code_idx
  on cards (language_code);

create index if not exists cards_rarity_idx
  on cards (rarity);

create index if not exists cards_name_trgm_idx
  on cards using gin (name gin_trgm_ops);                   -- fuzzy name search

create index if not exists cards_types_gin_idx
  on cards using gin (types);

create index if not exists cards_subtypes_gin_idx
  on cards using gin (subtypes);

create index if not exists cards_national_pokedex_numbers_gin_idx
  on cards using gin (national_pokedex_numbers);

create index if not exists cards_attacks_gin_idx
  on cards using gin (attacks jsonb_path_ops);              -- attacks.name: style queries

create index if not exists cards_abilities_gin_idx
  on cards using gin (abilities jsonb_path_ops);

create index if not exists cards_translation_gin_idx
  on cards using gin (translation jsonb_path_ops);

create or replace trigger cards_set_updated_at
  before update on cards
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- card_images
-- One row per (card, type, size) so the app picks a size without parsing JSON.
-- Tier 1 | refresh weekly (follows parent card)
-- ---------------------------------------------------------------------------
create table if not exists card_images (
  id          uuid        primary key default gen_random_uuid(),
  card_id     text        not null references cards (id) on delete cascade,
  type        text        not null,                         -- front | back
  size        text        not null,                         -- small | medium | large
  url         text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (card_id, type, size)
);

comment on table card_images is
  'TIER 1 — weekly. Normalized card image URLs keyed by type and size.';

create index if not exists card_images_card_id_idx
  on card_images (card_id);

create or replace trigger card_images_set_updated_at
  before update on card_images
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- card_variants
-- A card can have many collectible variants (unlimitedHolofoil, reverseHolofoil, normal, …).
-- Variant definition is static here; prices live in Tier 2 (card_prices_current).
-- Tier 1 | refresh weekly
-- ---------------------------------------------------------------------------
create table if not exists card_variants (
  id           uuid        primary key default gen_random_uuid(),
  card_id      text        not null references cards (id) on delete cascade,
  name         text        not null,                        -- variant key from Scrydex
  display_name text,                                        -- optional pretty label
  images       jsonb,                                       -- [{type, small, medium, large}] for variant-specific art
  synced_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (card_id, name)
);

comment on table card_variants is
  'TIER 1 — weekly. Collectible printing variants per card. Prices in card_prices_current.';

create index if not exists card_variants_card_id_idx
  on card_variants (card_id);

create or replace trigger card_variants_set_updated_at
  before update on card_variants
  for each row execute function set_updated_at();
