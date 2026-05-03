-- ============================================================
-- Stiliai (žanrai) cover image — admin'as gali sukelti realų
-- vizualą kiekvienam main žanrui (gitara prie roko, mikrofonas
-- prie hip-hop ir t.t.). Naudojama nav dropdown'e + zanro page'e.
-- ============================================================

ALTER TABLE public.genres
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

-- Optional: jei nori, gali iškart pridėti default'ines URL'us
-- (Edvardas užmes per /admin/genres page'ą).

COMMENT ON COLUMN public.genres.cover_image_url IS
  'Stoko vizualas main žanrui — naudojamas nav Stiliai sekcijoje
   ir individual žanro page'e. Admin'as nustato per /admin/genres.';
