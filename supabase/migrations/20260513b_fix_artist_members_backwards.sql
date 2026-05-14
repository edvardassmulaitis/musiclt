-- ============================================================
-- 2026-05-13 — Cleanup backwards artist_members rows
-- ============================================================
-- Bug'as: kai admin importuoja grupę per Wiki, kartais SPARQL P361
-- (part_of) ar P463 (member_of) grąžina narius kaip "grupes kuriom
-- atlikėjas priklauso" — taip Metallica pateko į artist_members kaip
-- *narys* savo pačios narių grupių (semantinis bug).
--
-- Symptomatic state (Metallica id=58):
--   • teisingi rows: group_id=58, member_id=narys (8 nariai)  ✓
--   • backwards rows: group_id=narys, member_id=58 (6 įrašai)  ✗
--
-- Cleanup logic:
--   Ištrinam tik tas rows, kur group_id atlikėjas yra type='solo' IR
--   egzistuoja inverse row (group_id=teisingas, member_id=šis solo).
--   Du tikrinimai užtikrina, kad ne nutrinsim legitimnių sub-band tipo
--   relations (pvz. supergroup'as, kur abi narystės grupės).
-- ============================================================

-- 1. Diagnostic — kiek paveiktų rows prieš ištrynimą
DO $$
DECLARE
  n INTEGER;
BEGIN
  SELECT count(*) INTO n
  FROM public.artist_members am
  JOIN public.artists g ON g.id = am.group_id
  JOIN public.artists m ON m.id = am.member_id
  WHERE g.type = 'solo'
    AND m.type = 'group'
    AND EXISTS (
      SELECT 1 FROM public.artist_members am2
      WHERE am2.group_id = am.member_id
        AND am2.member_id = am.group_id
    );
  RAISE NOTICE 'Backwards rows to delete: %', n;
END $$;

-- 2. Cleanup
DELETE FROM public.artist_members am
USING public.artists g, public.artists m
WHERE am.group_id = g.id
  AND am.member_id = m.id
  AND g.type = 'solo'   -- klaidingai naudojama solo artist kaip "grupė"
  AND m.type = 'group'  -- ir grupė kaip "narys"
  AND EXISTS (
    SELECT 1 FROM public.artist_members am2
    WHERE am2.group_id = am.member_id
      AND am2.member_id = am.group_id
  );

-- 3. Self-references (atlikėjas pats savo narys) — invalid, ištrinam
DELETE FROM public.artist_members WHERE group_id = member_id;

-- ============================================================
-- 4. Fix klaidingai LT-default'inti members (Magne Furuholmen et al)
-- ============================================================
-- API anksčiau default'indavo `country = 'Lietuva'` visiems naujiems
-- members'iams. Reiškia, kad bet koks INTL grupės narys (pvz Magne
-- Furuholmen iš A-ha) DB tapo "Lietuva" atlikėju.
--
-- Backfill logika: members kur country='Lietuva' IR yra type='solo'
-- IR turi parent grupę su country!='Lietuva' AND IS NOT NULL → paveldi
-- parent country.
--
-- Saugumo riba: NEpaliečiam atlikėjų, kurie turi music.lt'o legacy_id
-- arba source != NULL — tie buvo realiai scrapinti, jų country (jei
-- 'Lietuva') gali būti tikras.
UPDATE public.artists m
SET country = g.country
FROM public.artist_members am
JOIN public.artists g ON g.id = am.group_id
WHERE am.member_id = m.id
  AND m.country = 'Lietuva'
  AND m.type = 'solo'
  AND m.legacy_id IS NULL
  AND m.source IS NULL
  AND g.country IS NOT NULL
  AND g.country != 'Lietuva';
