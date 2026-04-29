-- Anonymous artist likes. Mirrors artist_likes but the author is identified by
-- a UUID stored in the visitor's httpOnly cookie (ml_anon_id) rather than a
-- profiles row. Unique constraint prevents the same device from double-voting
-- on the same artist. user_agent is kept for rough trend analytics / abuse
-- triage (we don't store IPs — privacy).

CREATE TABLE IF NOT EXISTS public.anon_artist_likes (
  id          BIGSERIAL PRIMARY KEY,
  artist_id   BIGINT NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  anon_id     UUID NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (artist_id, anon_id)
);

CREATE INDEX IF NOT EXISTS idx_anon_artist_likes_artist ON public.anon_artist_likes (artist_id);
CREATE INDEX IF NOT EXISTS idx_anon_artist_likes_anon   ON public.anon_artist_likes (anon_id);
CREATE INDEX IF NOT EXISTS idx_anon_artist_likes_date   ON public.anon_artist_likes (created_at);
