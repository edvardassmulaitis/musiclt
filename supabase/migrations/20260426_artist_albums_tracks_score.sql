-- ============================================================
-- 2026-04-26 — Wiki import praplėtimas: instruments/roles + per-album/track score
-- ============================================================
-- Tikslas: kad wiki_worker galėtų visiškai užpildyti pasiekimus per visus
-- entity tipus (artist, album, track), ir kad būtų galima skor'inti viską.

-- ── ARTISTS: instruments + roles ─────────────────────────────
ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS instruments TEXT[],
  ADD COLUMN IF NOT EXISTS roles TEXT[];

COMMENT ON COLUMN public.artists.instruments IS
  'Instrumentai (piano, guitar, drums) iš Wikidata P1303. Tik solo artists.';
COMMENT ON COLUMN public.artists.roles IS
  'Užsiėmimai (singer, songwriter, producer) iš Wikidata P106. Tik solo artists.';

-- ── ALBUMS: score + scoring breakdown ─────────────────────────
ALTER TABLE public.albums
  ADD COLUMN IF NOT EXISTS score INTEGER,
  ADD COLUMN IF NOT EXISTS score_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS score_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_albums_score
  ON public.albums (score DESC NULLS LAST);

-- ── TRACKS: score + chart + certifications ────────────────────
ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS score INTEGER,
  ADD COLUMN IF NOT EXISTS score_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS score_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS peak_chart_position INTEGER,
  ADD COLUMN IF NOT EXISTS certifications JSONB,
  ADD COLUMN IF NOT EXISTS wikidata_id TEXT,
  ADD COLUMN IF NOT EXISTS wiki_url TEXT;

CREATE INDEX IF NOT EXISTS idx_tracks_score
  ON public.tracks (score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_tracks_peak
  ON public.tracks (peak_chart_position) WHERE peak_chart_position IS NOT NULL;

-- ── ALBUMS: extra Wiki-extractable fields ────────────────────
ALTER TABLE public.albums
  ADD COLUMN IF NOT EXISTS wikidata_id TEXT,
  ADD COLUMN IF NOT EXISTS wiki_url TEXT,
  ADD COLUMN IF NOT EXISTS track_count INTEGER;

COMMENT ON COLUMN public.albums.track_count IS
  'Iš Wiki tracklist parsing. Pildomas wiki import metu.';
