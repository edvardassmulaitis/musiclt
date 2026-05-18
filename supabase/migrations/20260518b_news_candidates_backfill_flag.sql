-- ============================================================
-- 2026-05-18 — news_candidates.attachments_checked_at flag
-- ============================================================
-- Tikslas: pažymėti, kad gmail attachment fetch jau bandytas šiam candidate'ui
-- (NE tik success — taip pat empty results). Be flag'o backfill endpoint'as
-- re-process'ina tuos pačius candidate'us kiekvieną round'ą (Gmail API quota
-- waste).
--
-- gmail-ingest endpoint'as NEW candidate'ams set'ina NOW() po processing'o.
-- Backfill endpoint'as filter'ina WHERE attachments_checked_at IS NULL.
-- Manual button retry galimas via UPDATE candidate SET attachments_checked_at=NULL.
-- ============================================================

ALTER TABLE public.news_candidates
  ADD COLUMN IF NOT EXISTS attachments_checked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_news_candidates_attachments_checked
  ON public.news_candidates (attachments_checked_at)
  WHERE attachments_checked_at IS NULL AND source_type = 'gmail';

COMMENT ON COLUMN public.news_candidates.attachments_checked_at IS
  $$Kada gmail attachment fetch jau bandytas (success or empty). NULL = dar nepatikrintas. Backfill endpoint'as skipina NOT NULL.$$;
