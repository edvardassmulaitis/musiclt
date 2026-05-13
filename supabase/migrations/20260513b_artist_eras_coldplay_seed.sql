-- Coldplay seed eras — based on EN Wikipedia article career sections.
--
-- Wikipedia structure (https://en.wikipedia.org/wiki/Coldplay#History):
--   1996–1999: Formation and early years
--   2000–2002: Parachutes and breakthrough
--   2002–2005: A Rush of Blood to the Head and X&Y
--   2008–2010: Viva la Vida or Death and All His Friends
--   2011–2014: Mylo Xyloto and Ghost Stories
--   2015–2019: A Head Full of Dreams and Everyday Life
--   2019–:     Music of the Spheres and Moon Music
--
-- Adapted to LT with shorter friendly titles. This is a manual seed —
-- a generic wiki extractor (Push 3c) will eventually produce similar
-- rows for any artist with structured wiki history sections.
--
-- sort_order convention: 0 = newest era at top.

-- Subtitle column intentionally NULL — per user feedback 2026-05-13, the
-- „— extra description" dash phrase made the era box header too wide on
-- mobile and duplicated info already present in the description body.
INSERT INTO artist_eras (artist_id, sort_order, title, year_start, year_end, description, source)
VALUES
  (245, 0, 'Eksperimentai', 2019, NULL, 'Žanro pasikeitimas su „Everyday Life" ir „Music of the Spheres" — kino-stilistikos albumai, daug pasaulio kolaboracijų.', 'manual'),
  (245, 1, 'Stadium pop',   2008, 2018, 'Coldplay tampa vieni didžiausių pasaulio stadium grupių. „Viva la Vida", „Mylo Xyloto" ir „A Head Full of Dreams" — masinė publika.',            'manual'),
  (245, 2, 'Klasika',       2000, 2007, '„Parachutes" ir „A Rush of Blood to the Head" — du albumai, kurie užtvirtino grupę ir davė pasauliui „Yellow", „The Scientist", „Clocks".',     'manual'),
  (245, 3, 'Pradžia',       1996, 1999, 'Pradiniai EP albumai studento metais. Grupė formuoja sudėtį ir braižo savo stilių prieš pirmąjį didelį pasaulinį pripažinimą.',                'manual')
ON CONFLICT DO NOTHING;

-- Safety net: if a previous run inserted subtitle values, clear them.
UPDATE artist_eras SET subtitle = NULL
 WHERE artist_id = 245 AND subtitle IS NOT NULL;
