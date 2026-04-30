-- ============================================================
-- 2026-04-30 — Chat sistema (privačios žinutės + grupiniai pokalbiai)
-- ============================================================
-- Slack-style messaging foundation:
--   • chat_conversations    — DM ar grupė
--   • chat_participants     — kas yra kiekviename pokalbyje + last_read
--   • chat_messages         — visos žinutės (su parent_message_id thread'ams)
--   • chat_reactions        — emoji reakcijos
--
-- Server-side enforcement: visi rašymai eina per /api/chat/* su NextAuth
-- session check'u + participant membership validacija. RLS leidžia anon
-- klientui skaityti per realtime kanalus (filtruojama pagal conversation_id),
-- bet visi rašymai ribojami service_role atveju (api routes).
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. CONVERSATIONS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id                BIGSERIAL PRIMARY KEY,
  type              TEXT NOT NULL CHECK (type IN ('dm', 'group')),
  -- Grupės pavadinimas + avatar; DM atveju NULL (UI rodo dalyvių vardus).
  name              TEXT,
  photo_url         TEXT,
  -- Topic / tema — Slack-style trumpas aprašymas grupei.
  topic             TEXT,
  created_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Atnaujinama trigger'iu kai pridedama nauja žinutė. Naudojama sidebar
  -- sortavimui (newest first).
  last_message_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Cached preview, kad sidebar'ui nereiktų pagrindinio pokalbio fetch'inti
  -- kiekvienam item'ui.
  last_message_id        BIGINT,
  last_message_preview   TEXT,
  last_message_user_id   UUID
);

COMMENT ON TABLE public.chat_conversations IS
  'Pokalbio container — type=dm (1:1) arba type=group. last_message_* atnaujinamas trigger''iu.';

-- ──────────────────────────────────────────────────────────────
-- 2. PARTICIPANTS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_participants (
  conversation_id      BIGINT NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- 'admin' grupėse gali pakeisti pavadinimą, pridėti/šalinti narius.
  -- DM'uose abu nariai = 'member' (paliekam paprastai).
  role                 TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  joined_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Last read pointer'is — newer-than šitos timestamp messages = unread.
  -- Atnaujinama API endpoint'u POST /api/chat/conversations/:id/read.
  last_read_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Mute notifikacijas (vis tiek matys žinutes, bet badge nemirgės).
  notifications_muted  BOOLEAN NOT NULL DEFAULT false,
  -- Soft leave — paliekam history matomą, bet conversation nebepasirodo
  -- sidebar'e (viskas, ką UI sufiltruoja).
  left_at              TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_participants_user
  ON public.chat_participants (user_id, left_at)
  WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_participants_conversation
  ON public.chat_participants (conversation_id);

-- ──────────────────────────────────────────────────────────────
-- 3. MESSAGES
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id                BIGSERIAL PRIMARY KEY,
  conversation_id   BIGINT NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body              TEXT NOT NULL,
  -- NULL = top-level žinutė; jei užpildyta — atsakymas thread'e.
  parent_message_id BIGINT REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  -- Cached counters thread'ams (atnaujinama trigger'iu).
  reply_count       INT NOT NULL DEFAULT 0,
  last_reply_at     TIMESTAMPTZ,
  edited_at         TIMESTAMPTZ,
  -- Soft delete — kad thread root'ai nesigriautų. UI rodo "Žinutė ištrinta".
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pagrindinis paginate index'as: konkretus pokalbis, top-level, naujausios
-- viršuje. Sąlyga "WHERE parent_message_id IS NULL" daro indeksą daug
-- mažesnį (thread atsakymai laikomi atskirai).
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv_top
  ON public.chat_messages (conversation_id, created_at DESC)
  WHERE parent_message_id IS NULL AND deleted_at IS NULL;

-- Thread atsakymams (root → replies)
CREATE INDEX IF NOT EXISTS idx_chat_messages_parent
  ON public.chat_messages (parent_message_id, created_at ASC)
  WHERE parent_message_id IS NOT NULL;

-- Unread skaičiavimui (last_read_at < created_at filter'is per user'io
-- pokalbius). conversation_id + created_at greitas range scan.
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv_created
  ON public.chat_messages (conversation_id, created_at);

-- ──────────────────────────────────────────────────────────────
-- 4. REACTIONS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_reactions (
  message_id  BIGINT NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_chat_reactions_message
  ON public.chat_reactions (message_id);

-- ──────────────────────────────────────────────────────────────
-- 5. TRIGGERS
-- ──────────────────────────────────────────────────────────────

-- Po naujos žinutės — atnaujiname conversation last_message_* + jei yra
-- parent — bumping reply_count + last_reply_at parent'e.
CREATE OR REPLACE FUNCTION public.tg_chat_after_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.parent_message_id IS NULL THEN
    -- Top-level žinutė — bumpinam conversation preview/last_message.
    UPDATE public.chat_conversations
       SET last_message_at      = NEW.created_at,
           last_message_id      = NEW.id,
           last_message_preview = LEFT(COALESCE(NEW.body, ''), 240),
           last_message_user_id = NEW.user_id
     WHERE id = NEW.conversation_id;
  ELSE
    -- Thread atsakymas — bumpinam parent'o reply count ir conversation
    -- top-level neliečiam (Slack rodo thread'us tik thread panel'yje).
    UPDATE public.chat_messages
       SET reply_count   = reply_count + 1,
           last_reply_at = NEW.created_at
     WHERE id = NEW.parent_message_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS chat_after_message_insert ON public.chat_messages;
CREATE TRIGGER chat_after_message_insert
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.tg_chat_after_message_insert();

-- Soft delete sync — jei žinutė deleted_at nustatomas ir tai buvo
-- last_message — paliekam preview kaip "Žinutė ištrinta" (UI kosmetika).
CREATE OR REPLACE FUNCTION public.tg_chat_after_message_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE public.chat_conversations
       SET last_message_preview = '— ištrinta žinutė —'
     WHERE id = NEW.conversation_id
       AND last_message_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS chat_after_message_update ON public.chat_messages;
CREATE TRIGGER chat_after_message_update
AFTER UPDATE ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.tg_chat_after_message_update();

-- ──────────────────────────────────────────────────────────────
-- 6. RLS — leidžiam SELECT visiems authenticated/anon, write tik service_role
-- ──────────────────────────────────────────────────────────────
-- Pastaba: visi rašymai eina per /api/chat/* (service role bypass'ina RLS),
-- tad write policy'os čia ribojamos. Realtime kanalams (anon key) leidžiam
-- SELECT, kad postgres_changes subscription'ai veiktų.
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_reactions     ENABLE ROW LEVEL SECURITY;

-- SELECT'ai — atviri (filter'is daromas API + realtime channel filter'iu).
-- Esamame projekte tai jau pattern'as: comments/likes/etc taip pat eina per
-- service role + API gating, ne per RLS.
DROP POLICY IF EXISTS chat_conv_read     ON public.chat_conversations;
DROP POLICY IF EXISTS chat_part_read     ON public.chat_participants;
DROP POLICY IF EXISTS chat_msg_read      ON public.chat_messages;
DROP POLICY IF EXISTS chat_react_read    ON public.chat_reactions;

CREATE POLICY chat_conv_read  ON public.chat_conversations FOR SELECT USING (true);
CREATE POLICY chat_part_read  ON public.chat_participants  FOR SELECT USING (true);
CREATE POLICY chat_msg_read   ON public.chat_messages      FOR SELECT USING (true);
CREATE POLICY chat_react_read ON public.chat_reactions     FOR SELECT USING (true);

-- ──────────────────────────────────────────────────────────────
-- 7. REALTIME PUBLICATION
-- ──────────────────────────────────────────────────────────────
-- Supabase Realtime publikuoja postgres_changes per `supabase_realtime`
-- publication. Pridedam mūsų lenteles. ALTER PUBLICATION ADD klysta jei
-- jau yra — apgaubiam DO/EXCEPTION.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversations;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_participants;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_reactions;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

-- ──────────────────────────────────────────────────────────────
-- 8. HELPER VIEW: conversation summary su unread skaičiumi
-- ──────────────────────────────────────────────────────────────
-- Greitai grąžina sąrašą su: dalyviais, last_message preview, unread count.
-- Naudojama sidebar'ui — viena kelionė į DB vietoj N+1 query.
CREATE OR REPLACE FUNCTION public.chat_user_conversations(p_user_id UUID)
RETURNS TABLE (
  id                     BIGINT,
  type                   TEXT,
  name                   TEXT,
  photo_url              TEXT,
  topic                  TEXT,
  last_message_at        TIMESTAMPTZ,
  last_message_id        BIGINT,
  last_message_preview   TEXT,
  last_message_user_id   UUID,
  last_read_at           TIMESTAMPTZ,
  notifications_muted    BOOLEAN,
  unread_count           BIGINT,
  participants           JSONB
)
LANGUAGE sql
STABLE
AS $$
  WITH my_convs AS (
    SELECT c.*, p.last_read_at, p.notifications_muted
      FROM public.chat_conversations c
      JOIN public.chat_participants p
        ON p.conversation_id = c.id
       AND p.user_id = p_user_id
       AND p.left_at IS NULL
  ),
  unread AS (
    SELECT m.conversation_id, COUNT(*)::BIGINT AS cnt
      FROM public.chat_messages m
      JOIN my_convs mc ON mc.id = m.conversation_id
     WHERE m.user_id <> p_user_id
       AND m.parent_message_id IS NULL
       AND m.deleted_at IS NULL
       AND m.created_at > mc.last_read_at
     GROUP BY m.conversation_id
  ),
  parts AS (
    SELECT
      cp.conversation_id,
      jsonb_agg(
        jsonb_build_object(
          'user_id',     pr.id,
          'username',    pr.username,
          'full_name',   pr.full_name,
          'avatar_url',  pr.avatar_url,
          'role',        cp.role
        )
        ORDER BY pr.full_name NULLS LAST
      ) AS participants
      FROM public.chat_participants cp
      JOIN public.profiles pr ON pr.id = cp.user_id
      JOIN my_convs mc        ON mc.id = cp.conversation_id
     WHERE cp.left_at IS NULL
     GROUP BY cp.conversation_id
  )
  SELECT
    mc.id,
    mc.type,
    mc.name,
    mc.photo_url,
    mc.topic,
    mc.last_message_at,
    mc.last_message_id,
    mc.last_message_preview,
    mc.last_message_user_id,
    mc.last_read_at,
    mc.notifications_muted,
    COALESCE(u.cnt, 0)            AS unread_count,
    COALESCE(parts.participants, '[]'::jsonb) AS participants
    FROM my_convs mc
    LEFT JOIN unread u  ON u.conversation_id  = mc.id
    LEFT JOIN parts     ON parts.conversation_id = mc.id
   ORDER BY mc.last_message_at DESC;
$$;

COMMENT ON FUNCTION public.chat_user_conversations(UUID) IS
  'Sidebar feed: visos vartotojo conversations su unread + dalyvių preview. Sortuotas pagal last_message_at DESC.';

-- ──────────────────────────────────────────────────────────────
-- 9. HELPER FUNCTION: total unread for nav badge
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.chat_total_unread(p_user_id UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(uc.unread_count), 0)
    FROM public.chat_user_conversations(p_user_id) uc
   WHERE uc.notifications_muted = false;
$$;

-- ──────────────────────────────────────────────────────────────
-- 10. UTILITY: get-or-create DM conversation tarp dviejų vartotojų
-- ──────────────────────────────────────────────────────────────
-- Slack-style: naujas pokalbis tarp A ir B niekada nesidvigubina. Šita
-- funkcija atominiu būdu randa egzistuojantį DM arba kuria naują.
CREATE OR REPLACE FUNCTION public.chat_get_or_create_dm(p_user_a UUID, p_user_b UUID)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_conv_id BIGINT;
BEGIN
  IF p_user_a = p_user_b THEN
    RAISE EXCEPTION 'Cannot create DM with self';
  END IF;

  -- Bandom rasti egzistuojantį DM'ą su lygiai šitais dviem nariais.
  SELECT c.id INTO v_conv_id
    FROM public.chat_conversations c
    JOIN public.chat_participants p1 ON p1.conversation_id = c.id AND p1.user_id = p_user_a AND p1.left_at IS NULL
    JOIN public.chat_participants p2 ON p2.conversation_id = c.id AND p2.user_id = p_user_b AND p2.left_at IS NULL
   WHERE c.type = 'dm'
     AND (SELECT COUNT(*) FROM public.chat_participants p3 WHERE p3.conversation_id = c.id AND p3.left_at IS NULL) = 2
   LIMIT 1;

  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  -- Sukuriam naują.
  INSERT INTO public.chat_conversations (type, created_by)
       VALUES ('dm', p_user_a)
    RETURNING id INTO v_conv_id;

  INSERT INTO public.chat_participants (conversation_id, user_id) VALUES (v_conv_id, p_user_a);
  INSERT INTO public.chat_participants (conversation_id, user_id) VALUES (v_conv_id, p_user_b);

  RETURN v_conv_id;
END $$;

-- ============================================================
-- DONE
-- ============================================================
