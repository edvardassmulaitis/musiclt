-- ============================================================
-- 2026-05-28 — Database Size cleanup (PHASE 1: safe, no code changes)
-- ============================================================
-- Diagnozė: DB 0.857/0.5 GB (171% over Free Plan).
-- Top: likes 389MB, comments 123MB, tracks 84MB, blog_posts 52MB.
--
-- Cleanup tik tikrai nenaudojamoms kolonoms/lentelėms — patikrinta visa
-- /app, /lib, /components codebase per grep, nieko neneša.
--
-- Tikimasi po VACUUM FULL: ~120-180 MB sutaupymas → DB ~680-740 MB.
-- (Vis dar virš 500MB ribos; tam reikės PHASE 2 — žr. atskirą migraciją.)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- BEFORE — top 10 didžiausių objektų (informacijai logge)
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  total_bytes BIGINT;
BEGIN
  SELECT pg_database_size(current_database()) INTO total_bytes;
  RAISE NOTICE 'Before: DB total = % MB', total_bytes / 1024 / 1024;
END $$;

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. likes — DROP tikrai nenaudojama kolona
-- ─────────────────────────────────────────────────────────────
-- rating: 0 rows have it. App code'e nieko NEinsert'ina (voting_votes.rating
-- yra atskira lentelė). Saugu drop'inti.
ALTER TABLE public.likes DROP COLUMN IF EXISTS rating;

-- (anon_id ir user_agent NEdrop'inami — anon like flow implementuotas
-- /api/artists/[id]/like, /api/albums/[id]/like route'uose.)
-- (user_avatar_url, user_rank — PHASE 2 po refactor'io į user_ghosts JOIN.)

-- ─────────────────────────────────────────────────────────────
-- 2. comments — DROP 0 references kolonas
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.comments DROP COLUMN IF EXISTS news_id;
ALTER TABLE public.comments DROP COLUMN IF EXISTS event_id;
ALTER TABLE public.comments DROP COLUMN IF EXISTS legacy_parent_legacy_id;

-- ─────────────────────────────────────────────────────────────
-- 3. blog_posts — DROP 0 references kolonas
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.blog_posts DROP COLUMN IF EXISTS embed_html;
ALTER TABLE public.blog_posts DROP COLUMN IF EXISTS meta_description;
ALTER TABLE public.blog_posts DROP COLUMN IF EXISTS meta_title;
ALTER TABLE public.blog_posts DROP COLUMN IF EXISTS og_image_url;

-- ─────────────────────────────────────────────────────────────
-- 4. DROP empty legacy lentelės
-- ─────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.comments_legacy CASCADE;
DROP TABLE IF EXISTS public.news_legacy CASCADE;
DROP TABLE IF EXISTS public.creation_posts_legacy CASCADE;
DROP TABLE IF EXISTS public.shoutbox_messages CASCADE;
DROP TABLE IF EXISTS public.track_lyric_comments CASCADE;

-- ─────────────────────────────────────────────────────────────
-- 5. DELETE pending UGC likes (entity_id IS NULL) — DIDŽIAUSIA WIN
-- ─────────────────────────────────────────────────────────────
-- 203,939 placeholder'ių laukiantys entity import'o. Per scrape_worker
-- fresh likes sukuriamos kai entity import'inamas, todėl placeholder'iai
-- nereikalingi. ~80-100 MB.
DELETE FROM public.likes WHERE entity_id IS NULL;

COMMIT;

-- ============================================================
-- VACUUM FULL — paleisti po BEGIN..COMMIT.
-- (Negali būti transaction'e; trumpam lock'ina lentelę.)
-- ============================================================
VACUUM FULL public.likes;
VACUUM FULL public.comments;
VACUUM FULL public.tracks;
VACUUM FULL public.blog_posts;
ANALYZE public.likes;
ANALYZE public.comments;
ANALYZE public.tracks;
ANALYZE public.blog_posts;

-- ─────────────────────────────────────────────────────────────
-- AFTER — patikrinti rezultatą
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  total_bytes BIGINT;
BEGIN
  SELECT pg_database_size(current_database()) INTO total_bytes;
  RAISE NOTICE 'After: DB total = % MB', total_bytes / 1024 / 1024;
END $$;
