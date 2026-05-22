-- ============================================================
-- 2026-05-21b — likes.entity_id NULLABLE pending placeholders
-- ============================================================
-- Iki šiol scraper'is įrašydavo TIK tuos likes, kurių entity (artist/album/
-- track) jau buvo migruotas. Likę 11k+ tracks ir 900+ albums (legacy_id'ai
-- be modern atitikmens) gulė į atskirą `ugc_pending_links` queue, kurią
-- reikėjo periodiškai sweep'inti per `ugc_resweep.py` (kuris dar nebuvo
-- parašytas). UI nematė pending'ų — atrodė, kad einaras13 mėgo tik 329
-- atlikėjus, nors realiai 12,719.
--
-- Sprendimas: leidžiam `likes.entity_id` būti NULL kai placeholder'is.
-- Tada ALL likes (resolved + pending) gula į vieną lentelę. Po atlikėjo
-- importo `resolve_pending_likes(entity_type, legacy_id, modern_id)`
-- (kita migracija) UPDATE'ina entity_id pagal entity_legacy_id match'ą.
-- ============================================================

BEGIN;

-- 1. Leidžiam NULL entity_id (placeholder semantika)
ALTER TABLE public.likes ALTER COLUMN entity_id DROP NOT NULL;

-- 2. Esamas `likes_unique_username (entity_type, entity_id, user_username)`
--    NEDIRBA NULL entity_id atveju — Postgres NULLs are not equal. Tai
--    reiškia, kad teoriškai galim turėti 100 identical placeholder'ių
--    tam pačiam user×legacy_id. Pridėti partial UNIQUE pending'ams:
CREATE UNIQUE INDEX IF NOT EXISTS likes_unique_pending
  ON public.likes (entity_type, entity_legacy_id, user_username)
  WHERE entity_id IS NULL;

COMMENT ON INDEX public.likes_unique_pending IS
  'Dedup pending likes (entity_id NULL) per (type, legacy_id, username). '
  'NB: resolved likes naudoja kitą constraint — likes_unique_username.';

-- 3. Lookup index sweep'ui — kai migruosis atlikėjas, mums reikia greitai
--    rasti VISUS pending likes tam atlikėjui (pagal type+legacy_id):
CREATE INDEX IF NOT EXISTS likes_pending_lookup
  ON public.likes (entity_type, entity_legacy_id)
  WHERE entity_id IS NULL;

-- 4. UI query'ams reikia atskiro index'o — „visi resolved likes vienam
--    user'iui" (excluding placeholder'ius):
CREATE INDEX IF NOT EXISTS likes_user_resolved
  ON public.likes (user_username, entity_type, created_at DESC)
  WHERE entity_id IS NOT NULL;

COMMENT ON COLUMN public.likes.entity_id IS
  'Modern entity ID (artists/albums/tracks.id). NULL = placeholder — '
  'entity_legacy_id žinomas, bet atlikėjas/albumas/track dar nemigruotas. '
  'Po importo resolve_pending_likes() RPC set''ina entity_id. UI rodyti '
  'tik kai entity_id IS NOT NULL.';

COMMIT;
