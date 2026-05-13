# PokeVault Card Sync

Three-source pipeline that pulls Pokémon TCG card metadata into Supabase. No pricing data is stored.

| Pass | Source | What it covers |
|------|--------|----------------|
| 1 | TCGDex | All metadata + images for the vast majority of cards |
| 2 | pokemontcg.io | Image fallback when TCGDex has no image URL |
| 3 | PokeWallet | Downloads + uploads remaining missing images to Supabase Storage |

## What gets stored

| Column | Source |
|--------|--------|
| `name` | TCGDex |
| `image_url` | TCGDex → pokemontcg.io → Supabase Storage (via PokeWallet) |
| `artist` | TCGDex `illustrator` |
| `set_id`, `set_name`, `set_series` | TCGDex |
| `release_date` | TCGDex |
| `card_number` | TCGDex (`localId / total`) |
| `rarity` | TCGDex |
| `variant` | TCGDex `suffix` or derived from rarity |
| `category` | TCGDex (Pokémon / Trainer / Energy) |
| `hp` | TCGDex |
| `types` | TCGDex energy types |
| `description` | TCGDex Pokédex text |
| `variant_*` | TCGDex (firstEdition, holo, normal, reverse, wPromo) |