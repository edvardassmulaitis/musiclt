-- ============================================================
-- 2026-05-15 — Deactivate low-signal LT news scout sources
-- ============================================================
-- Po 2026-05-15 04:50 UTC audit'o ir realaus workflow_dispatch
-- patikrinimo, du LT šaltiniai paliekami ne aktyvūs:
--
--   - 15min Muzika (id=1):
--     1) feed grąžina 2010 m. archyvą (Be2gether festival) — feed
--        deprecated nuo 15min puses; vienintelis gyvas RSS endpoint'as
--        yra /rss/lietuva (general news, ne muzika).
--     2) robots.txt eksplicitiškai draudžia:
--        "(2) the development of any software, machine learning,
--        artificial intelligence (AI), and/or large language models
--        (LLMs)" + "(3) creating or providing archived or cached data
--        sets containing our content to others"
--     -> 15min content per Track D Gmail (newsletter / PR direct emails)
--        atkursime TOS-safe būdu vėliau.
--
--   - Bernardinai (id=4):
--     Religinės-kultūrinės temos pagrindas; muzika ~1-2% turinio
--     (klasika, sakralinė muzika kartais). Verified 2026-05-15:
--     šiandienos feed = Ukraine karas, Suomijos prezidentas.
--     -> Signal-to-noise per žemas; jei prireiks klasikos coverage,
--        atskirai pridėsime narrower šaltinį.
--
-- Po šitos migracijos LT scout pool:
--   - LRT Kultūra (id=2)        ← gyvas
--   - Delfi Muzika (id=3)       ← gyvas
-- ============================================================

UPDATE public.scout_sources
SET is_active = false,
    notes = COALESCE(notes, '') || ' [deactivated 2026-05-15: TOS prohibits AI + dead /rss/muzika feed]'
WHERE id = 1 AND parser_key = '15min';

UPDATE public.scout_sources
SET is_active = false,
    notes = COALESCE(notes, '') || ' [deactivated 2026-05-15: ~1-2% music content, signal/noise too low]'
WHERE id = 4 AND parser_key = 'bernardinai';

-- ============================================================
-- Verify state:
-- SELECT id, name, is_active, notes
-- FROM public.scout_sources
-- WHERE category = 'news_lt'
-- ORDER BY id;
-- ============================================================
