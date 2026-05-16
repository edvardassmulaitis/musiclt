-- ============================================================
-- 2026-05-16 — Gmail ingest dedupe lentelė
-- ============================================================
-- Edvardo Claude.ai project'e veikia Gmail worker'is, kuris periodiškai
-- skaito music.lt.naujienos@gmail.com inbox'ą, ekstraktina press releases
-- ir POST'ina į /api/internal/gmail-ingest endpoint'ą.
--
-- Dedupe per Gmail thread_id — vienas thread (net jei keli reply'jai) duoda
-- vieną candidate. Šaltinio thread_id saugomas news_candidates lentelėj
-- (source_email_thread_id), bet papildomai pildom šitą atskirą lentelę
-- greitam lookup'ui be JOIN.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.gmail_seen_messages (
  thread_id TEXT PRIMARY KEY,
  candidate_id INTEGER REFERENCES public.news_candidates(id) ON DELETE SET NULL,
  from_email TEXT,
  subject TEXT,
  filter_reason TEXT,  -- jeigu Haiku/Sonnet atmetė: 'not_music' / 'low_confidence' / NULL jei priimta
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gmail_seen_first_seen
  ON public.gmail_seen_messages(first_seen_at DESC);

COMMENT ON TABLE public.gmail_seen_messages IS
  'Gmail ingest dedupe — thread_id → candidate_id mapping. Worker'is patikrina prieš sukurdamas naują candidate.';
