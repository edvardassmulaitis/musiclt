-- Add artist_id to discussions for unified artist-related discussion lookup.
--
-- Po unifikacijos: VIENA discussions lentelė visam komentavimui (atlikėjai,
-- albumai, dainos, įvykiai, news). Anksčiau forum_threads.artist_id rodė į
-- artist'ą; dabar tas pats per discussions.artist_id, kad artist profile
-- query'intų vienoj vietoj.
--
-- NULL leidžiamas — ne visos diskusijos rišasi su atlikėju (pvz "Šviežiausi
-- jūsų muzikiniai atradimai" — generic).

ALTER TABLE public.discussions
  ADD COLUMN IF NOT EXISTS artist_id BIGINT REFERENCES public.artists(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_discussions_artist_id
  ON public.discussions (artist_id)
  WHERE artist_id IS NOT NULL;

-- Backfill iš forum_threads (intermediate lentelė) — kol ji dar egzistuoja,
-- nukopijuojam artist_id į discussions per legacy_id matching.
UPDATE public.discussions d
SET artist_id = ft.artist_id
FROM public.forum_threads ft
WHERE d.legacy_id = ft.legacy_id
  AND d.is_legacy = TRUE
  AND ft.artist_id IS NOT NULL
  AND d.artist_id IS NULL;
