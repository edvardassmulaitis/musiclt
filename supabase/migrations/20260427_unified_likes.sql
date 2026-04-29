-- ============================================================
-- 2026-04-27 — Unified `likes` lentelė
-- ============================================================
-- Anksčiau turėjom 5 atskiras likes lenteles + 1 cache kolumną:
--   • artist_likes (uuid user_id → artist_id)
--   • album_likes  (uuid user_id → album_id)
--   • track_likes  (uuid user_id → track_id)
--   • legacy_likes (text user_username + entity_type + entity_legacy_id)
--   • anon_artist_likes (anon_id → artist_id)
--   • artists.legacy_like_count (cached count)
--
-- Toks duomenų išskaidymas verčia kiekvieną score formulę / UI rodymą /
-- top fans sąrašą maišyti "modern + legacy" matematiką ir ten gimsta bug'ai.
-- Konsoliduojam į vieną `likes` lentelę su entity discriminator'iu, drop'om
-- visas senas + cache kolumną.
--
-- Auth user'iai: rašom su `user_id` UUID (ir `user_username` kaip
-- denormalized snapshot iš profiles).
-- Ghost user'iai (music.lt scrape): rašom su `user_id=NULL` ir
-- `user_username` iš music.lt. Paskui per `user_ghosts.claimed_user_id`
-- claim'ininami → tada update'iname `user_id` šito user'io rows.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.likes (
  id                BIGSERIAL PRIMARY KEY,
  entity_type       TEXT NOT NULL CHECK (entity_type IN ('artist','album','track','event','thread','post')),
  entity_id         BIGINT NOT NULL,
  entity_legacy_id  BIGINT,                                    -- music.lt legacy_id, jei known
  user_id           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_username     TEXT NOT NULL,                             -- visada present (modern username arba ghost)
  user_rank         TEXT,                                      -- music.lt rank label
  user_avatar_url   TEXT,                                      -- snapshot iš ghost'o
  rating            NUMERIC,                                   -- modern users gali pareiškti 1-5 (palaikom backward-compat)
  source            TEXT NOT NULL DEFAULT 'auth' CHECK (source IN ('auth', 'legacy_scrape', 'anon')),
  anon_id           UUID,                                      -- anonymous likes (be auth, be ghost)
  user_agent        TEXT,                                      -- anon detection
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Unikalumas:
  -- 1. Per (entity, username) — užtikrina kad tas pats music.lt user'is
  --    nedubliuosis (legacy import + modern auth claim merge into one row).
  -- 2. Per (entity, anon_id) — anonymous likes per session.
  CONSTRAINT likes_unique_username UNIQUE (entity_type, entity_id, user_username),
  CONSTRAINT likes_unique_anon UNIQUE (entity_type, entity_id, anon_id)
);

