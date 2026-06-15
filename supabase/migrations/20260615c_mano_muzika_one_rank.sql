-- ============================================================
-- 2026-06-15c — „Mano muzika": vienas rikiuojamas sąrašas (bucket=1)
-- ============================================================
-- Atsisakom atskiro Topas(1)/Mėgstami(2) skirstymo. Lieka VIENAS rikiuojamas
-- „Mėgstami" sąrašas (bucket=1); pirmi 20 (sort_order < 20) rodomi profilyje.
-- Sujungiam bucket 2 → 1 perskaičiuodami sort_order (Topas pirma, tada Mėgstami).
-- ============================================================

BEGIN;

WITH r AS (
  SELECT user_id, artist_id,
         row_number() OVER (PARTITION BY user_id ORDER BY bucket, sort_order) - 1 AS rn
  FROM public.profile_favorite_artists WHERE bucket IN (1, 2)
)
UPDATE public.profile_favorite_artists p
   SET bucket = 1, sort_order = r.rn
  FROM r WHERE p.user_id = r.user_id AND p.artist_id = r.artist_id;

WITH r AS (
  SELECT user_id, album_id,
         row_number() OVER (PARTITION BY user_id ORDER BY bucket, sort_order) - 1 AS rn
  FROM public.profile_favorite_albums WHERE bucket IN (1, 2)
)
UPDATE public.profile_favorite_albums p
   SET bucket = 1, sort_order = r.rn
  FROM r WHERE p.user_id = r.user_id AND p.album_id = r.album_id;

WITH r AS (
  SELECT user_id, track_id,
         row_number() OVER (PARTITION BY user_id ORDER BY bucket, sort_order) - 1 AS rn
  FROM public.profile_favorite_tracks WHERE bucket IN (1, 2)
)
UPDATE public.profile_favorite_tracks p
   SET bucket = 1, sort_order = r.rn
  FROM r WHERE p.user_id = r.user_id AND p.track_id = r.track_id;

COMMIT;
