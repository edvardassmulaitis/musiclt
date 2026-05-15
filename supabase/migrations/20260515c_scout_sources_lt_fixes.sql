-- ============================================================
-- 2026-05-15 — Pataisyti LT news scout feed_url'us
-- ============================================================
-- 2026-05-14 night batch atskleidė, kad LT RSS šaltinių URL'ai
-- yra pasenę. scout_seen_urls audit'as (2026-05-15 04:50 UTC):
--
--   - LRT (id=2):         feed_url HTTP 404 (legacy /news/rss?categoryId=)
--   - Delfi (id=3):       legacy /rss/feeds/veidai.xml 301 → v2 listing
--                         (returns channel index, NOT articles)
--   - Bernardinai (id=4): /rss Cloudflare 403 — bot challenge
--
-- Korektūs feed'ai (verified curl'u 2026-05-15):
--   - LRT Kultūra:        https://www.lrt.lt/naujienos/kultura?rss
--   - Delfi Muzika:       https://feed.delfi.lt/v2/articles/14?format=rss
--   - Bernardinai:        https://www.bernardinai.lt/feed
--
-- 15min (id=1) — palikta is_active=true PRIE PALAUKIANT — feed grąžina
-- 2010 archyvą (Be2gether festival), be to robots.txt eksplicitiškai
-- draudžia AI/LLM. Jei Edvardas patvirtins — atskira migracija
-- deactivate'ina.
-- ============================================================

UPDATE public.scout_sources
SET feed_url = 'https://www.lrt.lt/naujienos/kultura?rss',
    last_error = NULL,
    last_fetched_at = NULL  -- force re-fetch
WHERE id = 2 AND parser_key = 'lrt';

UPDATE public.scout_sources
SET feed_url = 'https://feed.delfi.lt/v2/articles/14?format=rss',
    last_error = NULL,
    last_fetched_at = NULL
WHERE id = 3 AND parser_key = 'delfi';

UPDATE public.scout_sources
SET feed_url = 'https://www.bernardinai.lt/feed',
    last_error = NULL,
    last_fetched_at = NULL
WHERE id = 4 AND parser_key = 'bernardinai';

-- ============================================================
-- Sanity check (run separately po migracijos):
-- SELECT id, name, feed_url, last_error
-- FROM public.scout_sources
-- WHERE category = 'news_lt'
-- ORDER BY id;
-- ============================================================
