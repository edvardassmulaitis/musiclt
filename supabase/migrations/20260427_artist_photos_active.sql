-- ============================================================
-- 2026-04-27 — artist_photos.is_active flag
-- ============================================================
-- Music.lt scrape importuoja visas atlikėjo nuotraukas su is_active=false.
-- UI public page rodo TIK is_active=true. Admin gali pažymėti per /admin/artists/[id].
-- ============================================================

ALTER TABLE public.artist_photos
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.artist_photos.is_active IS
  'Ar nuotrauka rodoma viešoje sąsajoje. Default true existing photos. Music.lt scrape importuoja false (admin patvirtina).';

-- Tracks: featuring artists junction
-- track_artists junction lentelė jau yra (track_id, artist_id, is_primary)
-- Music.lt scrape gali pridėti feat artistus kaip is_primary=false rows.
-- (Schema'oje track_artists jau yra — patikriname constraint'ą).

CREATE INDEX IF NOT EXISTS idx_artist_photos_active
  ON public.artist_photos (artist_id, is_active, sort_order);
