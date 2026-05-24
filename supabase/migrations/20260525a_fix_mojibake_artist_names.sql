-- ============================================================
-- 2026-05-25a — fix mojibake on known-broken artist names
-- ============================================================
-- music.lt scraper rasdavo "Blue Öyster Cult" (Ö = c3 96 UTF-8) iš title
-- tag'o, bet pipeline'as kažkur konvertavo jį į "Ć" (Latvian/Polish C
-- su akute), tikriausiai per dvigubai persigautą double-encoding'ą
-- charset deklaracijoms žaidžiant tarp HTML4 ir UTF-8. Probably wiki_url
-- enrichment fetch'ino .htmlentities'ed versiją.
--
-- Iki kol scraper'is bus pataisytas (TODO: tikrinti pipeline gauname
-- mojibake check už track parser'io rezultatų), čia siaurai pataisom
-- žinomus konkrečius atvejus, kad UI nerodytų klaidos.
-- ============================================================

BEGIN;

-- Blue Öyster Cult (legacy_id 3346)
UPDATE public.artists
   SET name = 'Blue Öyster Cult'
 WHERE legacy_id = 3346
   AND name <> 'Blue Öyster Cult';

-- Bendresnis fix'as: jei kažkurio atlikėjo name turi Ć vietoj Ö konkretiems
-- žinomams patterns ("Cyster" / "Cber"), traktojam kaip mojibake. Saugus
-- nes valid lietuviški/lenkiški pavadinimai šio pattern'o neturi.
UPDATE public.artists
   SET name = REPLACE(REPLACE(name, 'Ćyster', 'Öyster'), 'ćyster', 'öyster')
 WHERE name ~ 'Ćyster|ćyster';

COMMIT;
