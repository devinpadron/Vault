-- Smart binders — collections that auto-materialize their card list from a
-- rules JSON, instead of having explicit collection_items rows. When `rules`
-- is null the collection behaves as a normal manual binder.
--
-- Rule shape (v1):
--   {
--     "match":     "all" | "any",
--     "sets":      ["BASE SET", "JUNGLE"],
--     "rarities":  ["Holo Rare", "Ultra Rare"],
--     "supertypes":["Pokémon"],
--     "minValue":  number | undefined,
--     "maxValue":  number | undefined,
--     "foilOnly":  boolean | undefined
--   }
--
-- Materialization happens client-side against the user's main collection.

alter table collections
  add column if not exists rules jsonb;

comment on column collections.rules is
  'Smart-binder rule set. When non-null the binder auto-materializes from '
  'the owner''s collection_items; manual adds are ignored. Shape documented '
  'in migration 016.';

create index if not exists collections_rules_idx
  on collections ((rules is not null));
