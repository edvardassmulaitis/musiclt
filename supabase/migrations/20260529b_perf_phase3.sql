-- ============================================================
-- 2026-05-29b — Perf Phase 3: index dedupe + VACUUM FULL + ANALYZE
-- ============================================================
--
-- Tikslas: nuo 562 MB → 530 MB (-32 MB, ~6% savings) per cleanup'ą
-- redundantiškų index'ų ir VACUUM FULL'inant likes/tracks.
--
-- Applied 2026-05-29 per SQL Editor (live, ne migration history).
-- Šitas faile fiksuojam done work'us audit trail'ui — jei DB
-- atstatoma iš zero, šitas reikia parlieti.
--
-- ⚠️ VACUUM FULL'ai negali būti TX'e, todėl COMMIT'as prieš juos.

BEGIN;

-- ============================================================
-- 1. Drop redundant duplicate index on likes
-- ============================================================
-- likes_entity_user_idx ir likes_unique_username cover'ina identiškus
-- stulpelius (entity_type, entity_id, user_username). Unique versija
-- pati savaime serve'ina ir lookup'ą — non-unique kopija yra waste.
-- Savings: 24 MB index space.

DROP INDEX IF EXISTS public.likes_entity_user_idx;

-- ============================================================
-- 2. Drop dead index on track_video_views_history
-- ============================================================
-- idx_scan = 0 nuo paskutinio stats reset'o. Šis stulpelis (captured_at)
-- niekur query planner'io nebuvo pasirinktas. App code'as filter'ina
-- per track_id, ne per captured_at.
-- Savings: 1.2 MB.

DROP INDEX IF EXISTS public.track_video_views_history_captured_at_idx;

COMMIT;

-- ============================================================
-- 3. VACUUM FULL hot tables (negali būti TX'e)
-- ============================================================
-- Po Phase 1 + Phase 2 column drop'ų lieka physical bloat — reclaim'inam.
-- Estimated savings: ~10-15 MB.

VACUUM FULL public.likes;
VACUUM FULL public.tracks;

-- ============================================================
-- 4. ANALYZE — refresh planner statistics
-- ============================================================
-- Po VACUUM FULL pg_statistic gali būti stale. Run ANALYZE
-- kad query planner pasirinktų teisingus path'us.

ANALYZE public.likes;
ANALYZE public.tracks;
ANALYZE public.comments;
ANALYZE public.albums;
ANALYZE public.artists;
ANALYZE public.blog_posts;
ANALYZE public.discussions;
ANALYZE public.entity_comments;
ANALYZE public.profiles;
ANALYZE public.events;
ANALYZE public.album_tracks;
ANALYZE public.news_candidates;

-- ============================================================
-- POST-MIGRATION VERIFICATION (manual run):
-- ============================================================
-- SELECT pg_size_pretty(pg_database_size(current_database()));
--    → expected ~530 MB (nuo 562 MB)
--
-- SELECT * FROM db_dead_indexes();
--    → expected 4 trgm indexes (search, palieka observation'ui)
--
-- SELECT * FROM db_table_bloat() WHERE bloat_pct > 20;
--    → expected empty (po VACUUM FULL)
--
-- ============================================================
-- ARCHITECTURAL CONTEXT (kodėl per Phase 3):
-- ============================================================
-- Phase 1 (20260528_db_size_cleanup.sql): bloat cleanup, 857 → 644 MB
-- Phase 2 (20260528c_architectural_slim_down.sql): denormalized
--   column drop iš likes/comments/event_attendees + profile JOIN
-- Phase 3 (šis failas): index dedupe + final VACUUM/ANALYZE
--
-- Total cumulative: 857 MB → 530 MB (-327 MB, 38% reduction)
-- Pro plan 8 GB: 6.5% utilizacija. Headroom: ~7.5 GB.
