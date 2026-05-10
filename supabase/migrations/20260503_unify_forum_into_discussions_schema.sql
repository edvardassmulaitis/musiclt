-- ============================================================
-- 2026-05-03 — Schema unification: forum_threads → discussions, forum_posts → comments
-- ============================================================
-- Tikslas: ne'turėti dvigubos forum sistemos. Modern user-created discussions
-- (table: discussions) tampa viena kanonine vieta visiems thread'ams; comments
-- (modern, su FK per entity'į: track_id, album_id, news_id, event_id, discussion_id)
-- — vieta visiems post'ams.
--
-- Šitas migracijos failas TIK schema'ą paruošia (ADD COLUMN'ai). Duomenys
-- migruojami atskirai per Python script'ą (backfill_unify_forum.py), kurį
-- paleisi po šitos migracijos.
--
-- Idempotent — IF NOT EXISTS visur.

BEGIN;

-- 1. discussions += legacy importuotų thread'ų metadata
ALTER TABLE public.discussions
  ADD COLUMN IF NOT EXISTS legacy_id         BIGINT,
  ADD COLUMN IF NOT EXISTS legacy_kind       TEXT,        -- 'discussion' | 'news' (forum_threads.kind)
  ADD COLUMN IF NOT EXISTS source_url        TEXT,
  ADD COLUMN IF NOT EXISTS is_legacy         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS first_post_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pagination_count  INT,
  ADD COLUMN IF NOT EXISTS forum_id          INT,         -- music.lt'o "forum'o" (kategorija) numeris
  ADD COLUMN IF NOT EXISTS forum_slug        TEXT;        -- kategorijos slug'as ("Grupes-atlikejai" etc.)

CREATE UNIQUE INDEX IF NOT EXISTS uq_discussions_legacy_id
  ON public.discussions (legacy_id) WHERE legacy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_discussions_is_legacy_created
  ON public.discussions (is_legacy, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discussions_forum_id
  ON public.discussions (forum_id) WHERE forum_id IS NOT NULL;

-- 2. comments += legacy importuotų post'ų metadata
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS legacy_id                  BIGINT,
  ADD COLUMN IF NOT EXISTS legacy_thread_legacy_id    BIGINT,   -- forum_posts.thread_legacy_id (helper migracijai)
  ADD COLUMN IF NOT EXISTS legacy_parent_legacy_id    BIGINT,   -- forum_posts.parent_post_legacy_id (resolve antru pass'u)
  ADD COLUMN IF NOT EXISTS content_html               TEXT;     -- richer formatas iš forum'o

CREATE UNIQUE INDEX IF NOT EXISTS uq_comments_legacy_id
  ON public.comments (legacy_id) WHERE legacy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comments_legacy_thread
  ON public.comments (legacy_thread_legacy_id) WHERE legacy_thread_legacy_id IS NOT NULL;

-- 3. profiles: ghost user infrastructure.
--    Forum'o autorius (legacy username'as be email'o) reikia atvaizduoti per
--    profile row'ą — kad comments.author_id (UUID FK) galėtų į jį rodyti, ir
--    UI rodytų author info (avatar, name, profile link).
--    is_claimed=false reiškia: tai automatiškai sukurtas „ghost" — useris dar
--    neprisijungė. Kai useris signin'ina su email'u, claim flow merge'ina šitą
--    ghost profilį (per email match arba username claim).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_claimed BOOLEAN NOT NULL DEFAULT true;

-- Esami profiliai (turi auth provider'į) — claim'inti TRUE. Naujus ghost'us
-- script'as kurs su FALSE explicit'ai.
UPDATE public.profiles SET is_claimed = true WHERE provider IS NOT NULL AND is_claimed IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_unclaimed
  ON public.profiles (is_claimed) WHERE is_claimed = false;

-- Username lookup'ui — case-insensitive
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_username_lower
  ON public.profiles (LOWER(username)) WHERE username IS NOT NULL;

COMMIT;
