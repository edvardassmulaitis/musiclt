-- ============================================================
-- 2026-05-12 (v2) — Migration status view fix: 3 buckets
-- ============================================================
-- Problema su v1 (20260512_artist_migration_stats.sql):
--   is_lt = COALESCE(country, 'Lietuva') = 'Lietuva'
--   → ALL atlikejai be country (NULL) buvo klasifikuoti kaip LT,
--     todel /admin dashboard rodydavo LT bucket = 11884 (nereali)
--     ir INTL bucket = 248 (per maza).
--
-- Edvardo intent'as (2026-05-12): "LT atlikejai - tie, kuriu salis
-- lietuva ir kuriems praleistas scrape is senos sistemos". Taigi
-- LT = explicit country='Lietuva', NE NULL.
--
-- v2 sukuria 3 atskiras buckets:
--   is_lt      = country = 'Lietuva' (explicit)
--   is_intl    = country IS NOT NULL AND country != 'Lietuva'
--   is_unknown = country IS NULL  (nezinom kol nepatvirtinom — neaiskus
--                bucket'as treat'inamas kaip "to-do").
--
-- Done kriterijai:
--   LT      done = scrape_done
--   INTL    done = scrape_done AND wiki_done
--   Unknown done = scrape_done AND wiki_done (konservatyvus, nes nezinom country)
-- ============================================================

DROP VIEW IF EXISTS public.v_artist_migration_status CASCADE;

CREATE VIEW public.v_artist_migration_status AS
WITH track_stats AS (
  SELECT artist_id,
         bool_or(source LIKE '%legacy%')   AS has_legacy_track,
         bool_or(source LIKE '%wiki%')     AS has_wiki_track,
         COUNT(*)                          AS track_count
  FROM public.tracks
  WHERE artist_id IS NOT NULL
  GROUP BY artist_id
),
album_stats AS (
  SELECT artist_id,
         bool_or(source LIKE '%legacy%')   AS has_legacy_album,
         bool_or(source LIKE '%wiki%')     AS has_wiki_album,
         COUNT(*)                          AS album_count
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
  COALESCE(t.track_count, 0) AS track_count,
  COALESCE(al.album_count, 0) AS album_count,

  -- 3 atskiri buckets — exactly one TRUE per row
  (a.country = 'Lietuva')                                    AS is_lt,
  (a.country IS NOT NULL AND a.country != 'Lietuva')         AS is_intl,
  (a.country IS NULL)                                        AS is_unknown,

  -- scrape_done: bent vienas legacy entity
  (COALESCE(t.has_legacy_track, false) OR COALESCE(al.has_legacy_album, false)) AS scrape_done,

  -- wiki_done: bent vienas wiki entity ARBA artists.source rodo wiki
  (COALESCE(t.has_wiki_track, false) OR COALESCE(al.has_wiki_album, false)
    OR a.source LIKE '%wiki%') AS wiki_done,

  -- Lower-cased name dedupe key — UI gali grupuoti dup'us pagal si lauka
  lower(trim(a.name)) AS dedup_key
FROM public.artists a
LEFT JOIN track_stats t ON t.artist_id = a.id
LEFT JOIN album_stats al ON al.artist_id = a.id;

COMMENT ON VIEW public.v_artist_migration_status IS
  '3-bucket per-artist migration progress (LT / INTL / Unknown). Naudojama /admin/api/migration/stats. Refresh nereikalingas — non-materialized view, kiekvienas SELECT is naujo skaiciuoja.';
