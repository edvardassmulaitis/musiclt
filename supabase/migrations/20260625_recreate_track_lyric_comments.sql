-- ============================================================
-- 2026-06-25 — Atstatyta track_lyric_comments lentelė
-- ============================================================
-- 20260528_db_size_cleanup.sql DROP'ino public.track_lyric_comments kaip
-- „nebenaudojamą feature", bet LyricsWithReactions („pažymėk → reaguok") + API
-- (app/api/tracks/[id]/lyric-comments) vis dar į ją kreipiasi. Todėl bet koks
-- dainos teksto pažymėjimas/komentavimas tyliai krisdavo (POST 500, klientas
-- nuryja klaidą). Atstatom lentelę su schema, kurios tikisi API.
-- API naudoja createAdminClient() (service role) → RLS nereikia.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.track_lyric_comments (
  id              bigserial PRIMARY KEY,
  track_id        integer NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  selection_start integer NOT NULL,
  selection_end   integer NOT NULL,
  selected_text   text    NOT NULL,
  type            text    NOT NULL DEFAULT 'like',
  text            text    NOT NULL DEFAULT '',
  likes           integer NOT NULL DEFAULT 0,
  author          text,
  avatar_letter   text,
  user_id         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tlc_track_id ON public.track_lyric_comments(track_id);
CREATE INDEX IF NOT EXISTS idx_tlc_user_id  ON public.track_lyric_comments(user_id);
