-- ============================================================
-- 2026-05-15 — Pataisyti tickets sources list_url'us
-- ============================================================
-- Po pirmu run'o atrasti issues:
--   - bilietai.lt: senas /lit/koncertai/index/all → /renginiai/koncertai
--   - tiketa.lt: /lt/categories/music → /LT (homepage, 404 fix)
--   - kakava.lt: HTML tuščias (React SPA) → API sitemap'as
-- ============================================================

UPDATE public.scout_sources
SET list_url = 'https://www.bilietai.lt/renginiai/koncertai'
WHERE parser_key = 'bilietai_lt';

UPDATE public.scout_sources
SET list_url = 'https://www.tiketa.lt/LT'
WHERE parser_key = 'tiketa';

UPDATE public.scout_sources
SET list_url = 'https://api.kakava.lt/api/v1/system/sitemap'
WHERE parser_key = 'kakava';
