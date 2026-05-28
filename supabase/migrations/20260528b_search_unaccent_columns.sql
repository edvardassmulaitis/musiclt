-- ─────────────────────────────────────────────────────────────────────────────
-- Diacritic-insensitive search via normalized columns + trigram indexes.
--
-- Problem: ILIKE '%vetru%' nematch'ina '1000 Vėtrų' (ė ≠ e, ų ≠ u). User'is
-- nori, kad LT/SE/CZ raidės būtų ignoruojamos paieškoj.
--
-- Solution: kiekvienai paieškos lentelei pridedam GENERATED `*_norm` kolumną,
-- kuri laiko `lower(unaccent(...))` versiją. Visi paieškos ILIKE'ai DABAR
-- naudoja šią kolumną, klientas pasiunčia normalize'intą query'ą.
--
-- IMMUTABLE WRAPPER:
-- PostgreSQL `unaccent(text)` (single-arg) yra STABLE (priklauso nuo session
-- search_path'o ir dictionary'ų). STORED generated columns reikalauja
-- IMMUTABLE funkcijos. Workaround'as — naudoti 2-arg formą
-- `unaccent('public.unaccent', text)`, kuri pažymėta IMMUTABLE iš dėžutės.
-- Wrappinam į `immutable_unaccent(text)` patogesniam naudojimui.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text
AS $$
  SELECT public.unaccent('public.unaccent', $1)
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Generated columns (STORED — kompiliuojamas vienąkart per INSERT/UPDATE).
-- COALESCE su '' — kad NULL'ai nesukeltų generated value = NULL (kuris
-- trigram index'u nepasiekiamas).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS name_norm text
  GENERATED ALWAYS AS (lower(public.immutable_unaccent(coalesce(name, '')))) STORED;

ALTER TABLE public.tracks ADD COLUMN IF NOT EXISTS title_norm text
  GENERATED ALWAYS AS (lower(public.immutable_unaccent(coalesce(title, '')))) STORED;

ALTER TABLE public.albums ADD COLUMN IF NOT EXISTS title_norm text
  GENERATED ALWAYS AS (lower(public.immutable_unaccent(coalesce(title, '')))) STORED;

ALTER TABLE public.news ADD COLUMN IF NOT EXISTS title_norm text
  GENERATED ALWAYS AS (lower(public.immutable_unaccent(coalesce(title, '')))) STORED;

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS title_norm text
  GENERATED ALWAYS AS (lower(public.immutable_unaccent(coalesce(title, '')))) STORED;

ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS title_norm text
  GENERATED ALWAYS AS (lower(public.immutable_unaccent(coalesce(title, '')))) STORED;

ALTER TABLE public.discussions ADD COLUMN IF NOT EXISTS title_norm text
  GENERATED ALWAYS AS (lower(public.immutable_unaccent(coalesce(title, '')))) STORED;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username_norm text
  GENERATED ALWAYS AS (lower(public.immutable_unaccent(coalesce(username, '')))) STORED;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name_norm text
  GENERATED ALWAYS AS (lower(public.immutable_unaccent(coalesce(full_name, '')))) STORED;

ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS name_norm text
  GENERATED ALWAYS AS (lower(public.immutable_unaccent(coalesce(name, '')))) STORED;

-- ─────────────────────────────────────────────────────────────────────────────
-- GIN trigram indexes ant naujų kolumnų. 20260528_search_trgm_indexes.sql
-- jau sukūrė indeksus ant nenormalizuotų kolumnų — palieam kaip backup,
-- bet visi paieškos query'ai DABAR taikys *_norm.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_artists_name_norm_trgm
  ON public.artists USING gin (name_norm gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_tracks_title_norm_trgm
  ON public.tracks USING gin (title_norm gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_albums_title_norm_trgm
  ON public.albums USING gin (title_norm gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_news_title_norm_trgm
  ON public.news USING gin (title_norm gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_events_title_norm_trgm
  ON public.events USING gin (title_norm gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_blog_posts_title_norm_trgm
  ON public.blog_posts USING gin (title_norm gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_discussions_title_norm_trgm
  ON public.discussions USING gin (title_norm gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_profiles_username_norm_trgm
  ON public.profiles USING gin (username_norm gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_profiles_full_name_norm_trgm
  ON public.profiles USING gin (full_name_norm gin_trgm_ops)
  WHERE full_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_venues_name_norm_trgm
  ON public.venues USING gin (name_norm gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- ANALYZE — Postgres'as turi statistikas dėl naujų indeksų ir generated col'ų.
-- Be ANALYZE planner'is gali ir toliau rinktis full scan'us.
-- ─────────────────────────────────────────────────────────────────────────────

ANALYZE public.artists;
ANALYZE public.tracks;
ANALYZE public.albums;
ANALYZE public.news;
ANALYZE public.events;
ANALYZE public.blog_posts;
ANALYZE public.discussions;
ANALYZE public.profiles;
ANALYZE public.venues;
