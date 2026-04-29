-- ============================================================
-- 2026-04-28 — Add music_attachments JSON to comments table
-- ============================================================
-- Mirrors forum_posts.music_attachments. Lets users attach artists/albums/
-- tracks (search picker) to a comment, same way forum posts do. Stored as
-- JSONB array of { type, id, legacy_id, slug, title, artist, image_url }.
-- Also adds reported_by jsonb column referenced elsewhere if missing.
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS music_attachments jsonb DEFAULT NULL;
