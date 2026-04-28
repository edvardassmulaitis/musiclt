-- ============================================================
-- 2026-04-28 — Link track_lyric_comments to profiles via user_id
-- ============================================================
-- Anksčiau lyric reaction'ai turėjo tik plain `author` + `avatar_letter`
-- string'us — nei real avatar'o, nei click'inamo profilio. Pridedam
-- `user_id` FK į profiles taip, kad galėtume per JOIN gauti display
-- name + avatar URL ir tinkamai parodyti, kas reagavo.
ALTER TABLE public.track_lyric_comments
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_track_lyric_comments_user_id
  ON public.track_lyric_comments(user_id);
