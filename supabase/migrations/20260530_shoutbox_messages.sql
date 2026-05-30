-- 20260530_shoutbox_messages.sql
--
-- FIX: Pokalbių (shoutbox) įvedimas lūždavo su klaida
--   "Could not find the table 'public.shoutbox_messages' in the schema cache".
-- Lentelė niekada nebuvo sukurta, nors /api/live/shoutbox (GET/POST/DELETE) ją
-- naudoja, o shoutbox_mutes JAU egzistuoja. Sukuriam ją čia.
--
-- Stulpeliai tiksliai atitinka ką /api/live/shoutbox insert'ina/select'ina:
--   user_id, author_name, author_avatar, body, created_at, is_deleted, deleted_by.
-- RLS konvencija mirror'inta nuo activity_events (public read kai !is_deleted,
-- public insert). API naudoja service-role klientą (createAdminClient), tad
-- policy'ai daugiausia kaip safety net + suderinamumas su projekto stiliumi.

CREATE TABLE IF NOT EXISTS public.shoutbox_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text,
  author_name   text,
  author_avatar text,
  body          text NOT NULL,
  is_deleted    boolean NOT NULL DEFAULT false,
  deleted_by    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Newest-first paginavimui + rate-limit count'ams (user_id + created_at).
CREATE INDEX IF NOT EXISTS idx_shoutbox_messages_created_at
  ON public.shoutbox_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shoutbox_messages_user_recent
  ON public.shoutbox_messages (user_id, created_at DESC);

ALTER TABLE public.shoutbox_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read shoutbox" ON public.shoutbox_messages;
CREATE POLICY "public read shoutbox" ON public.shoutbox_messages
  FOR SELECT USING (is_deleted = false);

DROP POLICY IF EXISTS "public insert shoutbox" ON public.shoutbox_messages;
CREATE POLICY "public insert shoutbox" ON public.shoutbox_messages
  FOR INSERT WITH CHECK (true);
