-- ============================================================
-- 2026-04-27 — entity_comments lentelė
-- ============================================================
-- Music.lt tracks/albums turi savo "Komentarai" sekciją (atskira nuo forum
-- threadų). Saugom čia su entity_type discriminator'iu — viena lentelė
-- abiems tipams. forum_posts paliekam tik thread/news komentarams.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.entity_comments (
  legacy_id           BIGINT PRIMARY KEY,
  entity_type         TEXT NOT NULL CHECK (entity_type IN ('track', 'album')),
  entity_legacy_id    BIGINT NOT NULL,
  page_number         INT,
  author_username     TEXT,
  author_numeric_id   INT,
  author_avatar_url   TEXT,
  created_at          TIMESTAMPTZ,
  like_count          INT DEFAULT 0,
  content_html        TEXT,
  content_text        TEXT,
  parent_legacy_id    BIGINT,
  music_attachments   JSONB,
  is_deleted          BOOLEAN NOT NULL DEFAULT false,
  imported_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entity_comments_entity
  ON public.entity_comments (entity_type, entity_legacy_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_entity_comments_author
  ON public.entity_comments (author_username);

COMMENT ON TABLE public.entity_comments IS
  'Music.lt komentarai prie konkrečių dainų ir albumų. Atskira nuo forum_posts (kurie skirti thread/news komentarams).';
