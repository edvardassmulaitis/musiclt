-- ============================================================
-- 2026-05-21g — Dedup likes + apply full unique
-- ============================================================
-- 20260521f bandė pridėti UNIQUE (entity_type, entity_legacy_id, user_username)
-- constraint, bet failino dėl esamų duplikatų (e.g. track/7557/viqti). Tai
-- legacy_likes import migracijos (2026-04-27) palikta technical debt — ji
-- naudojo `ON CONFLICT (entity_type, entity_id, user_username) DO NOTHING`,
-- todėl nenudedup'ino tos pačios (entity_type, legacy_id, user_username).
--
-- Šitoje migracijoje:
--   1. DELETE duplikatus, paliekant „geriausią" eilutę
--      (priority: entity_id NOT NULL > entity_id NULL, then minimal id)
--   2. ADD CONSTRAINT
-- ============================================================

BEGIN;

-- 1. Dedup'as: per (entity_type, entity_legacy_id, user_username) grupę
--    paliekam ROW_NUMBER=1 (resolved + smallest id), ištriniame likusius.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY entity_type, entity_legacy_id, user_username
      ORDER BY
        (entity_id IS NOT NULL) DESC,  -- resolved first
        id ASC                          -- earliest insert first
    ) AS rn
  FROM public.likes
  WHERE entity_legacy_id IS NOT NULL
    AND user_username IS NOT NULL
)
DELETE FROM public.likes l
USING ranked r
WHERE l.id = r.id AND r.rn > 1;

-- 2. Drop senas partial index'as iš 20260521b (jei dar liko po 20260521f)
DROP INDEX IF EXISTS public.likes_unique_pending;

-- 3. Drop senas constraint'as jei buvo bandyta sukurt (paranoja)
ALTER TABLE public.likes DROP CONSTRAINT IF EXISTS likes_unique_legacy;

-- 4. Pridėti pilną unique constraint
ALTER TABLE public.likes
  ADD CONSTRAINT likes_unique_legacy
  UNIQUE (entity_type, entity_legacy_id, user_username);

COMMENT ON CONSTRAINT likes_unique_legacy ON public.likes IS
  'Apsaugo nuo duplikatų pagal music.lt legacy_id raktą. Naudojamas '
  'record_like() ?on_conflict= klauzulei (PostgREST native).';

COMMIT;
