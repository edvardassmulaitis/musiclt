-- ============================================================
-- 2026-05-14 — News & event candidates queue (automation foundation)
-- ============================================================
-- Tikslas: Sukurti queue lentelę AI parengtoms naujienoms/renginiams.
-- Naudoja: Track B (news scout cron), Track C (events scout), Track D (Gmail),
-- ir Phase 4 manual URL/file admin tool. Visi 4 trackai gamina pending'us,
-- admin'as approve'ina per /admin/inbox.
--
-- Susiję dokumentai:
--   AUTOMATION_PLAN.md repo root'e — phasing ir schema rationale
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1) Scout sources registry
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scout_sources (
  id                  BIGSERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  category            TEXT NOT NULL CHECK (category IN ('news_lt','news_intl','tickets','artist_social')),
  feed_url            TEXT,                       -- RSS jei yra
  list_url            TEXT,                       -- HTML listing jei nėra RSS
  parser_key          TEXT NOT NULL,              -- "15min","lrt","pitchfork","bilietai_lt"
  is_active           BOOLEAN NOT NULL DEFAULT true,
  fetch_interval_min  INTEGER NOT NULL DEFAULT 720,  -- 12h default = 2x/day
  last_fetched_at     TIMESTAMPTZ,
  last_error          TEXT,
  notes               TEXT,                       -- admin'ams: kvalifikacija, kontaktas
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(parser_key)
);

CREATE INDEX IF NOT EXISTS idx_scout_sources_active_cat
  ON public.scout_sources (is_active, category);

