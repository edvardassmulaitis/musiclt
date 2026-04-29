-- ============================================================
-- 2026-04-29c — Boombox queue model + LT/genre filter columns
-- ============================================================
-- Pakeičiame iš "scheduled by date" į "queue" modelį:
--   * sort_order: admin'as nustato eiliškumą (mažesnis = anksčiau)
--   * published_at: UTC timestamp kai drop'as pirmąkart parodytas user'iams
--   * scheduled_for paliekam — bet jis tampa optional override'u
--
-- Public flow'as kasdien:
--   1. Jei yra drop'as su published_at::date = šiandien → grąžinam tą (sticky 24h)
--   2. Else: pasirenkam status='ready' AND published_at IS NULL su mažiausiu
--      sort_order, žymim published_at = NOW()
--
-- Pridedam LT vs international + genre žymėjimą tracks lentelei (jei dar nėra),
-- kad auto-generator'ius galėtų gerai porinti.
-- ============================================================

BEGIN;

-- ── 1. sort_order + published_at į drops lenteles ───────────
ALTER TABLE public.boombox_image_drops
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE public.boombox_duel_drops
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE public.boombox_verdict_drops
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE public.boombox_video_drops
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;


-- ── 2. Indexes queue picking'ui ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_boombox_image_queue
  ON public.boombox_image_drops (status, sort_order, created_at)
  WHERE status = 'ready' AND published_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_boombox_image_published
  ON public.boombox_image_drops (published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_boombox_duel_queue
  ON public.boombox_duel_drops (status, sort_order, created_at)
  WHERE status = 'ready' AND published_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_boombox_duel_published
  ON public.boombox_duel_drops (published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_boombox_verdict_queue
  ON public.boombox_verdict_drops (status, sort_order, created_at)
  WHERE status = 'ready' AND published_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_boombox_verdict_published
  ON public.boombox_verdict_drops (published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_boombox_video_queue
  ON public.boombox_video_drops (status, sort_order, created_at)
  WHERE status = 'ready' AND published_at IS NULL;


-- ── 3. RLS policy update'ai (drop senas + naujas) ──────────
DROP POLICY IF EXISTS "boombox_image_drops_read" ON public.boombox_image_drops;
DROP POLICY IF EXISTS "boombox_duel_drops_read" ON public.boombox_duel_drops;
DROP POLICY IF EXISTS "boombox_verdict_drops_read" ON public.boombox_verdict_drops;
DROP POLICY IF EXISTS "boombox_video_drops_read" ON public.boombox_video_drops;

CREATE POLICY "boombox_image_drops_read" ON public.boombox_image_drops
  FOR SELECT USING (status = 'ready');
CREATE POLICY "boombox_duel_drops_read" ON public.boombox_duel_drops
  FOR SELECT USING (status = 'ready');
CREATE POLICY "boombox_verdict_drops_read" ON public.boombox_verdict_drops
  FOR SELECT USING (status = 'ready');
CREATE POLICY "boombox_video_drops_read" ON public.boombox_video_drops
  FOR SELECT USING (status = 'ready');

COMMIT;
