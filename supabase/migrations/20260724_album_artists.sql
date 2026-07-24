-- ============================================================
-- 2026-07-24 — album ↔ artists junction (bendri / kolaboraciniai albumai)
-- ============================================================
-- Iki šiol albumas turėjo tik VIENĄ savininką (albums.artist_id). Bendri
-- albumai (pvz. „Neriuos" — thelastsunday + Jausmė) negalėjo priklausyti
-- dviem atlikėjams: importuojant kiekvieną atlikėją atskirai buvo sukuriamas
-- DUBLIKATINIS albumas.
--
-- Pridedam junction'ą (mirror'inta nuo news_artists). Backward compat:
-- albums.artist_id lieka — pirminis savininkas; čia išvardijami VISI albumo
-- atlikėjai (įsk. pirminį), kad bendras albumas rodytųsi ABIEJŲ diskografijose.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.album_artists (
  album_id   BIGINT  NOT NULL REFERENCES public.albums(id)  ON DELETE CASCADE,
  artist_id  BIGINT  NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (album_id, artist_id)
);

CREATE INDEX IF NOT EXISTS idx_album_artists_album_id  ON public.album_artists(album_id);
CREATE INDEX IF NOT EXISTS idx_album_artists_artist_id ON public.album_artists(artist_id);
-- Tik 1 primary per album_id (partial unique)
CREATE UNIQUE INDEX IF NOT EXISTS idx_album_artists_one_primary
  ON public.album_artists(album_id) WHERE is_primary = TRUE;

COMMENT ON TABLE public.album_artists IS
  'Junction lentelė albums ↔ artists. Bendri/kolaboraciniai albumai (N atlikėjų). '
  'albums.artist_id = pirminis savininkas; čia išvardijami VISI (įsk. pirminį), '
  'max 1 is_primary=TRUE.';
COMMENT ON COLUMN public.album_artists.is_primary IS
  'Pagrindinis albumo atlikėjas (rodomas pirmas).';
COMMENT ON COLUMN public.album_artists.sort_order IS
  '0-based eiliškumas atlikėjų rodymui — primary visada 0.';

-- Backfill: kiekvienas esamas albumas → jo savininkas kaip primary album_artist.
INSERT INTO public.album_artists (album_id, artist_id, is_primary, sort_order)
SELECT id, artist_id, TRUE, 0 FROM public.albums WHERE artist_id IS NOT NULL
ON CONFLICT DO NOTHING;
