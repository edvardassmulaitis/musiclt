-- artist_photos.place — kur nuotrauka padaryta (optional). Pvz., 'London',
-- 'Roundhouse', 'Apple Music Festival 2016 / Roundhouse, London'.
-- Naudosim filter'avimui (visi koncertai mieste X) + metaduomenų display.

ALTER TABLE public.artist_photos
  ADD COLUMN IF NOT EXISTS place text;

COMMENT ON COLUMN public.artist_photos.place IS
  'Optional vieta kur nuotrauka padaryta — venue arba miestas. Free-text.';
