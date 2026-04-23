-- Extend legacy_likes entity_type check + add threaded reply parent column.
-- Applied via Supabase SQL Editor 2026-04-23.

ALTER TABLE public.legacy_likes DROP CONSTRAINT IF EXISTS legacy_likes_entity_type_check;
ALTER TABLE public.legacy_likes ADD CONSTRAINT legacy_likes_entity_type_check
  CHECK (entity_type IN ('artist','album','track','event','thread','post'));

ALTER TABLE public.forum_posts ADD COLUMN IF NOT EXISTS parent_post_legacy_id bigint;
CREATE INDEX IF NOT EXISTS forum_posts_parent_idx ON public.forum_posts(parent_post_legacy_id);
