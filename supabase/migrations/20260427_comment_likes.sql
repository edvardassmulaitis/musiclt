-- ============================================================
-- 2026-04-27 — Allow 'comment' in likes.entity_type
-- ============================================================
ALTER TABLE public.likes
  DROP CONSTRAINT IF EXISTS likes_entity_type_check;

ALTER TABLE public.likes
  ADD CONSTRAINT likes_entity_type_check
  CHECK (entity_type IN ('artist','album','track','event','thread','post','comment'));
