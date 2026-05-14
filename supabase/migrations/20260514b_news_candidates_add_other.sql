-- ============================================================
-- 2026-05-14 — news_candidates.ai_category: pridėti 'other'
-- ============================================================
-- Tikslas: Sonnet'as kartais pasiūlo straipsnį, kuris yra muzikinis,
-- bet netinka aiškiai į 4 pagrindines kategorijas (apdovanojimai,
-- interviu, jubiliejus, scenos news ir t.t.). Pridedam 'other' kaip
-- fallback'ą — admin'as gali kategorizuoti rankomis, bet straipsnis
-- nepradingsta.
-- ============================================================

ALTER TABLE public.news_candidates
  DROP CONSTRAINT IF EXISTS news_candidates_ai_category_check;

ALTER TABLE public.news_candidates
  ADD CONSTRAINT news_candidates_ai_category_check
  CHECK (ai_category IN ('release','performance','tour','career_step','other'));
