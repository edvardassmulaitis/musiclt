-- ============================================================
-- 2026-05-13 — Genre/substyle seed fixes po quick scrape
-- ============================================================
-- Po python3 quick_artist_stats.py --force --overwrite paleidimo radom
-- du missing-mapping issues:
--
-- 1. 116 atlikejai turi music.lt substyle "Rock'n'roll" arba "Death'n'roll",
--    bet DB seed (20260425_seed_genres_substyles.sql) saugo juos su escape'inta
--    backslash apostrofu — `Rock\'n\'roll` (literal backslash chars). Lookup
--    pagal `lower(name)` nematch'ina, todel substyle assignment skip'inami.
--
-- 2. 2574 atlikejai turi music.lt main genre "Pop muzika", bet DB turi tik
--    "Pop, R&B muzika". Music.lt'as taksonomiskai atskiria abu — pridedam
--    "Pop muzika" kaip 9-tą main genre.
--
-- Po migracijos paleisti retry — quick_artist_stats su tais paciais
-- atlikejais, kurie turi unknown genre/substyle. Lengviausiai per:
--   python3 scraper/quick_artist_stats.py --force --overwrite
-- (paleidžia visus, ant jau-success'inu greitai praeina nes 0 patches).
-- ============================================================

-- 1. Cleanup substyle backslash escapes
UPDATE public.substyles
SET name = REPLACE(name, '\', '')
WHERE name LIKE '%\\%';

-- 2. Pridėti "Pop muzika" main genre (jei dar neegzistuoja).
-- Naudojam WHERE NOT EXISTS, kad nepriklausytume nuo unique constraint'o
-- ant `name` (kuris seed'e nebuvo deklaruotas).
INSERT INTO public.genres (name)
SELECT 'Pop muzika'
WHERE NOT EXISTS (SELECT 1 FROM public.genres WHERE name = 'Pop muzika');

-- 3. Verify (neturi return'inti backslash):
-- SELECT id, name FROM substyles WHERE name LIKE '%\\%';
-- SELECT id, name FROM genres WHERE name = 'Pop muzika';
