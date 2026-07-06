-- ============================================================
-- 2026-07-06c — iTunes garso ištraukos + fantasy biudžeto pertvarka
-- ============================================================
-- 1. tracks.itunes_preview_url — 30 s garso ištrauka kvizams (iOS Safari
--    negroja YouTube iframe garso; HTML5 <audio> veikia). Pildoma lazy
--    per iTunes Search API, cache'inama čia.
-- 2. Fantasy: biudžetas 220 → 350 (simuliacija: 8 vietų komanda,
--    kainos pagal formą — strategijos subalansuotos ±10%).

BEGIN;

ALTER TABLE public.tracks ADD COLUMN IF NOT EXISTS itunes_preview_url TEXT;
ALTER TABLE public.tracks ADD COLUMN IF NOT EXISTS itunes_checked_at TIMESTAMPTZ;

ALTER TABLE public.fantasy_teams ALTER COLUMN budget SET DEFAULT 350;
UPDATE public.fantasy_teams SET budget = 350 WHERE budget = 220;

COMMIT;
