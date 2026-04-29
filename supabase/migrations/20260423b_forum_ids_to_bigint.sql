-- Promote forum IDs to bigint so new replies can use Date.now() as synthetic legacy_id.
-- Applied via Supabase SQL Editor 2026-04-23.

ALTER TABLE public.forum_posts   ALTER COLUMN legacy_id        TYPE bigint;
ALTER TABLE public.forum_posts   ALTER COLUMN thread_legacy_id TYPE bigint;
ALTER TABLE public.forum_threads ALTER COLUMN legacy_id        TYPE bigint;

-- Mirror column on legacy_likes for future thread-likes (entity_type='thread')
ALTER TABLE public.legacy_likes  ADD COLUMN IF NOT EXISTS entity_legacy_id_bigint bigint;
UPDATE public.legacy_likes SET entity_legacy_id_bigint = entity_legacy_id
  WHERE entity_legacy_id_bigint IS NULL;
