-- ============================================================
-- 2026-04-27 — artist community counts (likes/discussions/news/concerts)
-- ============================================================
-- Music.lt artist puslapyje rodomi label'ai:
--   "favorite_5_count{ID}_main">53</label>     ← likes
--   "Diskusijos (N) / Naujienos (N) / Koncertai (N)"
-- legacy_like_count jau egzistuoja. Pridedam kitus 3.
-- ============================================================

ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS legacy_discussion_count INT,
  ADD COLUMN IF NOT EXISTS legacy_news_count       INT,
  ADD COLUMN IF NOT EXISTS legacy_concert_count    INT;

COMMENT ON COLUMN public.artists.legacy_discussion_count IS
  'Music.lt "Diskusijos (N)" label — saugoma kad UI rodytu badge net be full thread importo.';
COMMENT ON COLUMN public.artists.legacy_news_count IS
  'Music.lt "Naujienos (N)" label — kind=news threadų skaičius.';
COMMENT ON COLUMN public.artists.legacy_concert_count IS
  'Music.lt "Koncertai (N)" label — events skaičius.';
