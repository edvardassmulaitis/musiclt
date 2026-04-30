-- ============================================================
-- 2026-04-30 — Diskusijų jungimas su pokalbių sąsaja
-- ============================================================
-- Tikslas: vartotojas mato savo diskusijas (kuriose komentavo arba kūrė)
-- /pokalbiai sidebar'e atskira sekcija, šalia DM/grupių.
--
-- Iš žvalgybos paaiškėjo:
--   • `discussions` lentelė YRA (slug, title, body, user_id, comment_count,
--     last_comment_at, ir t.t.) — sukurta per app pirmą kartą bet ne migracijoj
--   • `comments` lentelė turi track_id/album_id/news_id/event_id stulpelius,
--     bet NĖRA discussion_id — todėl /diskusijos/[slug] page'as siunčia
--     entity_type=discussion bet API jo nepriima → 0 komentarų galima rašyti
--
-- Šitoje migracijoje:
--   1. Patikrinam kad `discussions` lentelė egzistuoja (jei ne — sukuriam)
--   2. Pridedam `comments.discussion_id` su FK + index (kad galėtume
--      atrasti, kuriose diskusijose user'is komentavo)
--   3. Trigger'is — kai įdedamas naujas comments.discussion_id,
--      automatiškai bumpinam discussions.comment_count + last_comment_at
--   4. Realtime publication ant `discussions` (kad sidebar atnaujintųsi
--      live, kai keičiasi last_comment_at)
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. DISCUSSIONS — užtikrinam kad lentelė egzistuoja
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.discussions (
  id              BIGSERIAL PRIMARY KEY,
  slug            TEXT UNIQUE NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT,
  user_id         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_name     TEXT,
  author_avatar   TEXT,
  tags            JSONB DEFAULT '[]'::jsonb,
  is_pinned       BOOLEAN NOT NULL DEFAULT false,
  is_locked       BOOLEAN NOT NULL DEFAULT false,
  is_deleted      BOOLEAN NOT NULL DEFAULT false,
  comment_count   INT NOT NULL DEFAULT 0,
  like_count      INT NOT NULL DEFAULT 0,
  view_count      INT NOT NULL DEFAULT 0,
  last_comment_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discussions_user
  ON public.discussions (user_id, is_deleted, last_comment_at DESC);

-- ──────────────────────────────────────────────────────────────
-- 2. COMMENTS — discussion_id FK + index
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS discussion_id BIGINT REFERENCES public.discussions(id) ON DELETE CASCADE;

-- Greitam GET'ui pagal diskusiją (page'as fetch'ina komentarus per
-- entity_type=discussion + entity_id) ir DISTINCT ON pagal discussion_id
-- + author_id (sidebar'ui — kuriose diskusijose user'is komentavo).
CREATE INDEX IF NOT EXISTS idx_comments_discussion
  ON public.comments (discussion_id, created_at DESC)
  WHERE discussion_id IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_comments_author_discussion
  ON public.comments (author_id, discussion_id)
  WHERE discussion_id IS NOT NULL AND is_deleted = false;

-- ──────────────────────────────────────────────────────────────
-- 3. TRIGGER — bumpinam discussions.comment_count + last_comment_at
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_discussion_bump_on_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.discussion_id IS NOT NULL AND NEW.is_deleted = false THEN
    UPDATE public.discussions
       SET comment_count   = comment_count + 1,
           last_comment_at = NEW.created_at
     WHERE id = NEW.discussion_id;
  ELSIF TG_OP = 'UPDATE'
        AND NEW.discussion_id IS NOT NULL
        AND NEW.is_deleted = true
        AND OLD.is_deleted = false THEN
    -- Soft delete'as → decrement
    UPDATE public.discussions
       SET comment_count = GREATEST(0, comment_count - 1)
     WHERE id = NEW.discussion_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS discussion_bump_on_comment ON public.comments;
CREATE TRIGGER discussion_bump_on_comment
AFTER INSERT OR UPDATE OF is_deleted ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.tg_discussion_bump_on_comment();

-- ──────────────────────────────────────────────────────────────
-- 4. REALTIME publication — kad sidebar gautų live updates
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.discussions;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

-- ──────────────────────────────────────────────────────────────
-- 5. RPC — vartotojo "my discussions" feed (created OR commented)
-- ──────────────────────────────────────────────────────────────
-- Grąžina: visos diskusijos kuriose user'is sukūrė ARBA komentavo,
-- distinct, sortuotos pagal last_comment_at DESC.
-- `involvement` stulpelis: 'created' jei autorius, kitaip 'commented'.
CREATE OR REPLACE FUNCTION public.chat_my_discussions(p_user_id UUID, p_limit INT DEFAULT 30)
RETURNS TABLE (
  id              BIGINT,
  slug            TEXT,
  title           TEXT,
  comment_count   INT,
  last_comment_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ,
  is_author       BOOLEAN,
  involvement     TEXT
)
LANGUAGE sql
STABLE
AS $$
  WITH involved AS (
    SELECT d.id, d.slug, d.title, d.comment_count, d.last_comment_at,
           d.created_at, true AS is_author, 'created'::TEXT AS involvement
      FROM public.discussions d
     WHERE d.user_id = p_user_id AND d.is_deleted = false
    UNION
    SELECT d.id, d.slug, d.title, d.comment_count, d.last_comment_at,
           d.created_at, false AS is_author, 'commented'::TEXT AS involvement
      FROM public.discussions d
      JOIN public.comments c ON c.discussion_id = d.id
     WHERE c.author_id = p_user_id
       AND c.is_deleted = false
       AND d.is_deleted = false
       AND d.user_id != p_user_id  -- jei jau autorius — paliekam tik 'created' eilutę
  )
  SELECT DISTINCT ON (id) *
    FROM involved
   ORDER BY id, (CASE WHEN is_author THEN 0 ELSE 1 END), last_comment_at DESC NULLS LAST
$$;

-- Wrapper'is iš tikro sortavimo:
CREATE OR REPLACE FUNCTION public.chat_my_discussions_sorted(p_user_id UUID, p_limit INT DEFAULT 30)
RETURNS TABLE (
  id              BIGINT,
  slug            TEXT,
  title           TEXT,
  comment_count   INT,
  last_comment_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ,
  is_author       BOOLEAN,
  involvement     TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT * FROM public.chat_my_discussions(p_user_id, p_limit)
   ORDER BY COALESCE(last_comment_at, created_at) DESC NULLS LAST
   LIMIT p_limit
$$;

COMMENT ON FUNCTION public.chat_my_discussions_sorted IS
  'Sidebar feed'as user''io diskusijoms /pokalbiai page'e. Grąžina visus thread''us kuriuose dalyvauja (sukūrė arba komentavo).';
