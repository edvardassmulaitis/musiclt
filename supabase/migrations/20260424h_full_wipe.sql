-- ============================================================
-- 2026-04-24h — DESTRUKTYVUS pilnas wipe (po 20260424g)
-- ============================================================
-- ⚠️ ŠI MIGRACIJA NAIKINA VISUS DUOMENIS public schema'oje
-- (išskyrus profiles, admin_whitelist, NextAuth lenteles, ir
-- ką tik sukurtą import_jobs).
--
-- Strategija (saugumo gairės):
--   1. Pirma atjungiame profiles → tracks/albums FK references
--      (mood_track_id, etc.), kad TRUNCATE CASCADE neperliptų į
--      profiles lentelę.
--   2. Dinamiškas TRUNCATE CASCADE per visas lenteles iš pg_tables
--      kurios NĖRA keep_tables sąraše.
--   3. DROP legacy_import schema jei dar yra.
--   4. Bump artists/albums/tracks/import_jobs sequences į 100000
--      kad legacy_id range (1..15000) liktų laisvas.
--
-- Verifikacija po apply:
--   SELECT 'artists' AS t, COUNT(*) FROM artists UNION ALL
--   SELECT 'albums', COUNT(*) FROM albums UNION ALL
--   SELECT 'tracks', COUNT(*) FROM tracks UNION ALL
--   SELECT 'profiles', COUNT(*) FROM profiles UNION ALL
--   SELECT 'import_jobs', COUNT(*) FROM import_jobs;
-- Tikėtinas rezultatas: profiles > 0, kiti = 0.

BEGIN;

-- ── 1. Atjungti FK references iš keep'iamų lentelių ─────────────
-- Tai neleidžia TRUNCATE CASCADE perlipti į profiles ir kt.
-- Jei pridėsim daugiau profile→content FK ateityje — pridėt čia.
UPDATE public.profiles SET mood_track_id = NULL WHERE mood_track_id IS NOT NULL;

-- ── 2. Dinaminis TRUNCATE ────────────────────────────────────────
DO $$
DECLARE
    r RECORD;
    keep_tables TEXT[] := ARRAY[
        'profiles',
        'admin_whitelist',
        'verification_tokens',
        'accounts',
        'sessions',
        'users',
        'import_jobs'   -- ką tik sukurta, paliekam
    ];
BEGIN
    FOR r IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename <> ALL(keep_tables)
          AND tablename NOT LIKE 'pg_%'
          AND tablename NOT LIKE '_prisma_%'
    LOOP
        EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
        RAISE NOTICE 'Truncated: public.%', r.tablename;
    END LOOP;
END $$;

-- ── 3. legacy_import schema jei vis dar yra ─────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'legacy_import') THEN
        EXECUTE 'DROP SCHEMA legacy_import CASCADE';
        RAISE NOTICE 'Dropped legacy_import schema';
    END IF;
END $$;

-- ── 4. Sequences bump ────────────────────────────────────────────
-- Strategija: po wipe sequences = 1. populate_all.py insertins su
-- explicit id = legacy_id (range 1..~15000). Nustatom sequences ties
-- 100000 kad nauji (admin-sukurti per /admin/artists/new) atlikėjai
-- gautų id'us > 100000 ir nesikirstų.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname='public' AND sequencename = 'artists_id_seq') THEN
        PERFORM setval('public.artists_id_seq', 100000, false);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname='public' AND sequencename = 'albums_id_seq') THEN
        PERFORM setval('public.albums_id_seq', 100000, false);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname='public' AND sequencename = 'tracks_id_seq') THEN
        PERFORM setval('public.tracks_id_seq', 100000, false);
    END IF;
END $$;

COMMIT;
