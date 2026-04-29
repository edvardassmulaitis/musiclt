-- Track plays — raw "the user started playing this track" event log.
--
-- Purpose: feed future trending / recent-plays rankings. We store one row
-- per play-intent, not an aggregate counter — this lets us answer questions
-- like "most-played in last 7 days" or "per-country trending" later without
-- a schema change. A materialized view or cron job can roll this up when
-- volumes grow.
--
-- No unique constraint on (track_id, user_id) — rapid replays on the same
-- track are still plays and count toward the track's heat.

CREATE TABLE IF NOT EXISTS public.track_plays (
  id BIGSERIAL PRIMARY KEY,
  track_id BIGINT NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  -- Signed-in profile, or null for anonymous plays. We keep the event even
  -- without a user since anonymous plays are still valid trend signal.
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Cookie-based anon id for dedup / trend shaping per device when signed out.
  anon_id UUID,
  played_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_track_plays_track ON public.track_plays (track_id);
CREATE INDEX IF NOT EXISTS idx_track_plays_user ON public.track_plays (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_track_plays_time ON public.track_plays (played_at DESC);

COMMENT ON TABLE public.track_plays IS
  'Raw play-start events. Aggregate offline for trending/popularity. One row per user intent to play.';
