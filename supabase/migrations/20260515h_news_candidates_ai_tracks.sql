-- ============================================================
-- 2026-05-15 — Pridėti ai_tracks_mentioned į news_candidates
-- ============================================================
-- Sonnet AI scout'as jau extract'ina tracks_mentioned (title + artist) iš
-- straipsnio, bet tas array'jus dabar discard'inamas po matchTracks() —
-- į news_candidates patenka tik suggested_track_ids (matched in DB).
--
-- Norint, kad wizard'as inbox'e parodytų unmatched tracks su "Sukurti
-- dainą" galimybe, reikia persistanti pilnas AI ekstrakcijos rezultatas.
--
-- Format'as JSONB:
-- [
--   {
--     "title": "Together",
--     "artist": "The Avalanches",
--     "matched_track_id": 1234,   // null jeigu nerasta DB
--     "youtube_url": "https://..." // null jeigu nėra
--   },
--   ...
-- ]
-- ============================================================

ALTER TABLE public.news_candidates
  ADD COLUMN IF NOT EXISTS ai_tracks_mentioned JSONB;

COMMENT ON COLUMN public.news_candidates.ai_tracks_mentioned IS
  'Sonnet AI''o iš straipsnio extract''inti tracks (title + artist + match status). Naudojama wizard''o "Susijusi muzika" sekcijoje.';

CREATE INDEX IF NOT EXISTS idx_news_candidates_ai_tracks_gin
  ON public.news_candidates USING gin (ai_tracks_mentioned);
