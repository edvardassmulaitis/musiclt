-- ============================================================
-- 2026-05-15 — Events scout: 3 LT bilietu portalu seed
-- ============================================================
-- Tikslas: pridėti scout_sources įrašus bilietai.lt, tiketa.lt, kakava.lt
-- kad GitHub Actions matrix tegalėtų juos imti per category='tickets' filtrą.
-- ============================================================

INSERT INTO public.scout_sources
  (name, category, feed_url, list_url, parser_key, fetch_interval_min, notes)
VALUES
  ('Bilietai.lt',   'tickets', NULL, 'https://www.bilietai.lt/lit/koncertai/index/all',     'bilietai_lt', 720, 'Pagrindinis LT bilietu portalas'),
  ('Tiketa.lt',     'tickets', NULL, 'https://www.tiketa.lt/lt/categories/music',           'tiketa',      720, 'Antras pagal dydi LT portalas'),
  ('Kakava.lt',     'tickets', NULL, 'https://kakava.lt/lt/koncertai',                       'kakava',      720, 'Trecias LT portalas')
ON CONFLICT (parser_key) DO NOTHING;
