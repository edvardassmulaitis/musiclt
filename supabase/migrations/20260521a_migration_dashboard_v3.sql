-- ============================================================
-- 2026-05-21 — Migration dashboard v3
-- ============================================================
-- Konteksto kontekstas: /admin/migration dashboard'as praleisdavo
-- naujai sutvarkytus atlikėjus (Nirvana, Eminem) — view'as turi tik
-- scrape_done/wiki_done flag'us, bet Edvardas nori bendro state'o
-- per atlikėją: score, foto, lyrics %, YT %, YT views %.
--
-- Šita migracija:
--   1) Pridėda artists.cover_image_width/cover_image_height/
--      cover_image_checked_at — backfill script vėliau HEAD+Pillow
--      probe'ina S3 + music.lt.
--   2) Drop'ina/atkuria v_artist_migration_status su naujom kolonom:
--        - score, score_updated_at, score_done
--        - image_url (aliased iš cover_image_url)
--        - hero_url (aliased iš cover_image_wide_url)
--        - image_width, image_height (aliased iš cover_image_width/height)
--        - image_is_small (dim < 400 OR URL pattern fallback)
--        - hero_done, photo_done
--        - n_lyrics, n_videos, n_video_views_filled
--        - lyrics_pct, yt_pct, yt_views_pct (warning indicators)
--
-- Aliasing rationale: tikri stulpeliai artists lentelėje vadinami
-- cover_image_url / cover_image_wide_url. View output trumpinamas
-- į image_url / hero_url, kad API + UI nereikalautų pakeitimų.
--
-- Threshold (< 400px) — legacy music.lt thumbnail'ai būdavo 150-300px.
-- 400px pagauna visus blogai išdidintus, palieka 480p+ nuotraukas.
--
-- URL pattern fallback: kol cover_image_width dar NULL (backfill nepaleistas),
-- music.lt/legacy URL'ai pažymimi kaip 'small' tiesiog iš URL'o.
-- ============================================================

ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS cover_image_width INT,
  ADD COLUMN IF NOT EXISTS cover_image_height INT,
  ADD COLUMN IF NOT EXISTS cover_image_checked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_artists_cover_image_checked_at
  ON public.artists (cover_image_checked_at NULLS FIRST);

DROP VIEW IF EXISTS public.v_artist_migration_status CASCADE;

