-- ============================================================
-- 2026-05-21e — likes: pakeisti partial unique į pilną unique
-- ============================================================
-- 20260521b sukurtas `likes_unique_pending` PARTIAL unique index
-- (`WHERE entity_id IS NULL`) tikslu apsaugoti pending placeholder'ius nuo
-- duplikatų. Bet PostgREST'as nepalaiko WHERE-d partial indexes kaip
-- `?on_conflict=` target'ų — `Prefer: resolution=ignore-duplicates` grąžina
-- 42P10 „there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" net jei kolonų sąrašas tiksliai sutampa.
--
-- Sprendimas: pakeisti į PILNĄ unique constraint be WHERE. Tai apsaugo nuo
-- duplikatų tiek pending (entity_id IS NULL), tiek resolved
-- (entity_id IS NOT NULL) atvejais. Skirtumas — vienas (type, legacy_id,
-- username) gali turėti VIENĄ row, kuri arba pending arba resolved
-- (sweep'as UPDATE'ina ne INSERT'ina).
--
-- Modern auth likes (entity_legacy_id=NULL) lieka nepaveikti — UNIQUE
-- constraint'as NULLs treats as distinct, todėl daug rows su NULL legacy_id
-- vis dar leidžiami.
-- ============================================================

BEGIN;

-- 1. Drop senas partial unique index
DROP INDEX IF EXISTS public.likes_unique_pending;

-- 2. Pridėk full unique constraint per (type, legacy_id, username)
--    Naudoju constraint (ne index), kad PostgREST geriau mato.
--    NB: jei jau yra duplikatų, šitas faila'ins su error — tada reikia
--    pirma rankiniu būdu išvalyti. einaras13 pirmajame run'e turi 329
--    artist + 0 album + 0 track resolved'ų. Dublikatų iki šio momento
--    neturėtų būti, nes pirmasis run'as buvo per `record_pending_link`
--    į atskirą lentelę.
ALTER TABLE public.likes
  ADD CONSTRAINT likes_unique_legacy
  UNIQUE (entity_type, entity_legacy_id, user_username);

COMMENT ON CONSTRAINT likes_unique_legacy ON public.likes IS
  'Apsaugo nuo duplikatų pagal music.lt legacy_id raktą (pakeitė 20260521b '
  'partial unique kuris nepasitarnavo PostgREST on_conflict).';

COMMIT;
