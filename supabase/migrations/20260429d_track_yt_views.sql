-- ============================================================
-- 2026-04-29 — Track YouTube enrichment + view-count snapshots
-- ============================================================
-- Du tikslai:
--
--  1) Užtikrinti, kad `tracks.youtube_searched_at` ir
--     `tracks.lyrics_searched_at` realiai egzistuoja DB lygyje.
--     Iki šiol jie naudojami `WikipediaImportDiscography.tsx` PATCH'uose,
--     bet migracijos kūrimo nebuvo — tikriausiai pridėta per Supabase
--     dashboard'ą. `IF NOT EXISTS` daro idempotent.
--
--  2) Pridėti pirmą versiją „YouTube views" snapshot'ų — tiek dabartinę
--     reikšmę ant `tracks` (lengvas display + sort), tiek append-only
--     istoriją `track_video_views_history`, kad galėtume po metų vėl
--     paleisti enrichment'ą ir matyti trend'us (Δ views per laikotarpį).
--
-- Snapshot strategija:
--   * `video_views`           — naujausia žinoma reikšmė (BIGINT, exact)
--   * `video_views_checked_at` — kada paskutinį kartą tikrinta
--   * `track_video_views_history` — kiekvienas successful tikrinimas
--     įrašomas atskiroje eilutėje, kad turėtume time-series
--
-- Apvalinimas: BIGINT laikom tikslų skaičių iš InnerTube /player
-- `videoDetails.viewCount` (tiksli reikšmė), ne search'o `1.2M views`
-- aproksimaciją — kad trend'ai būtų reprezentatyvūs.

ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS youtube_searched_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lyrics_searched_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS video_views             BIGINT,
  ADD COLUMN IF NOT EXISTS video_views_checked_at  TIMESTAMPTZ;

-- Append-only istorija. Saugom kiekvieną snapshot atskirai —
-- vienas track gali turėti N įrašų (po vieną per enrichment run'ą).
CREATE TABLE IF NOT EXISTS public.track_video_views_history (
  id          BIGSERIAL PRIMARY KEY,
  track_id    INTEGER NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  video_id    TEXT,                          -- denormalizuotas YouTube videoId tos snapshot'os metu
  views       BIGINT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pagrindinė užklausa: „duok visus snapshot'us šiam track'ui chronologiškai"
CREATE INDEX IF NOT EXISTS track_video_views_history_track_id_idx
  ON public.track_video_views_history (track_id, captured_at DESC);

-- Trend report'ams (visi snapshot'ai laikotarpyje)
CREATE INDEX IF NOT EXISTS track_video_views_history_captured_at_idx
  ON public.track_video_views_history (captured_at DESC);

-- RLS — tik service-role rašo, public read leidžiamas (jei reikės
-- frontend'e rodyti trend graph'us anonimams).
ALTER TABLE public.track_video_views_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "track_video_views_history_select" ON public.track_video_views_history;
CREATE POLICY "track_video_views_history_select"
  ON public.track_video_views_history
  FOR SELECT USING (true);

-- INSERT/UPDATE/DELETE — tik service role (default deny anon/authenticated).