CREATE VIEW public.v_artist_migration_status AS
WITH track_stats AS (
  SELECT
    artist_id,
    bool_or(source LIKE '%legacy%')                  AS has_legacy_track,
    bool_or(source LIKE '%wiki%')                    AS has_wiki_track,
    COUNT(*)                                         AS track_count,
    COUNT(*) FILTER (WHERE lyrics IS NOT NULL AND lyrics != '')  AS n_lyrics,
    COUNT(*) FILTER (WHERE video_url IS NOT NULL)    AS n_videos,
    COUNT(*) FILTER (WHERE video_views IS NOT NULL)  AS n_video_views_filled
  FROM public.tracks
  WHERE artist_id IS NOT NULL
  GROUP BY artist_id
),
album_stats AS (
  SELECT
    artist_id,
    bool_or(source LIKE '%legacy%')  AS has_legacy_album,
    bool_or(source LIKE '%wiki%')    AS has_wiki_album,
    COUNT(*)                         AS album_count
  FROM public.albums
  WHERE artist_id IS NOT NULL
  GROUP BY artist_id
)
SELECT
  a.id,
  a.name,
  a.slug,
  a.legacy_id,
  a.country,
  a.source,
  a.legacy_likes,
  a.legacy_comments,
  a.legacy_discussion_count,
  a.legacy_news_count,
  a.legacy_concert_count,
  a.legacy_stats_at,

  -- ── Score state ──
  a.score,
  a.score_updated_at,
  (a.score IS NOT NULL AND a.score_updated_at IS NOT NULL) AS score_done,

  -- ── Photo state (aliased columns — API/UI naudoja image_url/hero_url/etc.) ──
  a.cover_image_url       AS image_url,
  a.cover_image_wide_url  AS hero_url,
  a.cover_image_width     AS image_width,
  a.cover_image_height    AS image_height,
  a.cover_image_checked_at AS image_checked_at,

  -- image_is_small: dimension-based, fallback į URL pattern kai dim NULL
  (
    (a.cover_image_width IS NOT NULL AND a.cover_image_width < 400)
    OR (
      a.cover_image_width IS NULL
      AND a.cover_image_url IS NOT NULL
      AND (
           a.cover_image_url LIKE '%music.lt/%'
        OR a.cover_image_url LIKE '%/legacy/%'
        OR a.cover_image_url LIKE '%/legacy_%'
      )
    )
  ) AS image_is_small,

  -- hero_done: bent kažkokia hero foto yra
  (a.cover_image_wide_url IS NOT NULL) AS hero_done,

  -- photo_done: cover_image_url yra IR NĖRA small/legacy
  (
    a.cover_image_url IS NOT NULL
    AND NOT (
      (a.cover_image_width IS NOT NULL AND a.cover_image_width < 400)
      OR (
        a.cover_image_width IS NULL
        AND (
             a.cover_image_url LIKE '%music.lt/%'
          OR a.cover_image_url LIKE '%/legacy/%'
          OR a.cover_image_url LIKE '%/legacy_%'
        )
      )
    )
  ) AS photo_done,

  -- ── Counts ──
  COALESCE(t.track_count, 0)            AS track_count,
  COALESCE(al.album_count, 0)           AS album_count,
  COALESCE(t.n_lyrics, 0)               AS n_lyrics,
  COALESCE(t.n_videos, 0)               AS n_videos,
  COALESCE(t.n_video_views_filled, 0)   AS n_video_views_filled,

  -- ── Coverage % (warning indicators, NE done blocker) ──
  CASE WHEN COALESCE(t.track_count, 0) > 0
       THEN ROUND(COALESCE(t.n_lyrics, 0)::numeric / t.track_count * 100, 1)
       ELSE 0 END AS lyrics_pct,
  CASE WHEN COALESCE(t.track_count, 0) > 0
       THEN ROUND(COALESCE(t.n_videos, 0)::numeric / t.track_count * 100, 1)
       ELSE 0 END AS yt_pct,
  CASE WHEN COALESCE(t.n_videos, 0) > 0
       THEN ROUND(COALESCE(t.n_video_views_filled, 0)::numeric / t.n_videos * 100, 1)
       ELSE 0 END AS yt_views_pct,

  -- ── 3 atskiri buckets — exactly one TRUE per row ──
  (a.country = 'Lietuva')                                AS is_lt,
  (a.country IS NOT NULL AND a.country != 'Lietuva')     AS is_intl,
  (a.country IS NULL)                                    AS is_unknown,

  -- ── scrape_done: bent vienas legacy entity ──
  (COALESCE(t.has_legacy_track, false) OR COALESCE(al.has_legacy_album, false)) AS scrape_done,

  -- ── wiki_done: bent vienas wiki entity ARBA artists.source rodo wiki ──
  (COALESCE(t.has_wiki_track, false) OR COALESCE(al.has_wiki_album, false)
    OR a.source LIKE '%wiki%') AS wiki_done,

  -- ── Dedupe key ──
  lower(trim(a.name)) AS dedup_key
FROM public.artists a
LEFT JOIN track_stats t  ON t.artist_id = a.id
LEFT JOIN album_stats al ON al.artist_id = a.id;

COMMENT ON VIEW public.v_artist_migration_status IS
  'v3 (2026-05-21): + score state, foto state (image_is_small dim-based + URL fallback), coverage %s. Output aliased: cover_image_url→image_url, cover_image_wide_url→hero_url. score_done/hero_done/photo_done flagai INT done kriterijams. lyrics_pct/yt_pct/yt_views_pct = warning indicators, NE done blocker.';