-- ─────────────────────────────────────────────────────────────
-- 2) Scout seen URLs (dedupe memory across runs)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scout_seen_urls (
  url_hash       TEXT PRIMARY KEY,                -- sha1 of canonical URL
  source_id      BIGINT REFERENCES public.scout_sources(id) ON DELETE SET NULL,
  candidate_id   BIGINT,                          -- jei davė kandidatą; NULL jei filtruotas
  filter_reason  TEXT,                            -- "not_music","gossip","not_target_category","dup",...
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scout_seen_source
  ON public.scout_seen_urls (source_id, first_seen_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 3) News candidates queue
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.news_candidates (
  id            BIGSERIAL PRIMARY KEY,

  -- Source tracking
  source_type   TEXT NOT NULL CHECK (source_type IN
                  ('scout_rss','scout_scrape','gmail','manual_url','manual_file')),
  source_id     BIGINT REFERENCES public.scout_sources(id) ON DELETE SET NULL,
  source_url    TEXT,
  source_portal TEXT,                             -- "15min","pitchfork", arba "gmail:label-X"
  source_email_thread_id TEXT,                    -- Gmail thread ID (Phase 2)
  source_email_from      TEXT,                    -- "manager@artistname.com"

  -- Raw input snapshot (debug + regen)
  raw_text      TEXT,
  raw_html      TEXT,
  raw_lang      TEXT,                             -- aptikta originalo kalba

  -- AI output (LT)
  ai_category   TEXT CHECK (ai_category IN
                  ('release','performance','tour','career_step')),
  ai_title      TEXT NOT NULL,
  ai_body       TEXT NOT NULL,                    -- HTML su related entity kortelėmis
  ai_summary    TEXT,                             -- 2-sakinių inbox preview
  ai_confidence NUMERIC(3,2) DEFAULT 0.0,         -- 0..1
  ai_model      TEXT,                             -- "claude-sonnet-4-6"

  -- Entity matches
  suggested_artist_ids  BIGINT[] DEFAULT '{}',
  suggested_track_ids   INT[] DEFAULT '{}',
  suggested_album_ids   INT[] DEFAULT '{}',
  primary_artist_id     BIGINT REFERENCES public.artists(id) ON DELETE SET NULL,

  -- Image
  suggested_image_url       TEXT,                 -- raw iš source
  suggested_image_local     TEXT,                 -- po resize'o (storage path)
  fallback_image_artist_id  BIGINT REFERENCES public.artists(id) ON DELETE SET NULL,

  -- Dedupe
  url_canonical_hash TEXT,
  title_fingerprint  TEXT,                        -- normalized title for fuzzy dedupe

  -- Event link (jei category='tour' ir susimato su event_candidate)
  linked_event_candidate_id BIGINT,

  -- Workflow
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected','duplicate','filtered','error')),
  reviewed_by   INTEGER,                          -- users(id)
  reviewed_at   TIMESTAMPTZ,
  reject_reason TEXT,
  filter_reason TEXT,                             -- jei status='filtered': "not_music","not_target_category"

  -- Published result (kai admin'as approvina)
  published_news_id INTEGER REFERENCES public.news(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_news_candidates_url_hash
  ON public.news_candidates (url_canonical_hash)
  WHERE url_canonical_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_news_candidates_email_thread
  ON public.news_candidates (source_email_thread_id)
  WHERE source_email_thread_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_news_candidates_status_created
  ON public.news_candidates (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_news_candidates_primary_artist
  ON public.news_candidates (primary_artist_id)
  WHERE primary_artist_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_news_candidates_source
  ON public.news_candidates (source_id, created_at DESC)
  WHERE source_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 4) Event candidates queue
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_candidates (
  id BIGSERIAL PRIMARY KEY,

  source_type   TEXT NOT NULL CHECK (source_type IN ('scout_scrape','manual_url')),
  source_id     BIGINT REFERENCES public.scout_sources(id) ON DELETE SET NULL,
  source_url    TEXT,
  source_portal TEXT,

  -- Structured fields
  title           TEXT NOT NULL,
  event_date      TIMESTAMPTZ,
  event_date_text TEXT,                           -- jei datą sunku parsint, laikom raw
  venue_name_raw  TEXT,
  city            TEXT,
  description     TEXT,
  ticket_url      TEXT,
  price_text      TEXT,
  image_url       TEXT,

  -- Entity matches
  suggested_artist_ids BIGINT[] DEFAULT '{}',
  suggested_venue_id   BIGINT REFERENCES public.venues(id) ON DELETE SET NULL,
  primary_artist_id    BIGINT REFERENCES public.artists(id) ON DELETE SET NULL,

  -- Dedupe
  fingerprint TEXT,                               -- sha1(norm_title|date|city)

  -- Workflow
  status TEXT NOT NULL DEFAULT 'pending'
         CHECK (status IN ('pending','approved','rejected','duplicate','filtered','error')),
  reviewed_by INTEGER,
  reviewed_at TIMESTAMPTZ,
  reject_reason TEXT,
  filter_reason TEXT,

  published_event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,

  ai_confidence NUMERIC(3,2) DEFAULT 0.0,
  ai_model      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_event_candidates_fingerprint
  ON public.event_candidates (fingerprint)
  WHERE fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_candidates_status_date
  ON public.event_candidates (status, event_date);

CREATE INDEX IF NOT EXISTS idx_event_candidates_primary_artist
  ON public.event_candidates (primary_artist_id)
  WHERE primary_artist_id IS NOT NULL;

-- Add the reverse FK from news_candidates → event_candidates (was deferred)
ALTER TABLE public.news_candidates
  ADD CONSTRAINT fk_news_candidates_linked_event
  FOREIGN KEY (linked_event_candidate_id)
  REFERENCES public.event_candidates(id)
  ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────
-- 5) Gmail dedupe memory (Phase 2)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gmail_seen_messages (
  message_id    TEXT PRIMARY KEY,
  thread_id     TEXT,
  candidate_id  BIGINT REFERENCES public.news_candidates(id) ON DELETE SET NULL,
  filter_reason TEXT,                             -- jei nepateko į queue
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gmail_seen_thread
  ON public.gmail_seen_messages (thread_id);

-- ─────────────────────────────────────────────────────────────
-- 6) Enable pg_trgm for entity matching (artist/track fuzzy)
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Trigram index ant artist'ų pavadinimų (fuzzy match'ui iš naujienų tekstų)
CREATE INDEX IF NOT EXISTS idx_artists_name_trgm
  ON public.artists USING gin (name gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────
-- 7) Seed scout_sources — Phase 1 LT portalai (pradžiai)
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.scout_sources
  (name, category, feed_url, list_url, parser_key, fetch_interval_min, notes)
VALUES
  ('15min Muzika',     'news_lt',   'https://www.15min.lt/rss/muzika',                          NULL, '15min',     720, 'Pagrindinis LT portalas, dazni release news'),
  ('LRT Klasika',      'news_lt',   'https://www.lrt.lt/news/rss?categoryId=1083',              NULL, 'lrt',       720, 'LRT muzikos kategorija'),
  ('Delfi Veidai',     'news_lt',   'https://www.delfi.lt/rss/feeds/veidai.xml',                NULL, 'delfi',     720, 'Filtruoti pagal muzika tag/keywords'),
  ('Bernardinai',      'news_lt',   'https://www.bernardinai.lt/rss',                           NULL, 'bernardinai', 720, 'Kulturos section'),
  ('Pitchfork News',   'news_intl', 'https://pitchfork.com/feed/feed-news/rss',                 NULL, 'pitchfork', 720, 'Major release breaks'),
  ('Stereogum',        'news_intl', 'https://www.stereogum.com/feed/',                          NULL, 'stereogum', 720, 'Indie/alt news'),
  ('Rolling Stone Music', 'news_intl', 'https://www.rollingstone.com/music/feed/',              NULL, 'rolling_stone', 720, 'Mainstream pop/rock'),
  ('Consequence',      'news_intl', 'https://consequence.net/feed/',                            NULL, 'consequence', 720, 'Rock/indie news')
ON CONFLICT (parser_key) DO NOTHING;
