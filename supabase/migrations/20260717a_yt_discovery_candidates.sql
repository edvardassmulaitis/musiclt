-- ============================================================
-- 2026-07-17 — YouTube velocity discovery (punktas A)
-- ============================================================
-- Tikslas: plati naujos muzikos atradimo eilė iš YouTube (LT + užsienio),
-- ranguojama pagal views/valandą (velocity) — leading signalas, gaudantis
-- naujas dainas KOL jos dar nepateko į konkrečius topus. Mirror'ina esamą
-- scout architektūrą (scout_sources + savo candidate lentelė), bet kol kas
-- SĄMONINGAI atskira eilė (ne external_charts) — kad dormant scaffold'as
-- neliestų gyvų charts duomenų, kol nepatestuota gyvai su Edvardu. Vėliau
-- galima konverguoti į sintetinį external_charts šaltinį (žr. projekto doc
-- `musiclt-punktas-a-discovery-tests-2026-07-17b.md`).
--
-- STATUSAS: dormant. Šaltiniai seed'inami su is_active=false — niekas nesukasi,
-- kol Edvardas neaktyvuoja ir kartu nepatestuojame feed'o signalo gyvai.
--
-- Velocity: YouTube Atom feed'as neša <media:statistics views="..."> +
-- <published> — views/val skaičiuojamas nemokamai (žr. lib/scout-feeds.ts
-- parseAtom papildymą). Antro nuskaitymo metu Δviews/Δlaikas duoda šviežią
-- velocity (views_last vs views_first).
-- ============================================================

-- 1) scout_sources.category — pridėti 'yt_discovery'
ALTER TABLE public.scout_sources DROP CONSTRAINT IF EXISTS scout_sources_category_check;
ALTER TABLE public.scout_sources
  ADD CONSTRAINT scout_sources_category_check
  CHECK (category IN ('news_lt','news_intl','tickets','artist_social','wiki_list','yt_discovery'));

-- 2) Discovery candidate queue
CREATE TABLE IF NOT EXISTS public.yt_discovery_candidates (
  id BIGSERIAL PRIMARY KEY,

  source_id   BIGINT REFERENCES public.scout_sources(id) ON DELETE SET NULL,

  -- YouTube video
  video_id      TEXT,                              -- iš watch?v=... arba shorts/...
  video_url     TEXT NOT NULL,
  guid          TEXT,                              -- Atom <id> (yt:video:...)
  raw_title     TEXT NOT NULL,                     -- pilnas video pavadinimas
  channel_title TEXT,

  -- Parsed (parseYtTitle) — informacinis, tikras artist eina per match
  artist_raw  TEXT,
  title_raw   TEXT,

  -- Velocity signalas
  published_at   TIMESTAMPTZ,
  views_first    BIGINT,                           -- peržiūros pirmo pamatymo metu
  views_first_at TIMESTAMPTZ,
  views_last     BIGINT,                           -- peržiūros paskutinio nuskaitymo metu
  views_last_at  TIMESTAMPTZ,
  velocity_vph   NUMERIC,                          -- views/val (geriausias turimas įvertis)

  -- Entity match
  matched_artist_id BIGINT REFERENCES public.artists(id) ON DELETE SET NULL,
  match_score       NUMERIC(3,2),
  -- 'lt' = match'intas LT atlikėjas; 'foreign' = match'intas ne-LT; 'unknown' = ne katalogo
  scope TEXT NOT NULL DEFAULT 'unknown' CHECK (scope IN ('lt','foreign','unknown')),

  -- Dedupe (video URL/id hash)
  fingerprint TEXT NOT NULL,

  -- Workflow
  status TEXT NOT NULL DEFAULT 'pending'
         CHECK (status IN ('pending','approved','rejected','duplicate','error','not_music')),
  reviewed_by   UUID,
  reviewed_at   TIMESTAMPTZ,
  reject_reason TEXT,

  published_track_id INTEGER REFERENCES public.tracks(id) ON DELETE SET NULL,

  rescanned_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_yt_discovery_fingerprint
  ON public.yt_discovery_candidates (fingerprint);

-- Review UI: pending pagal scope, rikiuota pagal velocity
CREATE INDEX IF NOT EXISTS idx_yt_discovery_status_scope_velocity
  ON public.yt_discovery_candidates (status, scope, velocity_vph DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_yt_discovery_artist
  ON public.yt_discovery_candidates (matched_artist_id)
  WHERE matched_artist_id IS NOT NULL;

-- 3) Seed šaltiniai — DORMANT (is_active=false). Aktyvuoti tik kartu patestavus
--    feed signalą gyvai. feed_url = YouTube playlist Atom feed'as
--    (youtube.com/feeds/videos.xml?playlist_id=... — nemokamas, be kvotos).
--    Pavyzdiniai; realų rinkinį suderinsim su Edvardu (kworb LT giliau,
--    per-kanalą top katalogo atlikėjams, release-based new-release feed'ai).
INSERT INTO public.scout_sources
  (name, category, feed_url, list_url, parser_key, is_active, fetch_interval_min, notes)
VALUES
  ('YouTube: Trending 20 Lithuania', 'yt_discovery',
   'https://www.youtube.com/feeds/videos.xml?playlist_id=OLAK5uy_n-JFLDTeCgB3uWgUsjT6uiY_k6CIqXWq8',
   NULL, 'yt_disc_lt_trending', false, 360,
   'Punktas A — LT trending auto-playlist. DORMANT: aktyvuoti tik patestavus signalą.'),
  ('YouTube: Music (global)', 'yt_discovery',
   'https://www.youtube.com/feeds/videos.xml?channel_id=UC-9-kyTW8ZkZNDHQJ6FgpwQ',
   NULL, 'yt_disc_global_music', false, 360,
   'Punktas A — globalus YouTube „Music" kanalas. DORMANT.')
ON CONFLICT (parser_key) DO NOTHING;
