-- PokeVault card catalog table
-- Run this in Supabase Dashboard → SQL Editor before running sync-cards.mjs

CREATE TABLE IF NOT EXISTS pokemon_cards (
  id                    TEXT PRIMARY KEY,        -- TCGDex card ID (e.g. swsh1-25)
  name                  TEXT NOT NULL,
  image_url             TEXT,
  artist                TEXT,
  set_id                TEXT NOT NULL,
  set_name              TEXT NOT NULL,
  set_series            TEXT,
  release_date          TEXT,
  card_number           TEXT,                    -- e.g. "25/202"
  rarity                TEXT,
  variant               TEXT,                    -- e.g. "ex", "VMAX", "Holo"
  category              TEXT,                    -- Pokemon | Trainer | Energy
  hp                    INTEGER,
  types                 TEXT[],                  -- energy types
  description           TEXT,                    -- Pokédex flavor text
  variant_first_edition BOOLEAN NOT NULL DEFAULT false,
  variant_holo          BOOLEAN NOT NULL DEFAULT false,
  variant_normal        BOOLEAN NOT NULL DEFAULT false,
  variant_reverse       BOOLEAN NOT NULL DEFAULT false,
  variant_wpromo        BOOLEAN NOT NULL DEFAULT false,
  image_source          TEXT NOT NULL DEFAULT 'none',  -- tcgdex | ptcgio | pokewallet | none
  language              TEXT NOT NULL DEFAULT 'en',    -- en | ja
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pokemon_cards_name     ON pokemon_cards (name);
CREATE INDEX IF NOT EXISTS idx_pokemon_cards_set_id   ON pokemon_cards (set_id);
CREATE INDEX IF NOT EXISTS idx_pokemon_cards_rarity   ON pokemon_cards (rarity);
CREATE INDEX IF NOT EXISTS idx_pokemon_cards_artist   ON pokemon_cards (artist);
CREATE INDEX IF NOT EXISTS idx_pokemon_cards_category ON pokemon_cards (category);
CREATE INDEX IF NOT EXISTS idx_pokemon_cards_language ON pokemon_cards (language);

-- Migration: run this if the table already exists without the language column
-- ALTER TABLE pokemon_cards ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_pokemon_cards_updated_at ON pokemon_cards;
CREATE TRIGGER update_pokemon_cards_updated_at
  BEFORE UPDATE ON pokemon_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE pokemon_cards ENABLE ROW LEVEL SECURITY;

-- Public read: card catalog is not sensitive
CREATE POLICY "public read" ON pokemon_cards
  FOR SELECT USING (true);

-- Service role (used by the sync script) bypasses RLS automatically
