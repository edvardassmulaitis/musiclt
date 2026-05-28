-- ============================================================
-- 2026-05-28 — Database Size cleanup (PHASE 1: safe, no code changes)
-- ============================================================
-- Diagnozė: DB 0.857/0.5 GB (171% over Free Plan).
-- Top: likes 389MB, comments 123MB, tracks 84MB, blog_posts 52MB.
--
-- ⚠ SVARBU: Supabase SQL Editor PAKUOJA VISKĄ Į VIENĄ TRANSAKCIJĄ. VACUUM
-- negali būti TX'e, tad reikia paleisti 3 atskirais run'ais. Padalinta į
-- blokus žemiau — paleisk po VIENĄ:
--
--   BLOCK 1: schema changes + DELETE pending UGC
--   BLOCK 2: VACUUM FULL kiekvienai lentelei
--   BLOCK 3: ANALYZE + final size check
--
-- Tikimasi po BLOCK 2: -120-180 MB → DB ~680-740 MB.
-- ============================================================


-- ╔══════════════════════════════════════════════════════════╗
-- ║ BLOCK 1 — Paleisk PIRMĄ (DDL + DELETE pending UGC)        ║
-- ║ Copy nuo "-- 1.1" iki "-- END BLOCK 1" ir Run             ║
-- ╚══════════════════════════════════════════════════════════╝

-- 1.1 BEFORE size
SELECT 'Before: ' || (pg_database_size(current_database()) / 1024 / 1024)::text || ' MB' AS db_size;

-- 1.2 likes — DROP unused col
ALTER TABLE public.likes DROP COLUMN IF EXISTS rating;

-- 1.3 comments — DROP 0 references cols
ALTER TABLE public.comments DROP COLUMN IF EXISTS news_id;
ALTER TABLE public.comments DROP COLUMN IF EXISTS event_id;
ALTER TABLE public.comments DROP COLUMN IF EXISTS legacy_parent_legacy_id;

-- 1.4 blog_posts — DROP 0 references cols
ALTER TABLE public.blog_posts DROP COLUMN IF EXISTS embed_html;
ALTER TABLE public.blog_posts DROP COLUMN IF EXISTS meta_description;
ALTER TABLE public.blog_posts DROP COLUMN IF EXISTS meta_title;
ALTER TABLE public.blog_posts DROP COLUMN IF EXISTS og_image_url;

-- 1.5 DROP empty legacy lentelės
DROP TABLE IF EXISTS public.comments_legacy CASCADE;
DROP TABLE IF EXISTS public.news_legacy CASCADE;
DROP TABLE IF EXISTS public.creation_posts_legacy CASCADE;
DROP TABLE IF EXISTS public.shoutbox_messages CASCADE;
DROP TABLE IF EXISTS public.track_lyric_comments CASCADE;

-- 1.6 DELETE pending UGC likes (entity_id IS NULL) — DIDŽIAUSIA WIN ~80-100MB
DELETE FROM public.likes WHERE entity_id IS NULL;

-- END BLOCK 1


-- ╔══════════════════════════════════════════════════════════╗
-- ║ BLOCK 2 — Paleisk ANTRĄ, po BLOCK 1 (VACUUM FULL)          ║
-- ║ ⚠ Trumpam lock'ina lentelę. Paleisk kai mažas traffic.    ║
-- ║                                                            ║
-- ║ Kiekvieną VACUUM gali paleisti atskirai jeigu nori         ║
-- ║ stebėti progresą. Likes didžiausias — ~30 sek.             ║
-- ╚══════════════════════════════════════════════════════════╝

VACUUM FULL public.likes;
VACUUM FULL public.comments;
VACUUM FULL public.tracks;
VACUUM FULL public.blog_posts;

-- END BLOCK 2


-- ╔══════════════════════════════════════════════════════════╗
-- ║ BLOCK 3 — Paleisk TREČIĄ (ANALYZE + final check)           ║
-- ╚══════════════════════════════════════════════════════════╝

ANALYZE public.likes;
ANALYZE public.comments;
ANALYZE public.tracks;
ANALYZE public.blog_posts;

-- Galutinė patikra:
SELECT 'After: ' || (pg_database_size(current_database()) / 1024 / 1024)::text || ' MB' AS db_size;

-- Top 10 didžiausių objektų po cleanup:
SELECT
  schemaname || '.' || relname AS object,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || relname)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname || '.' || relname)) AS table_size
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(schemaname || '.' || relname) DESC
LIMIT 10;

-- END BLOCK 3
