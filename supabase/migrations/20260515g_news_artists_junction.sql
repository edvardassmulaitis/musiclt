-- ============================================================
-- 2026-05-15 — news ↔ artists junction table
-- ============================================================
-- Iki šiol news turėjo tik 2 slot'us atlikėjams (artist_id + artist_id2).
-- Naujienos dažnai mini 3-5+ atlikėjus (kolaboracijos, festivaliai, "feature"
-- kreditai). Pridedam junction'ą, kad visi susiję atlikėjai būtų išsaugoti
-- ir kad atlikėjo puslapyje rodytųsi visos jį minėjusios naujienos.
--
-- Backward compat: news.artist_id / artist_id2 lieka — pirmas (primary) +
-- antras patenka į juos, kad senas UI dar veiktų be join'o.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.news_artists (
  news_id   INTEGER NOT NULL REFERENCES public.news(id) ON DELETE CASCADE,
  artist_id BIGINT  NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (news_id, artist_id)
);

CREATE INDEX IF NOT EXISTS idx_news_artists_news_id   ON public.news_artists(news_id);
CREATE INDEX IF NOT EXISTS idx_news_artists_artist_id ON public.news_artists(artist_id);
-- Tik 1 primary per news_id (partial unique)
CREATE UNIQUE INDEX IF NOT EXISTS idx_news_artists_one_primary
  ON public.news_artists(news_id) WHERE is_primary = TRUE;

COMMENT ON TABLE public.news_artists IS
  'Junction lentelė news ↔ artists. Vienas news_id gali turėti N atlikėjų, '
  'iš kurių max 1 yra is_primary=TRUE (atvaizduojama virš headline).';
COMMENT ON COLUMN public.news_artists.is_primary IS
  'Pagrindinis atlikėjas (kortelės avatar + featured pozicija).';
COMMENT ON COLUMN public.news_artists.sort_order IS
  '0-based eiliškumas atlikėjų rodymui — primary visada 0.';

-- Backfill iš esamų news.artist_id / artist_id2 (vienkartinis)
INSERT INTO public.news_artists (news_id, artist_id, is_primary, sort_order)
SELECT id, artist_id, TRUE, 0 FROM public.news WHERE artist_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.news_artists (news_id, artist_id, is_primary, sort_order)
SELECT id, artist_id2, FALSE, 1 FROM public.news WHERE artist_id2 IS NOT NULL
ON CONFLICT DO NOTHING;
