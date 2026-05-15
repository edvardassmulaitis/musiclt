-- Wiki single aliases + ignores — admin tools for handling Wikipedia
-- discography import edge cases where Wiki single title differs from
-- canonical track title (pvz a-ha „Angel" = single version of „Angel in
-- the Snow"), or where admin wants to permanently hide a Wiki suggestion.
--
-- Use cases:
--   1) tracks.wiki_aliases: kai Wiki single page'as turi sutrumpintą title
--      („Angel" vietoj „Angel in the Snow"), admin'as gali markinti tą
--      alternative title kaip alias prie egzistuojančio tracko. Po to
--      WikipediaImportDiscography fuzzy match'as automatiškai jį atpažins.
--
--   2) wiki_single_ignores: kai Wiki single yra non-canonical (charity
--      release, alt mix, ar tiesiog ne aktualus), admin'as gali jį
--      paspausti „Ignoruoti" ir jis ateityje nebus rodomas suggestions list'e.

-- 1) Tracks alias array
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS wiki_aliases TEXT[] NOT NULL DEFAULT '{}';

-- GIN index lookup'ams "kuris tracker'is turi tokį alias" — naudojama
-- duplicate detection'e WikipediaImportDiscography fetch'e.
CREATE INDEX IF NOT EXISTS idx_tracks_wiki_aliases ON tracks USING GIN (wiki_aliases);

-- 2) Per-artist Wiki single ignore list
CREATE TABLE IF NOT EXISTS wiki_single_ignores (
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  wiki_title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (artist_id, wiki_title)
);

-- Lookup'as: ar šis Wiki single yra ignored ant atlikėjo.
-- Compound primary key jau pateikia index'ą — papildomas nereikalingas.
COMMENT ON TABLE wiki_single_ignores IS
  'Per-artist Wiki single suggestions, kurie admin''o markinti kaip ignoruoti — neberodomi import suggestions list''e.';
COMMENT ON COLUMN tracks.wiki_aliases IS
  'Alt titles iš Wikipedia singles diskografijos (pvz. „Angel" alias'';as „Angel in the Snow"). Naudojamas fuzzy match''e import'o metu.';
