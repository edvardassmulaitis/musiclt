-- ============================================================
-- 2026-05-29f — Index trim (likes over-indexing)
-- ============================================================
-- Kontekstas: ne apie vietą (Pro plan, headroom OK), o apie tai kad `likes`
-- lentelė užima 140 MB / 562k row = 260 B/row. Minimalus like row ~80 B,
-- tad ~100 MB yra INDEKSAI (6 vnt ant 562k row). Audit'as rado 2 nereikalingus.
--
-- Patikrinta REST'u 2026-05-29:
--   • likes WHERE anon_id IS NOT NULL = 0 rows  → anon unique index indeksuoja NIEKĄ
--   • likes WHERE user_username IS NULL = 0 rows → username visada yra (PK lookup'ui)
--
-- ⚠️ VACUUM negali būti TX'e — DROP INDEX bloke, VACUUM atskirai.

BEGIN;

-- 1. likes_unique_anon: UNIQUE(entity_type, entity_id, anon_id).
--    0 anon like'ų egzistuoja (anon-like feature niekada nenaudotas). Index'as
--    ant 562k row su 100% NULL anon_id = ~15-20 MB tuščio svorio.
--    (Stulpelį anon_id PALIEKAM — jei kažkur code path į jį referuoja; tik
--     index/constraint nukrentą. Jei anon-like feature visai abandonintas,
--     vėliau galima ALTER TABLE likes DROP COLUMN anon_id.)
ALTER TABLE public.likes DROP CONSTRAINT IF EXISTS likes_unique_anon;
DROP INDEX IF EXISTS public.likes_unique_anon;

-- 2. idx_likes_entity: (entity_type, entity_id).
--    Tai REDUNDANTUS leftmost-prefix index'as — likes_unique_username
--    (entity_type, entity_id, user_username) jau serve'ina visus
--    (entity_type, entity_id) lookup'us/sort'us. Planner'is naudos unique.
--    ~15-20 MB.
DROP INDEX IF EXISTS public.idx_likes_entity;

COMMIT;

-- 3. Reclaim disk po index drop'ų
VACUUM (ANALYZE) public.likes;

-- ============================================================
-- VERIFIKACIJA (po apply):
--   SELECT pretty FROM db_size_overview() WHERE name='public.likes';
--     → tikimasi ~100-105 MB (nuo 140 MB)
--   EXPLAIN (likes lookup) — patikrink kad likes_unique_username naudojamas
--     vietoj seq scan po idx_likes_entity drop'o:
--   EXPLAIN SELECT * FROM likes WHERE entity_type='track' AND entity_id=123
--           ORDER BY created_at DESC LIMIT 200;
-- Jei planner'is staiga rinktųsi seq scan — re-create:
--   CREATE INDEX idx_likes_entity ON public.likes(entity_type, entity_id);
-- ============================================================
