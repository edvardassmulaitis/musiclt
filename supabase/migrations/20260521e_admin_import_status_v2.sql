-- ============================================================
-- 2026-05-21b — /admin/import master table v2
-- ============================================================
-- Konteksto kontekstas: /admin/import lentelėje atlikėjai (pvz. Atlanta)
-- importuoti per `import_artist.py` CLI nerodomi kaip "padaryti" — sena
-- view'os versija derivina wiki_done/scrape_done IŠ `import_jobs` queue'os,
-- todėl CLI flow'as nepalieka pėdsako.
--
-- Šita migracija:
--   • drop'ina/atkuria `v_artist_import_status` view kuri wrap'ina
--     `v_artist_migration_status` (v3 — su realiu DB state'u).
--   • prideda RICH kolonas: score, score_done, hero_done, photo_done,
--     image_is_small, scrape_done, wiki_done, n_lyrics, n_videos,
--     lyrics_pct, yt_pct, yt_views_pct, is_lt/is_intl/is_unknown,
--     legacy_likes/legacy_discussion_count/legacy_news_count
--   • palieka job queue history kolonas (wiki_completed_at,
--     wiki_last_status, scrape_completed_at, scrape_last_status,
--     active_jobs) — naudingos audit/debug'iui ir UI badge'iams.
--
-- Po šitos migracijos /admin/import API turi pakeisti status filter'us
-- naudoti REALIAS booleans (scrape_done/wiki_done iš view), o ne job
-- queue timestamps. Plačiau /api/admin/import/artists/route.ts.
--
-- Dependency: v_artist_migration_status (created in 20260521a_*.sql v3).
-- ============================================================

BEGIN;

DROP VIEW IF EXISTS public.v_artist_import_status CASCADE;

CREATE VIEW public.v_artist_import_status AS
SELECT
  -- ── Core ──
  ms.id,
  ms.legacy_id,
  ms.slug,
  ms.name,
  ms.image_url      AS cover_image_url,    -- backward compat (UI sets <img>)
  ms.hero_url,                              -- naujas — UI gali rodyti hero hint
  ms.score,
  ms.score_updated_at,

  -- ── Quality state (real DB) ──
  ms.score_done,
  ms.hero_done,
  ms.photo_done,
  ms.image_is_small,
  ms.image_width,
  ms.image_height,
  ms.scrape_done,
  ms.wiki_done,

  -- ── Buckets ──
  ms.country,
  ms.is_lt,
  ms.is_intl,
  ms.is_unknown,

  -- ── Counts + coverage ──
  ms.album_count,
  ms.track_count,
  ms.n_lyrics,
  ms.n_videos,
  ms.n_video_views_filled,
  ms.lyrics_pct,
  ms.yt_pct,
  ms.yt_views_pct,

  -- ── Legacy popularity (sortinimui) ──
  ms.legacy_likes,
  ms.legacy_comments,
  ms.legacy_discussion_count,
  ms.legacy_news_count,
  ms.legacy_concert_count,
  ms.legacy_stats_at,

  -- ── Job queue history (audit + UI badge'iai) ──
  (SELECT j.completed_at FROM public.import_jobs j
   WHERE j.artist_legacy_id = ms.legacy_id
     AND j.job_type = 'wiki' AND j.status = 'completed'
   ORDER BY j.completed_at DESC LIMIT 1)               AS wiki_completed_at,
  (SELECT j.status FROM public.import_jobs j
   WHERE j.artist_legacy_id = ms.legacy_id AND j.job_type = 'wiki'
   ORDER BY j.requested_at DESC LIMIT 1)               AS wiki_last_status,
  (SELECT j.completed_at FROM public.import_jobs j
   WHERE j.artist_legacy_id = ms.legacy_id
     AND j.job_type = 'scrape' AND j.status = 'completed'
   ORDER BY j.completed_at DESC LIMIT 1)               AS scrape_completed_at,
  (SELECT j.status FROM public.import_jobs j
   WHERE j.artist_legacy_id = ms.legacy_id AND j.job_type = 'scrape'
   ORDER BY j.requested_at DESC LIMIT 1)               AS scrape_last_status,
  (SELECT COUNT(*) FROM public.import_jobs j
   WHERE j.artist_legacy_id = ms.legacy_id
     AND j.status IN ('pending','running'))            AS active_jobs

FROM public.v_artist_migration_status ms;

COMMENT ON VIEW public.v_artist_import_status IS
  'v2 (2026-05-21): wraps v_artist_migration_status v3. scrape_done/wiki_done iš REALIO DB state''o (tracks/albums source), todėl CLI-imported atlikėjai (pvz. Atlanta per import_artist.py) rodomi kaip done be queue trace''o. Job queue kolonos (wiki_completed_at etc.) lieka audit/debug''ui.';

COMMIT;
