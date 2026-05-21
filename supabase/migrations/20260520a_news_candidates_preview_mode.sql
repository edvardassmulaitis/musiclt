-- ============================================================
-- 2026-05-20 — News candidates: preview mode + original_title
-- ============================================================
-- Tikslas: News scout cron nebedaro pilno AI rewrite'o (per brangu Sonnet'u,
-- per prastas Haiku). Vietoj to candidates'ai įrašomi su EN title (preview)
-- ir LT rewrite'as gimdomas tik admin'o spustelėjimu /admin/inbox'e.
--
-- Pakeitimai:
--   1) `original_title` TEXT — raw EN title iš RSS feed'o
--   2) `ai_title`, `ai_body` tampa NULL-able (anksčiau NOT NULL)
--   3) `status` enum prideda 'preview' (Tier 1 candidate prieš rewrite'ą)
--
-- Susiję dokumentai: LT_TRANSLATION_IMPROVEMENT_PLAN.md, LT_TRANSLATION_PATCHES.md
-- ============================================================

ALTER TABLE public.news_candidates
  ADD COLUMN IF NOT EXISTS original_title TEXT;

-- Atlaisvinam NOT NULL — Tier 1 candidate neturi LT turinio
ALTER TABLE public.news_candidates
  ALTER COLUMN ai_title DROP NOT NULL,
  ALTER COLUMN ai_body DROP NOT NULL;

-- Pridedam 'preview' į status enum check'ą (drop + recreate)
ALTER TABLE public.news_candidates DROP CONSTRAINT IF EXISTS news_candidates_status_check;
ALTER TABLE public.news_candidates ADD CONSTRAINT news_candidates_status_check
  CHECK (status IN ('preview','pending','approved','rejected','duplicate','filtered','error'));

-- Index naujam status'ui (inbox query'iai)
CREATE INDEX IF NOT EXISTS idx_news_candidates_preview
  ON public.news_candidates(status, created_at DESC)
  WHERE status = 'preview';

COMMENT ON COLUMN public.news_candidates.original_title IS
  'Raw EN/source title from feed; preview mode (no AI rewrite)';
COMMENT ON COLUMN public.news_candidates.status IS
  'Workflow: preview → pending (po rewrite) → approved/rejected. Arba: pending (manual file) → approved/rejected.';
