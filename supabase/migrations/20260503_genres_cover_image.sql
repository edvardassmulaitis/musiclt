-- ============================================================
-- Stiliai (zanrai) cover image — admin'as gali sukelti reala
-- vizuala kiekvienam main zanrui (gitara prie roko, mikrofonas
-- prie hip-hop ir t.t.). Naudojama nav dropdowne + zanro page.
-- ============================================================

ALTER TABLE public.genres
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

COMMENT ON COLUMN public.genres.cover_image_url IS
  'Stoko vizualas main zanrui (Rokui, Hip-hopui ir t.t.) - naudojamas nav Stiliai sekcijoje ir individual zanro page. Admin nustato per /admin/genres.';
