-- ============================================================
-- 2026-05-21d — v_user_migration_status view
-- ============================================================
-- Naudojamas /admin/users-migration dashboard'e: kiekvienam ghost user'iui
-- per-faze counter'iai, kad būtų matomi „kiek dar liko migruoti".
--
-- Phase coverage:
--   profile         — visada 1 jei row egzistuoja
--   mood_song       — mood_song_track_id IS NOT NULL
--   diary           — blog_posts su legacy_source='diary'
--   creation        — blog_posts su legacy_source='creation'
--   translate       — blog_posts su legacy_source='translate'
--   topas           — blog_posts su legacy_source='topas'
--   daily_picks     — daily_song_picks
--   friends         — user_friendships
--   comments        — comments su author_id
--   styles          — profile_favorite_styles
--   artists         — profile_favorite_artists
--   likes_resolved  — likes su entity_id NOT NULL (pasimato UI)
--   likes_pending   — likes su entity_id NULL (placeholder'iai laukia importo)
--
-- Legacy expected counts iš profiles meta:
--   liked_artist_count, liked_album_count, liked_track_count — music.lt'o
--   skaičiai (kad žinotum migracijos completeness ratio)
-- ============================================================

BEGIN;

DROP VIEW IF EXISTS public.v_user_migration_status CASCADE;

CREATE VIEW public.v_user_migration_status AS
SELECT
  p.id                              AS profile_id,
  p.username,
  p.full_name,
  p.avatar_url,
  p.is_claimed,
  p.provider,
  p.legacy_user_id,
  p.legacy_karma_points,
  p.legacy_login_count,
  p.legacy_message_count,
  p.joined_legacy_at,
  p.last_seen_legacy_at,
  p.legacy_liked_artist_count,
  p.legacy_liked_album_count,
  p.legacy_liked_track_count,
  (p.mood_song_track_id IS NOT NULL)::INT  AS mood_set,

  -- Blog posts breakdown
  (SELECT COUNT(*) FROM public.blog_posts bp WHERE bp.user_id = p.id AND bp.legacy_source = 'diary')     AS diary_count,
  (SELECT COUNT(*) FROM public.blog_posts bp WHERE bp.user_id = p.id AND bp.legacy_source = 'creation')  AS creation_count,
  (SELECT COUNT(*) FROM public.blog_posts bp WHERE bp.user_id = p.id AND bp.legacy_source = 'translate') AS translate_count,
  (SELECT COUNT(*) FROM public.blog_posts bp WHERE bp.user_id = p.id AND bp.legacy_source = 'topas')     AS topas_count,

  -- Daily picks
  (SELECT COUNT(*) FROM public.daily_song_picks dp WHERE dp.author_id = p.id)                  AS daily_picks_count,
  (SELECT COUNT(*) FROM public.daily_song_picks dp WHERE dp.author_id = p.id AND dp.track_id IS NOT NULL) AS daily_picks_resolved,

  -- Friends
  (SELECT COUNT(*) FROM public.user_friendships uf WHERE uf.profile_id = p.id) AS friends_count,

  -- Comments (kaip author)
  (SELECT COUNT(*) FROM public.comments c WHERE c.author_id = p.id)            AS comments_count,

  -- Favorite styles + artists (already separate tables)
  (SELECT COUNT(*) FROM public.profile_favorite_styles  pfs WHERE pfs.profile_id = p.id) AS styles_count,
  (SELECT COUNT(*) FROM public.profile_favorite_artists pfa WHERE pfa.user_id    = p.id) AS favorite_artists_count,

  -- Likes (split resolved vs pending)
  (SELECT COUNT(*) FROM public.likes l WHERE l.user_username = p.username AND l.entity_type = 'artist' AND l.entity_id IS NOT NULL) AS likes_artist_resolved,
  (SELECT COUNT(*) FROM public.likes l WHERE l.user_username = p.username AND l.entity_type = 'artist' AND l.entity_id IS NULL)     AS likes_artist_pending,
  (SELECT COUNT(*) FROM public.likes l WHERE l.user_username = p.username AND l.entity_type = 'album'  AND l.entity_id IS NOT NULL) AS likes_album_resolved,
  (SELECT COUNT(*) FROM public.likes l WHERE l.user_username = p.username AND l.entity_type = 'album'  AND l.entity_id IS NULL)     AS likes_album_pending,
  (SELECT COUNT(*) FROM public.likes l WHERE l.user_username = p.username AND l.entity_type = 'track'  AND l.entity_id IS NOT NULL) AS likes_track_resolved,
  (SELECT COUNT(*) FROM public.likes l WHERE l.user_username = p.username AND l.entity_type = 'track'  AND l.entity_id IS NULL)     AS likes_track_pending,

  -- Aggregate completeness — kiek fazių paliesta (heuristika)
  (
    (CASE WHEN (SELECT COUNT(*) FROM public.blog_posts bp WHERE bp.user_id = p.id) > 0 THEN 1 ELSE 0 END) +
    (CASE WHEN (SELECT COUNT(*) FROM public.daily_song_picks dp WHERE dp.author_id = p.id) > 0 THEN 1 ELSE 0 END) +
    (CASE WHEN (SELECT COUNT(*) FROM public.user_friendships uf WHERE uf.profile_id = p.id) > 0 THEN 1 ELSE 0 END) +
    (CASE WHEN (SELECT COUNT(*) FROM public.profile_favorite_styles pfs WHERE pfs.profile_id = p.id) > 0 THEN 1 ELSE 0 END) +
    (CASE WHEN (SELECT COUNT(*) FROM public.profile_favorite_artists pfa WHERE pfa.user_id = p.id) > 0 THEN 1 ELSE 0 END) +
    (CASE WHEN (SELECT COUNT(*) FROM public.likes l WHERE l.user_username = p.username) > 0 THEN 1 ELSE 0 END) +
    (CASE WHEN p.mood_song_track_id IS NOT NULL THEN 1 ELSE 0 END)
  )                                                                              AS phases_touched

FROM public.profiles p
WHERE p.legacy_user_id IS NOT NULL
   OR p.provider = 'legacy_forum';

COMMENT ON VIEW public.v_user_migration_status IS
  'Per-user UGC migration counters. Naudojamas /admin/users-migration dashboard''e.';

GRANT SELECT ON public.v_user_migration_status TO service_role, authenticated, anon;

COMMIT;
