-- ============================================================
-- 2026-06-29 — artist_rank: pridedam 'country_genre' scope
-- ============================================================
--
-- Tikslas: atlikėjo puslapyje sujungti vėliavą + pagrindinį stilių +
-- #vietą į VIENĄ pill'ą. #vieta turi būti skaičiuojama TOJE šalyje IR
-- TO stiliaus (ne šalis atskirai, stilius atskirai).
--
-- Pridedam naują UNION ALL bloką, kuris rikiuoja atlikėją tarp tos pačios
-- šalies + to paties PIRMINIO žanro (genres[0] = MIN(genre_id)) atlikėjų.
-- Likę scope'ai (country / genre / global) nepaliesti — naudojami kitur.

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

  -- Country + genre rank — vieta TOJE šalyje IR TO (pirminio) stiliaus.
  -- Peers = atlikėjai su tuo pačiu pirminiu žanru IR ta pačia šalimi.
  SELECT
    g.name::text                                              AS category,
    (COUNT(*) FILTER (WHERE a.score > p_score) + 1)::int      AS rank,
    GREATEST(COUNT(*) FILTER (WHERE a.score > 0), 1)::int     AS total,
    'country_genre'::text                                     AS scope
  FROM public.artist_genres ag_target
  JOIN public.genres g ON g.id = ag_target.genre_id
  JOIN public.artist_genres ag_peer ON ag_peer.genre_id = ag_target.genre_id
  JOIN public.artists a ON a.id = ag_peer.artist_id
  WHERE p_country IS NOT NULL
    AND a.country = p_country
    AND a.score > 0
    AND ag_target.artist_id = p_artist_id
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

REVOKE ALL ON FUNCTION public.artist_rank(INT, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.artist_rank(INT, NUMERIC, TEXT) TO anon, authenticated, service_role;

COMMIT;
