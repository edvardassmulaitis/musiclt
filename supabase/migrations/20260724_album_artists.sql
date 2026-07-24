-- ============================================================
-- 2026-07-24 — album ↔ artists junction (bendri / kolaboraciniai albumai)
-- ============================================================
-- Iki šiol albumas turėjo tik VIENĄ savininką (albums.artist_id). Bendri
-- albumai (pvz. „Neriuos" — thelastsunday + Jausmė) negalėjo priklausyti
-- dviem atlikėjams: importuojant kiekvieną atlikėją atskirai buvo sukuriamas
-- DUBLIKATINIS albumas.
--
-- Backward compat: albums.artist_id lieka — pirminis savininkas; čia
-- išvardijami VISI albumo atlikėjai (įsk. pirminį), kad bendras albumas
-- rodytųsi ABIEJŲ diskografijose.
--
-- NB: album_artists lentelė kai kuriose bazėse jau egzistuoja (be reikiamų
-- stulpelių), todėl NAUDOJAM idempotentišką ALTER/ADD COLUMN, o ne CREATE TABLE.
-- ============================================================

-- Sukuriam jei visai nėra (minimalus rėmas — stulpelius užtikrinam žemiau).
CREATE TABLE IF NOT EXISTS public.album_artists (
  album_id  BIGINT NOT NULL REFERENCES public.albums(id)  ON DELETE CASCADE,
  artist_id BIGINT NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE
);

-- Trūkstami stulpeliai (jei lentelė jau buvo be jų).
ALTER TABLE public.album_artists ADD COLUMN IF NOT EXISTS is_primary BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE public.album_artists ADD COLUMN IF NOT EXISTS sort_order SMALLINT    NOT NULL DEFAULT 0;
ALTER TABLE public.album_artists ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Unikalumas (album_id, artist_id) — reikalingas importo upsert onConflict.
CREATE UNIQUE INDEX IF NOT EXISTS uq_album_artists_album_artist ON public.album_artists(album_id, artist_id);
CREATE INDEX IF NOT EXISTS idx_album_artists_album_id  ON public.album_artists(album_id);
CREATE INDEX IF NOT EXISTS idx_album_artists_artist_id ON public.album_artists(artist_id);
-- Tik 1 primary per album_id (partial unique)
CREATE UNIQUE INDEX IF NOT EXISTS idx_album_artists_one_primary
  ON public.album_artists(album_id) WHERE is_primary = TRUE;

COMMENT ON TABLE public.album_artists IS
  'Junction lentelė albums ↔ artists. Bendri/kolaboraciniai albumai (N atlikėjų). '
  'albums.artist_id = pirminis savininkas; čia išvardijami VISI (įsk. pirminį), '
  'max 1 is_primary=TRUE.';

-- Backfill: kiekvienas esamas albumas → jo savininkas kaip primary album_artist.
-- Idempotentiška per NOT EXISTS (nepriklauso nuo unique constraint'o buvimo).
INSERT INTO public.album_artists (album_id, artist_id, is_primary, sort_order)
SELECT a.id, a.artist_id, TRUE, 0
FROM public.albums a
WHERE a.artist_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.album_artists aa
    WHERE aa.album_id = a.id AND aa.artist_id = a.artist_id
  );
