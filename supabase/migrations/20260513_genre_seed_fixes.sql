-- ============================================================
-- 2026-05-13 — Substyle seed fixes po quick scrape
-- ============================================================
-- Po python3 quick_artist_stats.py --force paleidimo radom missing-mapping
-- issue: 116 atlikejai turi music.lt substyle "Rock'n'roll" arba
-- "Death'n'roll", bet DB seed (20260425_seed_genres_substyles.sql) saugo
-- juos su escape'inta backslash apostrofu — `Rock\'n\'roll` (literal
-- backslash chars). Lookup pagal lower(name) nematch'ina, todel substyle
-- assignment skip'inami.
--
-- "Pop muzika" main genre (2574 atlikejai music.lt'e jį turi, bet DB turi
-- tik "Pop, R&B muzika") NEPRIDEDAM kaip atskiro genre — Edvardas (2026-05-13)
-- nusprendė palikti DB taxonomy su 8 main genres ir alias'inti music.lt
-- "Pop muzika" → "Pop, R&B muzika" scriptam side. Žr. quick_artist_stats.py
-- GENRE_ALIASES dict.
--
-- Po migracijos paleisti retry: python3 scraper/quick_artist_stats.py --force
-- (be --overwrite — saugu, junctions ON CONFLICT DO NOTHING).
-- ============================================================

-- Cleanup substyle backslash escapes (paveikti tik 2 row'ai: id 1018, 1042)
UPDATE public.substyles
SET name = REPLACE(name, '\', '')
WHERE name LIKE '%\\%';

-- 3. Verify (neturi return'inti backslash):
-- SELECT id, name FROM substyles WHERE name LIKE '%\\%';
-- SELECT id, name FROM genres WHERE name = 'Pop muzika';
