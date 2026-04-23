-- Music.lt legacy ingest — public.* schema extension
--
-- Purpose: Edvardas nori visą scrape'intą turinį matyti tiesiai production app'e,
-- NE atskiroje `legacy_import` schema'oje. Ši migracija:
--   1. Prideda `legacy_id` + `source` laukus į existing artists/albums/tracks
--   2. Sukuria community lenteles (forum_threads, forum_posts, comments)
--   3. Sukuria user_ghosts — senieji useriai, kurie gali save "claim'inti" vėliau
--
-- Rollback strategija: smulkesnė nei DROP SCHEMA — čia nekeičiame production
-- schemos, tik pridedame NULL-able laukus + naujas lenteles. Rollback:
--   ALTER TABLE artists DROP COLUMN legacy_id, source;
--   (ir t.t.)
--   DROP TABLE forum_posts, forum_threads, comments_legacy, user_ghosts CASCADE;

-- ============================================================
-- Dalis 1: legacy metadata existing lenteles
-- ============================================================

ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS legacy_id INTEGER,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;

-- NOTE: naudojame pilna UNIQUE CONSTRAINT (ne partial index),
-- nes ON CONFLICT reikalauja constraint'o arba full index'o.
-- NULL values are allowed multiple times (SQL NULL!=NULL).
ALTER TABLE public.artists
  DROP CONSTRAINT IF EXISTS artists_legacy_id_key;
ALTER TABLE public.artists
  ADD CONSTRAINT artists_legacy_id_key UNIQUE (legacy_id);

ALTER TABLE public.albums
  ADD COLUMN IF NOT EXISTS legacy_id INTEGER,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;

ALTER TABLE public.albums
  DROP CONSTRAINT IF EXISTS albums_legacy_id_key;
ALTER TABLE public.albums
  ADD CONSTRAINT albums_legacy_id_key UNIQUE (legacy_id);

ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS legacy_id INTEGER,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;

ALTER TABLE public.tracks
  DROP CONSTRAINT IF EXISTS tracks_legacy_id_key;
ALTER TABLE public.tracks
  ADD CONSTRAINT tracks_legacy_id_key UNIQUE (legacy_id);

COMMENT ON COLUMN public.artists.legacy_id IS 'Senosios music.lt sistemos ID (iš URL /lt/grupe/X/{id}/)';
COMMENT ON COLUMN public.artists.source IS 'Duomenų šaltinis: legacy_scrape_v1 | wikipedia | manual';

