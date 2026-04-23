-- ============================================================================
-- Legacy UI support (2026-04-22)
--
-- 1. Naujas artist laukas `description_legacy` — music.lt bio saugomas atskirai,
--    kad pagrindinis `description` galėtų būti Wiki canonical.
-- 2. top_fans_for_artist() RPC — community panel'iui user-facing atlikėjo page'e.
-- ============================================================================

-- 1. description_legacy column
ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS description_legacy TEXT;

COMMENT ON COLUMN public.artists.description_legacy IS
  'Bio iš music.lt scrape''o (senoji CMS). Atskirta nuo description (Wiki canonical) '
  'kad UI galėtų rodyti toggle''iu arba abu side-by-side.';

-- Jei jau yra esamų artistų su music.lt bio description'e — migruoti į description_legacy
UPDATE public.artists
SET description_legacy = description
WHERE source LIKE 'legacy%'
  AND description_legacy IS NULL
  AND description IS NOT NULL;

-- ============================================================================
-- 2. top_fans_for_artist() — UI helper
-- ============================================================================
CREATE OR REPLACE FUNCTION public.top_fans_for_artist(
  p_legacy_id INT,
  p_limit     INT DEFAULT 10
)
RETURNS TABLE(user_username TEXT, like_count BIGINT, user_rank TEXT)
LANGUAGE sql STABLE AS $$
  WITH artist_albums AS (
    SELECT legacy_id FROM public.albums
    WHERE artist_id = (SELECT id FROM public.artists WHERE legacy_id = p_legacy_id)
      AND legacy_id IS NOT NULL
  ),
  artist_tracks AS (
    SELECT legacy_id FROM public.tracks
    WHERE artist_id = (SELECT id FROM public.artists WHERE legacy_id = p_legacy_id)
      AND legacy_id IS NOT NULL
  )
  SELECT
    l.user_username,
    COUNT(*)::bigint  AS like_count,
    MAX(l.user_rank)  AS user_rank
  FROM public.legacy_likes l
  WHERE (
       (l.entity_type = 'artist' AND l.entity_legacy_id = p_legacy_id)
    OR (l.entity_type = 'album'  AND l.entity_legacy_id IN (SELECT legacy_id FROM artist_albums))
    OR (l.entity_type = 'track'  AND l.entity_legacy_id IN (SELECT legacy_id FROM artist_tracks))
  )
  GROUP BY l.user_username
  ORDER BY COUNT(*) DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION public.top_fans_for_artist IS
  'Grąžina top N user_ghosts, kurie daugiausia mėgo šį atlikėją '
  '(agreguotas likes per artist + jo albumai + jo tracks).';

-- ============================================================================
-- 3. legacy_likes count view (greiti COUNT lookups)
-- ============================================================================
CREATE OR REPLACE VIEW public.v_legacy_likes_by_entity AS
SELECT entity_type, entity_legacy_id, COUNT(*) AS like_count
FROM public.legacy_likes
GROUP BY entity_type, entity_legacy_id;

COMMENT ON VIEW public.v_legacy_likes_by_entity IS
  'Pre-aggreguotas legacy_likes count per entity — UI'||chr(39)||'ui greičiau nei SELECT COUNT.';
