-- ============================================================
-- 2026-05-28 — DB Size cleanup PHASE 2
-- ============================================================
-- Po Phase 1 (commit 5dba236): DB ~857 → ~700 MB
--
-- Phase 2 cleanup (be code refactor'io):
--   - ugc_pending_links: 96,750 unresolved (99.99%) — 0 code refs app/lib;
--     pure scraper queue, fresh entries kuriasi per artist re-scrape'ą
--   - track_video_views_history: prune old, keep last 3 per track
--
-- Tikimasi: -30-35 MB.
--
-- ⚠ Paleisti BLOCK po BLOCK (žr. Phase 1 — VACUUM negali būti TX'e)
-- ============================================================


-- ╔══════════════════════════════════════════════════════════╗
-- ║ BLOCK 1 — Paleisk PIRMĄ (cleanup queries)                  ║
-- ╚══════════════════════════════════════════════════════════╝

-- BEFORE
SELECT 'Before Phase 2: ' || (pg_database_size(current_database()) / 1024 / 1024)::text || ' MB' AS db_size;

-- 1. Delete unresolved ugc_pending_links
-- Šios eilutės yra placeholder'iai laukiantys entity import'o (per scraper);
-- po per-artist re-scrape'o fresh entries sukuriasi su tinkamais entity ID'ais.
-- 96,750 rows × ~290 bytes = ~27 MB win.
DELETE FROM public.ugc_pending_links WHERE resolved_at IS NULL;

-- 2. Prune track_video_views_history — keep only last 3 per track
-- Šiandien 47k rows; per track vidutiniškai 4.5 (kelios dienų snapshot'ai).
-- 3 paskutiniai pakanka trend rodyti UI'e (admin/tracks/[id]/stats).
DELETE FROM public.track_video_views_history
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY track_id ORDER BY captured_at DESC) AS rn
    FROM public.track_video_views_history
  ) ranked
  WHERE rn > 3
);

-- END BLOCK 1


-- ╔══════════════════════════════════════════════════════════╗
-- ║ BLOCK 2 — Paleisk ANTRĄ (VACUUM FULL po vieną!)            ║
-- ║ ⚠ Jeigu Supabase'as wrap'ina TX'e, paleisk po VIENĄ:       ║
-- ║                                                            ║
-- ║   VACUUM FULL public.ugc_pending_links;       ← Run        ║
-- ║   VACUUM FULL public.track_video_views_history; ← Run      ║
-- ║   VACUUM FULL public.likes;                   ← Run        ║
-- ║                                                            ║
-- ║ (likes VACUUM dėl naujų DELETE/UPDATE bloat'o po Phase 1)  ║
-- ╚══════════════════════════════════════════════════════════╝

VACUUM FULL public.ugc_pending_links;
VACUUM FULL public.track_video_views_history;
VACUUM FULL public.likes;

-- END BLOCK 2


-- ╔══════════════════════════════════════════════════════════╗
-- ║ BLOCK 3 — Paleisk TREČIĄ (ANALYZE + check)                 ║
-- ╚══════════════════════════════════════════════════════════╝

ANALYZE public.ugc_pending_links;
ANALYZE public.track_video_views_history;
ANALYZE public.likes;

SELECT 'After Phase 2: ' || (pg_database_size(current_database()) / 1024 / 1024)::text || ' MB' AS db_size;

-- Top 10 didžiausių objektų:
SELECT
  schemaname || '.' || relname AS object,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || relname)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname || '.' || relname)) AS table_size
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(schemaname || '.' || relname) DESC
LIMIT 10;

-- END BLOCK 3
