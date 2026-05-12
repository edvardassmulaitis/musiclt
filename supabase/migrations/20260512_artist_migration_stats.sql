-- ============================================================
-- 2026-05-12 — Artist migration progress dashboard support
-- ============================================================
-- Goal: admin dashboard'e (single place) matyti kiek atlikėjų jau
-- "sutvarkyta" (LT: scrape ✓; INTL: wiki ✓ + scrape ✓), kiek dar laukia,
-- ir prioritetinį sąrašą (sortinama pagal music.lt likes desc).
--
-- 2 dalys:
--   1. Naujas stulpelis `legacy_likes` ant artists — preview likes count
--      iš artist page'o `favorite_5_count{ID}_main` label'io. Naudojamas
--      PRIORITETIZAVIMUI prieš paleidžiant pilną scrape (kuris tik
--      pripildo `public.likes` lentelę su user-level rows).
--      `legacy_comments` — `Komentarai (N)` label, taip pat preview.
--      `legacy_stats_at` — kada paskutinį kartą refresh'inta.
--      Šie stulpeliai NEatkartoja 2026-04-27 dropinto `legacy_like_count`
--      cache'o — anas buvo "stale cache" nuo `likes` table; čia
--      "BEFORE-scrape preview" kai `likes` lentelėje dar tuščia.
--
--   2. View `v_artist_migration_status` — vienas join'as kuris perskaičiuoja
--      ar atlikėjas turi nors vieną LT-scraped track/album, ar nors vieną
--      Wiki-imported track/album. Po to admin API gali tiesiog SELECT'inti
--      su filter'iais.
-- ============================================================

ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS legacy_likes INTEGER,
  ADD COLUMN IF NOT EXISTS legacy_comments INTEGER,
  ADD COLUMN IF NOT EXISTS legacy_stats_at TIMESTAMPTZ;

COMMENT ON COLUMN public.artists.legacy_likes IS
  'Preview likes count iš music.lt artist page label (favorite_5_count{ID}_main). Pripildoma scraper/quick_artist_stats.py. Tikslas — prioritetizuoti migracija prieš paleidžiant pilną scrape (kuris populates public.likes su user-level rows). NĖRA stale cache kaip dropintas legacy_like_count — čia preview, kuris tinka tol, kol public.likes dar tuščia.';

COMMENT ON COLUMN public.artists.legacy_comments IS
  'Preview komentarų skaičius iš music.lt artist page (Komentarai (N) label).';

COMMENT ON COLUMN public.artists.legacy_stats_at IS
  'Paskutinis quick_artist_stats.py paleidimas atlikėjui. NULL = niekada nescan'inta.';

CREATE INDEX IF NOT EXISTS idx_artists_legacy_likes
  ON public.artists (legacy_likes DESC NULLS LAST);

-- ============================================================
-- View: v_artist_migration_status
-- ============================================================
-- Vienas SELECT iš šios view grąžina kiekvieno atlikėjo:
--   - is_lt: ar atlikėjas LT (country='Lietuva' arba NULL — default LT per lib/scoring.ts logic)
--   - scrape_done: ar bent vienas track ARBA album turi source LIKE '%legacy%'
--   - wiki_done:   ar bent vienas track ARBA album turi source LIKE '%wiki%' ARBA artists.source LIKE '%wiki%'
--   - is_done:     LT → scrape_done; INTL → scrape_done AND wiki_done
--
-- LATERAL bool_or aggregation'as efektyvus ant 12k atlikėjų + tracks/albums.
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
  -- LT detection: country='Lietuva' arba NULL (lib/scoring.ts kongruencija)
  (COALESCE(a.country, 'Lietuva') = 'Lietuva') AS is_lt,
  -- scrape_done: bent vienas legacy entity (track ar album)
  (COALESCE(t.has_legacy_track, false) OR COALESCE(al.has_legacy_album, false)) AS scrape_done,
  -- wiki_done: bent vienas wiki entity (track/album) ARBA artists.source rodo wiki
  (COALESCE(t.has_wiki_track, false) OR COALESCE(al.has_wiki_album, false)
    OR a.source LIKE '%wiki%') AS wiki_done
FROM public.artists a
LEFT JOIN track_stats t ON t.artist_id = a.id
LEFT JOIN album_stats al ON al.artist_id = a.id;

COMMENT ON VIEW public.v_artist_migration_status IS
  'Per-artist migration progress: scrape_done + wiki_done flags + counts. Naudojama /admin/api/migration/stats. Refresh'as nereikalingas — tai non-materialized view, kiekvienas SELECT iš naujo skaičiuoja.';

-- RLS: pasitikim, kad endpoint'as eis per service role / admin auth check'ą
-- API route'e (visi /admin/api/* už NextAuth admin role gate'o), tad viewui
-- netaikom GRANT — service role apeina RLS.