CREATE INDEX IF NOT EXISTS idx_likes_entity ON public.likes (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON public.likes (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_likes_username ON public.likes (user_username);
CREATE INDEX IF NOT EXISTS idx_likes_legacy ON public.likes (entity_type, entity_legacy_id) WHERE entity_legacy_id IS NOT NULL;

COMMENT ON TABLE public.likes IS
  'Vieninga likes lentelė. entity_type discriminator (artist/album/track/event). user_id NULL = ghost user (music.lt scrape) arba anon. user_username — visada present (denormalized snapshot).';

-- ============================================================
-- Drop old views first (they reference old tables)
-- ============================================================
DROP VIEW IF EXISTS public.v_artist_like_stats CASCADE;
DROP VIEW IF EXISTS public.v_legacy_likes_by_entity CASCADE;
DROP VIEW IF EXISTS public.v_top_likers CASCADE;

-- ============================================================
-- Migrate existing data
-- ============================================================

-- 1. legacy_likes → likes
--    Music.lt scrape įrašai. user_id=NULL, source='legacy_scrape'.
--    Apima visus tipus: artist/album/track/event + thread/post.
--    Filtruojam SELECT'e nesusiej-amus rows — kitaip krenta NOT NULL constraint
--    ant entity_id (pvz. likes track'ams kurių artist'as dar nebuvo imported,
--    todėl tracks lentelėje neegzistuoja).
INSERT INTO public.likes
  (entity_type, entity_id, entity_legacy_id, user_username, user_rank, user_avatar_url, source, created_at)
SELECT entity_type, entity_id, entity_legacy_id, user_username, user_rank, user_avatar_url, source, created_at
FROM (
  SELECT
    ll.entity_type,
    CASE ll.entity_type
      WHEN 'artist' THEN (SELECT id FROM public.artists WHERE legacy_id = ll.entity_legacy_id)
      WHEN 'album'  THEN (SELECT id FROM public.albums  WHERE legacy_id = ll.entity_legacy_id)
      WHEN 'track'  THEN (SELECT id FROM public.tracks  WHERE legacy_id = ll.entity_legacy_id)
      WHEN 'event'  THEN (SELECT id FROM public.events_legacy WHERE legacy_id = ll.entity_legacy_id)
      WHEN 'thread' THEN ll.entity_legacy_id  -- forum_threads.legacy_id IS the PK
      WHEN 'post'   THEN ll.entity_legacy_id  -- forum_posts.legacy_id IS the PK
      ELSE NULL
    END AS entity_id,
    ll.entity_legacy_id,
    ll.user_username,
    ll.user_rank,
    ll.user_avatar_url,
    'legacy_scrape' AS source,
    COALESCE(ll.imported_at, now()) AS created_at
  FROM public.legacy_likes ll
  WHERE ll.entity_type IN ('artist','album','track','event','thread','post')
) resolved
WHERE resolved.entity_id IS NOT NULL
ON CONFLICT (entity_type, entity_id, user_username) DO NOTHING;

-- 2. artist_likes → likes (modern auth users)
INSERT INTO public.likes
  (entity_type, entity_id, user_id, user_username, rating, source, created_at)
SELECT
  'artist', al.artist_id, al.user_id,
  COALESCE(p.username, 'user_' || substr(al.user_id::text, 1, 8)),
  al.rating, 'auth', al.created_at
FROM public.artist_likes al
LEFT JOIN public.profiles p ON p.id = al.user_id
ON CONFLICT (entity_type, entity_id, user_username) DO NOTHING;

-- 3. album_likes → likes
INSERT INTO public.likes
  (entity_type, entity_id, user_id, user_username, rating, source, created_at)
SELECT
  'album', al.album_id, al.user_id,
  COALESCE(p.username, 'user_' || substr(al.user_id::text, 1, 8)),
  al.rating, 'auth', al.created_at
FROM public.album_likes al
LEFT JOIN public.profiles p ON p.id = al.user_id
ON CONFLICT (entity_type, entity_id, user_username) DO NOTHING;

-- 4. track_likes → likes
INSERT INTO public.likes
  (entity_type, entity_id, user_id, user_username, rating, source, created_at)
SELECT
  'track', tl.track_id, tl.user_id,
  COALESCE(p.username, 'user_' || substr(tl.user_id::text, 1, 8)),
  tl.rating, 'auth', tl.created_at
FROM public.track_likes tl
LEFT JOIN public.profiles p ON p.id = tl.user_id
ON CONFLICT (entity_type, entity_id, user_username) DO NOTHING;

-- 5. anon_artist_likes → likes (be username, naudojam anon_id)
INSERT INTO public.likes
  (entity_type, entity_id, user_username, anon_id, user_agent, source, created_at)
SELECT
  'artist', aal.artist_id,
  'anon_' || substr(aal.anon_id::text, 1, 8),  -- pseudo username
  aal.anon_id, aal.user_agent, 'anon', aal.created_at
FROM public.anon_artist_likes aal
ON CONFLICT (entity_type, entity_id, anon_id) DO NOTHING;

-- ============================================================
-- Drop old tables + cache columns
-- ============================================================
DROP TABLE IF EXISTS public.legacy_likes CASCADE;
DROP TABLE IF EXISTS public.artist_likes CASCADE;
DROP TABLE IF EXISTS public.album_likes CASCADE;
DROP TABLE IF EXISTS public.track_likes CASCADE;
DROP TABLE IF EXISTS public.anon_artist_likes CASCADE;

ALTER TABLE public.artists DROP COLUMN IF EXISTS legacy_like_count;
-- Albums/tracks taip pat turi legacy_like_count? Drop'om jei egzistuoja.
ALTER TABLE public.albums  DROP COLUMN IF EXISTS legacy_like_count;
ALTER TABLE public.tracks  DROP COLUMN IF EXISTS legacy_like_count;

-- Po šios migracijos visos likes data pasiekiama per single SELECT iš `likes`.
-- Score formulos, UI komponentai, scraper — visi kreipiasi tik čia.