-- ============================================================
-- Dalis 2: Ghost useriai (senieji forumininkai)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_ghosts (
    username TEXT PRIMARY KEY,
    numeric_id INTEGER,
    registered_date DATE,
    rating_points INTEGER,
    last_seen_text TEXT,
    mention_count INTEGER NOT NULL DEFAULT 0,
    first_seen_category TEXT,
    first_seen_url TEXT,
    avatar_url TEXT,
    source TEXT DEFAULT 'legacy_scrape_v1',
    imported_at TIMESTAMPTZ DEFAULT now(),

    -- Claim flow: kai senas user'is susikuria naują account'ą,
    -- is_claimed=TRUE ir claimed_user_id ← profiles.id
    is_claimed BOOLEAN NOT NULL DEFAULT FALSE,
    claimed_at TIMESTAMPTZ,
    claimed_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

    -- Admin rankiniu būdu suvestas emailas (iš senos DB) — naudojamas reactivation email'ui
    reactivation_email TEXT,
    reactivation_sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_ghosts_numeric ON public.user_ghosts (numeric_id);
CREATE INDEX IF NOT EXISTS idx_user_ghosts_mention ON public.user_ghosts (mention_count DESC);
CREATE INDEX IF NOT EXISTS idx_user_ghosts_claimed ON public.user_ghosts (is_claimed);

COMMENT ON TABLE public.user_ghosts IS
  'Legacy music.lt members (username-only records). Linked via claimed_user_id when user creates new account.';

-- ============================================================
-- Dalis 3: Forumo archyvas
-- ============================================================

CREATE TABLE IF NOT EXISTS public.forum_threads (
    legacy_id INTEGER PRIMARY KEY,
    slug TEXT,
    title TEXT,
    post_count INTEGER,
    pagination_count INTEGER,
    source_url TEXT NOT NULL,
    first_post_at TIMESTAMPTZ,
    last_post_at TIMESTAMPTZ,
    imported_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forum_threads_slug ON public.forum_threads (slug);
CREATE INDEX IF NOT EXISTS idx_forum_threads_last_post ON public.forum_threads (last_post_at DESC);

CREATE TABLE IF NOT EXISTS public.forum_posts (
    legacy_id INTEGER PRIMARY KEY,
    thread_legacy_id INTEGER NOT NULL REFERENCES public.forum_threads(legacy_id) ON DELETE CASCADE,
    page_number INTEGER,

    -- Author — dviejų tipų link'ai į user'į:
    --   author_username → user_ghosts (visada)
    --   author_user_id → profiles (jei useris claim'inęs)
    author_username TEXT,
    author_numeric_id INTEGER,
    author_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ,
    like_count INTEGER,
    content_html TEXT,
    content_text TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    imported_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forum_posts_thread ON public.forum_posts (thread_legacy_id);
CREATE INDEX IF NOT EXISTS idx_forum_posts_author ON public.forum_posts (author_username);
CREATE INDEX IF NOT EXISTS idx_forum_posts_user ON public.forum_posts (author_user_id) WHERE author_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_forum_posts_created ON public.forum_posts (created_at DESC);

COMMENT ON TABLE public.forum_threads IS 'Forum thread archive from legacy music.lt';
COMMENT ON TABLE public.forum_posts IS 'Forum posts. author_user_id gets filled later via ghost user claim flow.';

-- ============================================================
-- Dalis 4: Komentarai prie artist/album/track/news/creation
-- ============================================================
-- (blog_comments YRA atskiras dalykas — tik user blog'ams. Čia legacy komentarai
-- prie official turinio.)

CREATE TABLE IF NOT EXISTS public.comments_legacy (
    legacy_id INTEGER PRIMARY KEY,
    parent_type TEXT NOT NULL CHECK (parent_type IN ('artist','album','track','news','creation')),
    parent_legacy_id INTEGER NOT NULL,

    author_username TEXT,
    author_numeric_id INTEGER,
    author_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ,
    like_count INTEGER,
    content_html TEXT,
    content_text TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    imported_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_legacy_parent ON public.comments_legacy (parent_type, parent_legacy_id);
CREATE INDEX IF NOT EXISTS idx_comments_legacy_author ON public.comments_legacy (author_username);

-- ============================================================
-- Dalis 5: Naujienos / kūryba (iš scrape'o — ne user blog'ai)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.news_legacy (
    slug TEXT PRIMARY KEY,
    title TEXT,
    summary TEXT,
    body_html TEXT,
    author_username TEXT,
    published_at TIMESTAMPTZ,
    source_url TEXT NOT NULL,
    imported_at TIMESTAMPTZ DEFAULT now(),
    source TEXT DEFAULT 'legacy_scrape_v1'
);

CREATE INDEX IF NOT EXISTS idx_news_legacy_published ON public.news_legacy (published_at DESC);

CREATE TABLE IF NOT EXISTS public.creation_posts_legacy (
    slug TEXT PRIMARY KEY,
    title TEXT,
    summary TEXT,
    body_html TEXT,
    author_username TEXT,
    created_at TIMESTAMPTZ,
    source_url TEXT NOT NULL,
    imported_at TIMESTAMPTZ DEFAULT now(),
    source TEXT DEFAULT 'legacy_scrape_v1'
);

-- ============================================================
-- Dalis 6: Import audit
-- ============================================================

CREATE TABLE IF NOT EXISTS public.import_batches (
    id BIGSERIAL PRIMARY KEY,
    source TEXT NOT NULL,                   -- 'legacy_scrape_v1' | 'wikipedia' | 'musicbrainz'
    scraper_version TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    rows_imported JSONB,                    -- {"artists": 100, "albums": 500, ...}
    notes TEXT
);

-- ============================================================
-- Dalis 7: Helper views
-- ============================================================

CREATE OR REPLACE VIEW public.v_legacy_stats AS
SELECT
  'artists' AS kind, COUNT(*) AS total,
  COUNT(*) FILTER (WHERE source = 'legacy_scrape_v1') AS from_legacy,
  COUNT(*) FILTER (WHERE source = 'wikipedia') AS from_wiki
FROM public.artists
UNION ALL SELECT 'albums', COUNT(*),
  COUNT(*) FILTER (WHERE source = 'legacy_scrape_v1'),
  COUNT(*) FILTER (WHERE source = 'wikipedia')
FROM public.albums
UNION ALL SELECT 'tracks', COUNT(*),
  COUNT(*) FILTER (WHERE source = 'legacy_scrape_v1'),
  COUNT(*) FILTER (WHERE source = 'wikipedia')
FROM public.tracks
UNION ALL SELECT 'forum_threads', COUNT(*), COUNT(*), 0 FROM public.forum_threads
UNION ALL SELECT 'forum_posts', COUNT(*), COUNT(*), 0 FROM public.forum_posts
UNION ALL SELECT 'comments', COUNT(*), COUNT(*), 0 FROM public.comments_legacy
UNION ALL SELECT 'user_ghosts', COUNT(*), COUNT(*), 0 FROM public.user_ghosts;

CREATE OR REPLACE VIEW public.v_top_ghost_users AS
SELECT username, numeric_id, mention_count, rating_points, registered_date,
       is_claimed, reactivation_email IS NOT NULL AS has_email
FROM public.user_ghosts
ORDER BY mention_count DESC NULLS LAST, rating_points DESC NULLS LAST;

-- ============================================================
-- RLS — ghost users, comments_legacy, forum_posts leidžiami skaityti visiems
-- (kad galima būtų rodyti archyvą), tik admin'ai gali rašyti
-- ============================================================

ALTER TABLE public.user_ghosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments_legacy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_legacy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creation_posts_legacy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

-- Public read policies (all content readable by anon).
-- Drop-if-exists first, kad migracija būtų idempotent (saugu paleisti kelis kartus).
DROP POLICY IF EXISTS "public read" ON public.user_ghosts;
DROP POLICY IF EXISTS "public read" ON public.forum_threads;
DROP POLICY IF EXISTS "public read" ON public.forum_posts;
DROP POLICY IF EXISTS "public read" ON public.comments_legacy;
DROP POLICY IF EXISTS "public read" ON public.news_legacy;
DROP POLICY IF EXISTS "public read" ON public.creation_posts_legacy;

CREATE POLICY "public read" ON public.user_ghosts FOR SELECT USING (true);
CREATE POLICY "public read" ON public.forum_threads FOR SELECT USING (true);
CREATE POLICY "public read" ON public.forum_posts FOR SELECT USING (NOT is_deleted);
CREATE POLICY "public read" ON public.comments_legacy FOR SELECT USING (NOT is_deleted);
CREATE POLICY "public read" ON public.news_legacy FOR SELECT USING (true);
CREATE POLICY "public read" ON public.creation_posts_legacy FOR SELECT USING (true);

-- Service role gali viską (apeina RLS automatically)

COMMENT ON VIEW public.v_legacy_stats IS
  'Summary of row counts from legacy scrape vs Wikipedia. Use for admin dashboard.';
