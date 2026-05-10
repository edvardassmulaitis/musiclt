-- Pridedam tracks.video_uploaded_at — kada video įkeltas į YouTube.
-- Iš YT Data API `snippet.publishedAt` arba watch page'o JSON-LD `uploadDate`.
--
-- Naudojamas:
--   1) LT atlikėjams (kurie dažnai neleidžia oficialių singlų) kaip release
--      date proxy. Plus papildoma signalizacija „Naujos dainos" tab'ui.
--   2) Apskaičiuoti views/day rate'ą (NOW - video_uploaded_at = trukmė per
--      kurią video surinko esamą view skaičių) — fan engagement metric.
--
-- timestamptz, ne date — YT grąžina ISO 8601 su laiku, paliekam tikslumą.
-- DEFAULT NULL — užpildysim per yt-enrich.ts kai run'siunamas.
ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS video_uploaded_at timestamptz;

-- Index'as „Naujos dainos" sort'ui ir charts'ams. Partial — tik kur žinom datą.
CREATE INDEX IF NOT EXISTS tracks_video_uploaded_at_idx
  ON public.tracks(video_uploaded_at DESC)
  WHERE video_uploaded_at IS NOT NULL;
