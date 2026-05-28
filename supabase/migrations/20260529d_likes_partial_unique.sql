-- ============================================================
-- 2026-05-29d — likes_unique_legacy → PARTIAL unique (massive index shrink)
-- ============================================================
--
-- Architektūrinis fix'as: full unique constraint ON
-- (entity_type, entity_legacy_id, user_username) buvo 24 MB nors
-- realiai pending placeholder'ius (entity_id IS NULL) reikia tik
-- ~3,885 row'ams iš 562k.
--
-- Resolved row'ams uniqueness'ą jau garantuoja `likes_unique_username`
-- ON (entity_type, entity_id, user_username) — kuri yra UNIQUE.
--
-- Po šio swap'o:
--   - likes_unique_legacy_pending: PARTIAL UNIQUE WHERE entity_id IS NULL
--   - Tikrasis dydis: ~192 KB (vietoj 24 MB)
--   - Savings: ~23 MB indeksų space + 1 MB heap = ~24 MB
--
-- Applied 2026-05-29 live per SQL Editor. Šis failas — audit trail.
--
-- ⚠️ Saugumas: DROP'inant constraint'ą, REIKIA pirma kurti
--    naują partial unique, kad inserts'as nelaužytų uniqueness'o
--    pending row'ams. Padaryta TX'e — atomic.

BEGIN;

-- 1. Naują partial UNIQUE — taikys tik pending (entity_id IS NULL) rows
CREATE UNIQUE INDEX IF NOT EXISTS likes_unique_legacy_pending
  ON public.likes (entity_type, entity_legacy_id, user_username)
  WHERE entity_id IS NULL;

-- 2. Drop senasis full unique constraint (susijęs index drop'inamas kartu)
ALTER TABLE public.likes DROP CONSTRAINT IF EXISTS likes_unique_legacy;

COMMIT;

-- 3. VACUUM FULL — reclaim space iš drop'into 24 MB indekso
VACUUM FULL public.likes;

-- ============================================================
-- IMPACT (verified post-migration):
-- ============================================================
--   DB total:    530 MB → 507 MB (-23 MB)
--   likes total: 163 MB → 140 MB (-14%)
--   New partial idx: 192 KB (vs 24 MB old full = 125× smaller)
--
-- Total session work (Phase 1 + 2 + 3):
--   857 MB → 507 MB (-350 MB, 41% reduction)
