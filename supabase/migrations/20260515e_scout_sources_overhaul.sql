-- ============================================================
-- 2026-05-15 — Scout sources overhaul:
--   1) Hard-delete 15min (id=1) + Bernardinai (id=4) — buvo deactivated
--      20260515d, dabar visiškai nukerpame
--   2) Įdedame NME Music (id=12) + Billboard Music (id=13) — INTL muzikos
--      news, fresh feed'ai patikrinti 2026-05-15
--   3) Pridedame source_published_at stulpelį į news_candidates
--      (RSS pubDate iš originalaus straipsnio, ne mūsų scrape time)
-- ============================================================

-- 1) Cleanup 15min + Bernardinai (FK chain: scout_seen_urls → news_candidates → scout_sources)
DELETE FROM public.scout_seen_urls   WHERE source_id IN (1, 4);
DELETE FROM public.news_candidates   WHERE source_id IN (1, 4);
DELETE FROM public.scout_sources     WHERE id IN (1, 4);

-- 2) NME + Billboard
INSERT INTO public.scout_sources (id, name, category, feed_url, parser_key, fetch_interval_min, is_active, notes)
VALUES
  (12, 'NME Music',       'news_intl', 'https://www.nme.com/news/music/feed',                'nme',       720, true, 'UK music news, daily fresh items'),
  (13, 'Billboard Music', 'news_intl', 'https://www.billboard.com/c/music/music-news/feed/', 'billboard', 720, true, 'US Billboard music news + charts coverage')
ON CONFLICT (id) DO NOTHING;

-- Reset BIGSERIAL kad ateityje nebūtų ID conflict'ų
SELECT setval('scout_sources_id_seq', GREATEST((SELECT MAX(id) FROM public.scout_sources), 13));

-- 3) source_published_at — originalaus straipsnio publikacijos data iš RSS pubDate
ALTER TABLE public.news_candidates
  ADD COLUMN IF NOT EXISTS source_published_at TIMESTAMPTZ;

COMMENT ON COLUMN public.news_candidates.source_published_at IS
  'Original article publish date (from RSS pubDate or HTML article meta). NULL when not available.';

-- ============================================================
-- Po šios migracijos news scout matrix: [2, 3, 5, 6, 7, 8, 12, 13]
-- Workflow YAML dar atnaujinamas atskirame commit'e.
-- ============================================================
