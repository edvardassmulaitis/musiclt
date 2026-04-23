-- Thread UI enhancements: like count + artist link + post's music attachments
-- Run in Supabase SQL Editor (service_role).

-- forum_threads: like_count + artist FK
ALTER TABLE public.forum_threads
  ADD COLUMN IF NOT EXISTS like_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS artist_id bigint REFERENCES public.artists(id);

CREATE INDEX IF NOT EXISTS forum_threads_artist_id_idx ON public.forum_threads(artist_id);

-- forum_posts: structured music attachments + author_avatar_url (already stored via
-- user_ghosts, but helpful to cache here for rendering without extra join)
ALTER TABLE public.forum_posts
  ADD COLUMN IF NOT EXISTS music_attachments jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS author_avatar_url text;

-- Backfill DM threads → artist_id = 1 (Depeche Mode is the first & only active group now)
UPDATE public.forum_threads
  SET artist_id = 1
WHERE artist_id IS NULL
  AND (slug ILIKE '%depeche%' OR source_url ILIKE '%depeche%');
