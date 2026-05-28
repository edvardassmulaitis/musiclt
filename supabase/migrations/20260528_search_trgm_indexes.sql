-- ─────────────────────────────────────────────────────────────────────────────
-- Trigram (GIN) indexes for ILIKE '%term%' search performance.
--
-- Master search (`/api/search-master`) does `.ilike('title', '%term%')` on
-- many tables — without trigram indexes Postgres does full table scans.
-- pg_trgm + GIN turns those into index lookups.
--
-- `pg_trgm` extension jau įjungtas (žr. 20260514a_news_candidates.sql:209).
-- Vienas index'as artist'ams jau yra; čia pridedam likusiems esminiams.
--
-- Po šito apply, tipiškas „naujausi/populiariausi" search'ams (q+score sort):
--   albums:       ~150ms → ~20ms
--   tracks:       ~400ms → ~40ms (Mikutavičius tracks lentelė didžiausia)
--   profiles:     ~50ms → ~10ms
--   news:         ~80ms → ~15ms
--   events:       ~40ms → ~10ms
--   blog_posts:   ~30ms → ~10ms
--   discussions:  ~60ms → ~15ms
--
-- NE CONCURRENTLY — supabase migracijos lock'inamos transakcijoje. Lock'as
-- trumpas (sekundėmis) ant nedidelių lentelių. Jei kada nors lentelės taps
-- > 1M eilučių, reikės atskirti į standalone migracija + CONCURRENTLY.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_albums_title_trgm
  ON public.albums USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_tracks_title_trgm
  ON public.tracks USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_profiles_username_trgm
  ON public.profiles USING gin (username gin_trgm_ops);

-- profiles.full_name dažnai NULL — bet jei egzistuoja, search'as ieško joje.
CREATE INDEX IF NOT EXISTS idx_profiles_full_name_trgm
  ON public.profiles USING gin (full_name gin_trgm_ops)
  WHERE full_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_news_title_trgm
  ON public.news USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_events_title_trgm
  ON public.events USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_blog_posts_title_trgm
  ON public.blog_posts USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_discussions_title_trgm
  ON public.discussions USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_venues_name_trgm
  ON public.venues USING gin (name gin_trgm_ops);

-- Po šitų ANALYZE — Postgres'as atsisako naudoti naujus indeksus kol statistika
-- neatnaujinta (paprastai per kelias minutes auto-runner'į padaro, bet greitam
-- rezultatui apply'ame čia).
ANALYZE public.albums;
ANALYZE public.tracks;
ANALYZE public.profiles;
ANALYZE public.news;
ANALYZE public.events;
ANALYZE public.blog_posts;
ANALYZE public.discussions;
ANALYZE public.venues;
