-- ============================================================
-- 2026-05-29c — Artist rank RPC (perf: 16 queries → 1)
-- ============================================================
--
-- Tikslas: pakeisti app/atlikejai/[slug]/page.tsx ~lines 790-867
-- multi-query rank logic'ą į VIENĄ SQL su window function'ais.
--
-- Anksčiau:
--   - country rank: 2 count() queries
--   - genre rank: 1+N paginated SELECT + 2*(N/500) count() = 4-14 queries
--   - global rank: 2 count() queries
--   Total: 8-18 queries × ~30ms = 240-540ms
--
-- Po šito RPC: 1 query × ~50ms = 50ms (4-10× pagreitis)

BEGIN;

CREATE OR REPLACE FUNCTION public.artist_rank(
  p_artist_id INT,
  p_score     NUMERIC,
  p_country   TEXT DEFAULT NULL
)
RETURNS TABLE (
  category TEXT,
  rank     INT,
  total    INT,
  scope    TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  -- Country rank
  SELECT
    p_country::text                                 AS category,
    (COUNT(*) FILTER (WHERE score > p_score) + 1)::int AS rank,
    GREATEST(COUNT(*) FILTER (WHERE score > 0), 1)::int AS total,
    'country'::text                                 AS scope
  FROM public.artists
  WHERE p_country IS NOT NULL
    AND country = p_country
    AND score > 0
  HAVING p_country IS NOT NULL

  UNION ALL

  -- Top genre rank — imam tik PIRMĄ artist_genres row'ą per artist_id sort'intą pagal
  -- genre_id (matches app code'o "genres[0]" pasirinkimą).
  SELECT
    g.name::text                                              AS category,
    (COUNT(*) FILTER (WHERE a.score > p_score) + 1)::int      AS rank,
    GREATEST(COUNT(*) FILTER (WHERE a.score > 0), 1)::int     AS total,
    'genre'::text                                             AS scope
  FROM public.artist_genres ag_target
  JOIN public.genres g ON g.id = ag_target.genre_id
  LEFT JOIN public.artist_genres ag_peer ON ag_peer.genre_id = ag_target.genre_id
  LEFT JOIN public.artists a ON a.id = ag_peer.artist_id
  WHERE ag_target.artist_id = p_artist_id
    AND ag_target.genre_id = (
      SELECT MIN(genre_id) FROM public.artist_genres WHERE artist_id = p_artist_id
    )
  GROUP BY g.name

  UNION ALL

  -- Global rank
  SELECT
    'Pasaulyje'::text                                         AS category,
    ((SELECT COUNT(*) FROM public.artists WHERE score > 0)
      - (SELECT COUNT(*) FROM public.artists WHERE score > 0 AND score < p_score)
    )::int                                                    AS rank,
    (SELECT COUNT(*) FROM public.artists WHERE score > 0)::int AS total,
    'global'::text                                            AS scope
  WHERE EXISTS (SELECT 1 FROM public.artists WHERE score > 0)
$$;

-- Permissions — public + service_role read access (rank ne sensitive)
REVOKE ALL ON FUNCTION public.artist_rank(INT, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.artist_rank(INT, NUMERIC, TEXT) TO anon, authenticated, service_role;

COMMIT;

-- ============================================================
-- USAGE:
-- ============================================================
-- SELECT * FROM artist_rank(p_artist_id := 245, p_score := 87.5, p_country := 'GB');
--
-- App side (po refactor'o):
-- const { data } = await sb.rpc('artist_rank', { p_artist_id: id, p_score: score, p_country: country })
--
-- Vienas REST call, sub-50ms vietoj 240-540ms.
