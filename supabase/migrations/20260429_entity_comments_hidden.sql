-- ============================================================
-- 2026-04-29 — Add is_hidden column to entity_comments
-- ============================================================
-- Allows admins to soft-hide imported (legacy/scraped) comments without
-- removing them from the archive. Display logic filters
-- `WHERE is_hidden = false OR is_hidden IS NULL`.
ALTER TABLE public.entity_comments
  ADD COLUMN IF NOT EXISTS is_hidden boolean DEFAULT false;
