-- Photo capture date.
--
-- Wikimedia file pages include a "Date" / "Date and time of upload" field.
-- We store that as `taken_at` on artist_photos so the gallery can tag each
-- photo with a year (same way albums carry a year badge).
--
-- Nullable — hand-uploaded photos may not have a known date.

ALTER TABLE public.artist_photos
  ADD COLUMN IF NOT EXISTS taken_at DATE;

COMMENT ON COLUMN public.artist_photos.taken_at IS
  'When the photo was taken/captured. Parsed from Wikimedia/Flickr metadata by the scraper or entered in admin.';
