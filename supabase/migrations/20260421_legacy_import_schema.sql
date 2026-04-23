-- Music.lt legacy content import — staging schema
--
-- Purpose: laikina erdvė senosios music.lt (custom PHP CMS) scrape'intam turiniui,
-- kol jis bus mapped į public.* lentelės per ETL.
--
-- Visi įrašai turi `source_url`, `scraped_at`, `legacy_id` — atsekamumui.
-- Trynimo strategija: DROP SCHEMA legacy_import CASCADE; tada perimport'as.

CREATE SCHEMA IF NOT EXISTS legacy_import;

-- ============================================================
-- Import audit
-- ============================================================

CREATE TABLE IF NOT EXISTS legacy_import.import_batch (
    id BIGSERIAL PRIMARY KEY,
    scraper_version TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    config_snapshot JSONB,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS legacy_import.crawl_log (
    url TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    batch_id BIGINT REFERENCES legacy_import.import_batch(id) ON DELETE SET NULL,
    http_status INTEGER,
    body_size_bytes INTEGER,
    raw_html_path TEXT,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    parse_ok BOOLEAN DEFAULT FALSE,
    parse_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_crawl_log_category ON legacy_import.crawl_log(category);
CREATE INDEX IF NOT EXISTS idx_crawl_log_batch ON legacy_import.crawl_log(batch_id);
CREATE INDEX IF NOT EXISTS idx_crawl_log_parse_ok ON legacy_import.crawl_log(parse_ok);

-- ============================================================
-- Users (ghost)
-- ============================================================

CREATE TABLE IF NOT EXISTS legacy_import.users_ghost (
    username TEXT PRIMARY KEY,
    numeric_id INTEGER,                  -- iš /images/avatars/{id} arba ?users;points;rid
    registered_date DATE,                -- "Narys nuo: YYYY-MM-DD"
    rating_points INTEGER,               -- "Reitingo taškai: N"
    last_seen_text TEXT,                 -- "Prieš 1 val." ar panašiai — free-form
    mention_count INTEGER NOT NULL DEFAULT 1,
    first_seen_category TEXT,
    first_seen_url TEXT,
    email TEXT,                          -- Edvardo rankiniu suvestas — tolesnis reclaim step
    is_claimed BOOLEAN NOT NULL DEFAULT FALSE,
    claimed_at TIMESTAMPTZ,
    claimed_user_id UUID,                -- ref į production auth.users (po claim flow)
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_ghost_numeric ON legacy_import.users_ghost(numeric_id);
CREATE INDEX IF NOT EXISTS idx_users_ghost_email ON legacy_import.users_ghost(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_ghost_claimed ON legacy_import.users_ghost(is_claimed);

-- ============================================================
-- Core music data
-- ============================================================

CREATE TABLE IF NOT EXISTS legacy_import.artists (
    legacy_id INTEGER PRIMARY KEY,       -- senoje sistemoje naudotas ID (iš URL)
    slug TEXT,
    name TEXT,
    bio_text TEXT,                       -- meta description
    bio_html TEXT,                       -- pilnas bio HTML (ateities step)
    source_url TEXT NOT NULL,
    raw_html_path TEXT,
    comment_count INTEGER,
    like_count INTEGER,
    album_urls TEXT[],                   -- ne-FK, tik URL'ai (join'as per legacy_id vėliau)
    track_urls TEXT[],
    user_refs JSONB,                     -- [{"username": "...", "numeric_id": 123}, ...]
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    batch_id BIGINT REFERENCES legacy_import.import_batch(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_artists_slug ON legacy_import.artists(slug);

CREATE TABLE IF NOT EXISTS legacy_import.albums (
    legacy_id INTEGER PRIMARY KEY,
    slug TEXT,
    title TEXT,
    artist_legacy_id INTEGER,            -- išgaunamas iš artist_url
    artist_url TEXT,
    track_urls TEXT[],
    release_year INTEGER,
    source_url TEXT NOT NULL,
    raw_html_path TEXT,
    comment_count INTEGER,
    user_refs JSONB,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    batch_id BIGINT REFERENCES legacy_import.import_batch(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_albums_artist ON legacy_import.albums(artist_legacy_id);

CREATE TABLE IF NOT EXISTS legacy_import.tracks (
    legacy_id INTEGER PRIMARY KEY,
    slug TEXT,
    title TEXT,
    artist_legacy_id INTEGER,
    artist_url TEXT,
    album_legacy_id INTEGER,
    album_url TEXT,
    youtube_ids TEXT[],
    source_url TEXT NOT NULL,
    raw_html_path TEXT,
    comment_count INTEGER,
    user_refs JSONB,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    batch_id BIGINT REFERENCES legacy_import.import_batch(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tracks_artist ON legacy_import.tracks(artist_legacy_id);
CREATE INDEX IF NOT EXISTS idx_tracks_album ON legacy_import.tracks(album_legacy_id);

-- ============================================================
-- Forum
-- ============================================================

CREATE TABLE IF NOT EXISTS legacy_import.forum_threads (
    legacy_id INTEGER PRIMARY KEY,       -- thread ID iš URL
    slug TEXT,
    title TEXT,
    post_count INTEGER,
    pagination_count INTEGER,            -- kiek puslapių turi thread'as
    source_url TEXT NOT NULL,
    raw_html_path TEXT,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    batch_id BIGINT REFERENCES legacy_import.import_batch(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS legacy_import.forum_posts (
    legacy_id INTEGER PRIMARY KEY,       -- unique per post (one_comment_X)
    thread_legacy_id INTEGER NOT NULL REFERENCES legacy_import.forum_threads(legacy_id) ON DELETE CASCADE,
    page_number INTEGER,
    author_username TEXT,
    author_numeric_id INTEGER,
    created_at TIMESTAMPTZ,              -- parsed iš LT datetime
    like_count INTEGER,
    content_html TEXT,
    content_text TEXT,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forum_posts_thread ON legacy_import.forum_posts(thread_legacy_id);
CREATE INDEX IF NOT EXISTS idx_forum_posts_author ON legacy_import.forum_posts(author_username);
CREATE INDEX IF NOT EXISTS idx_forum_posts_created ON legacy_import.forum_posts(created_at);

-- ============================================================
-- Comments (applicable prie artists/albums/tracks/news/creation)
-- ============================================================

CREATE TABLE IF NOT EXISTS legacy_import.comments (
    legacy_id INTEGER PRIMARY KEY,
    parent_type TEXT NOT NULL,           -- 'artist' | 'album' | 'track' | 'news' | 'creation'
    parent_legacy_id INTEGER NOT NULL,
    author_username TEXT,
    author_numeric_id INTEGER,
    created_at TIMESTAMPTZ,
    like_count INTEGER,
    content_html TEXT,
    content_text TEXT,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_parent ON legacy_import.comments(parent_type, parent_legacy_id);
CREATE INDEX IF NOT EXISTS idx_comments_author ON legacy_import.comments(author_username);

-- ============================================================
-- Editorial content (news, creation, reviews, daily song, etc.)
-- ============================================================

CREATE TABLE IF NOT EXISTS legacy_import.news (
    slug TEXT PRIMARY KEY,
    title TEXT,
    summary TEXT,
    body_html TEXT,
    author_username TEXT,
    published_at TIMESTAMPTZ,
    source_url TEXT NOT NULL,
    raw_html_path TEXT,
    comment_count INTEGER,
    user_refs JSONB,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    batch_id BIGINT REFERENCES legacy_import.import_batch(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS legacy_import.creation_posts (
    slug TEXT PRIMARY KEY,
    title TEXT,
    summary TEXT,
    body_html TEXT,
    author_username TEXT,
    created_at TIMESTAMPTZ,
    source_url TEXT NOT NULL,
    raw_html_path TEXT,
    comment_count INTEGER,
    user_refs JSONB,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    batch_id BIGINT REFERENCES legacy_import.import_batch(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS legacy_import.reviews (
    source_url TEXT PRIMARY KEY,
    title TEXT,
    summary TEXT,
    body_html TEXT,
    author_username TEXT,
    created_at TIMESTAMPTZ,
    raw_html_path TEXT,
    comment_count INTEGER,
    user_refs JSONB,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    batch_id BIGINT REFERENCES legacy_import.import_batch(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS legacy_import.chords (
    source_url TEXT PRIMARY KEY,
    title TEXT,
    track_legacy_id INTEGER,
    artist_legacy_id INTEGER,
    body_html TEXT,
    author_username TEXT,
    raw_html_path TEXT,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    batch_id BIGINT REFERENCES legacy_import.import_batch(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS legacy_import.translations (
    source_url TEXT PRIMARY KEY,
    title TEXT,
    track_legacy_id INTEGER,
    artist_legacy_id INTEGER,
    body_html TEXT,
    author_username TEXT,
    raw_html_path TEXT,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    batch_id BIGINT REFERENCES legacy_import.import_batch(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS legacy_import.daily_songs (
    date DATE PRIMARY KEY,               -- vienas track per kalendoriaus dieną
    track_legacy_id INTEGER,
    track_url TEXT,
    vote_count INTEGER,
    raw_html_path TEXT,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    batch_id BIGINT REFERENCES legacy_import.import_batch(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS legacy_import.events (
    source_url TEXT PRIMARY KEY,
    title TEXT,
    summary TEXT,
    venue_name TEXT,
    city TEXT,
    event_date DATE,
    raw_html_path TEXT,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    batch_id BIGINT REFERENCES legacy_import.import_batch(id) ON DELETE SET NULL,
    is_js_rendered BOOLEAN DEFAULT FALSE -- Known issue: /renginiai/ yra JS-only
);

-- ============================================================
-- Views for convenient inspection
-- ============================================================

CREATE OR REPLACE VIEW legacy_import.v_category_counts AS
SELECT 'artist' AS category, COUNT(*) AS n FROM legacy_import.artists
UNION ALL SELECT 'album',           COUNT(*) FROM legacy_import.albums
UNION ALL SELECT 'track',           COUNT(*) FROM legacy_import.tracks
UNION ALL SELECT 'forum_thread',    COUNT(*) FROM legacy_import.forum_threads
UNION ALL SELECT 'forum_post',      COUNT(*) FROM legacy_import.forum_posts
UNION ALL SELECT 'comment',         COUNT(*) FROM legacy_import.comments
UNION ALL SELECT 'news',            COUNT(*) FROM legacy_import.news
UNION ALL SELECT 'creation',        COUNT(*) FROM legacy_import.creation_posts
UNION ALL SELECT 'review',          COUNT(*) FROM legacy_import.reviews
UNION ALL SELECT 'chord',           COUNT(*) FROM legacy_import.chords
UNION ALL SELECT 'translation',     COUNT(*) FROM legacy_import.translations
UNION ALL SELECT 'daily_song',      COUNT(*) FROM legacy_import.daily_songs
UNION ALL SELECT 'event',           COUNT(*) FROM legacy_import.events
UNION ALL SELECT 'user_ghost',      COUNT(*) FROM legacy_import.users_ghost
ORDER BY category;

CREATE OR REPLACE VIEW legacy_import.v_top_active_users AS
SELECT username, numeric_id, registered_date, rating_points, mention_count
FROM legacy_import.users_ghost
ORDER BY mention_count DESC, rating_points DESC NULLS LAST;

-- ============================================================
-- RLS — schema liečia tik admin'us (nescrape'inti pilotai ≠ public turinys)
-- ============================================================

ALTER TABLE legacy_import.artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_import.albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_import.tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_import.forum_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_import.forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_import.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_import.users_ghost ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_import.news ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_import.creation_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_import.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_import.chords ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_import.translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_import.daily_songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_import.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_import.crawl_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_import.import_batch ENABLE ROW LEVEL SECURITY;

-- Service role apeina RLS; viešasis access tik per ETL-migrated public.* lenteles.
-- Authenticated user'iai pirmame etape neturi prieigos.

COMMENT ON SCHEMA legacy_import IS
  'Staging schema for scraped content from the legacy music.lt site. Migrated to public.* via ETL pipeline. Rollback strategy: DROP SCHEMA legacy_import CASCADE and re-run import.';
