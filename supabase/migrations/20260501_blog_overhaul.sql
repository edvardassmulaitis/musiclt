-- ============================================================
-- 2026-05-01 — Blog overhaul: post types, tags, type-specific fields
-- ============================================================
-- Tikslas: paversti blog_posts iš generinio "title+content" modelio į
-- substack-like multi-modal sistemą. Vienas vartotojas vienoje vietoje gali
-- skelbti:
--   - article    : klasikinis ilgas tekstas (current default)
--   - quick      : paste-and-go video/embed kortelė su 1-2 sakinių komentaru
--   - review     : recenzija susieta su konkretiu music.lt album/track + rating
--   - translation: lietuviškas vertimas su nuoroda į originalą
--   - creation   : asmeninė kūryba (eilėraštis, esė, fiction)
--   - journal    : asmeninis dienoraštis / koncerto patirtis
--
-- Plus: lankstūs free-form tagai (TEXT[]) cross-cutting kategorizacijai —
-- tas pats įrašas gali turėti tagus ['LT', 'jazz', '90s'] nepriklausomai nuo
-- post_type. Vėliau migracija iš seno music.lt įmes legacy entries kaip
-- 'article'/'creation' su atitinkamais tagais.
--
-- NB: blog_posts ir blogs lentelės jau egzistuoja DB (anksčiau sukurtos
-- rankiniu būdu, be migracijos failo). Šis failas tik praplečia esamą
-- struktūrą per ALTER TABLE ADD COLUMN IF NOT EXISTS — saugu paleisti
-- pakartotinai ir ant esamos lentelės.
-- ============================================================

-- ── 1. blog_posts: post_type discriminator ────────────────────────────────
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS post_type TEXT NOT NULL DEFAULT 'article';

-- CHECK constraint atskirai (ALTER TABLE ADD COLUMN IF NOT EXISTS nepalaiko
-- inline CHECK su NOT VALID). Drop'inam senesnį jei yra, tada pridedam.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blog_posts_post_type_check') THEN
    ALTER TABLE public.blog_posts DROP CONSTRAINT blog_posts_post_type_check;
  END IF;
END $$;

ALTER TABLE public.blog_posts
  ADD CONSTRAINT blog_posts_post_type_check
  CHECK (post_type IN ('article', 'quick', 'review', 'translation', 'creation', 'journal'));

-- ── 2. Type-specific fields (visi nullable) ───────────────────────────────

-- Recenzija: rating ir susietas music.lt entity
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS rating SMALLINT,
  ADD COLUMN IF NOT EXISTS target_artist_id BIGINT,
  ADD COLUMN IF NOT EXISTS target_album_id  INTEGER,
  ADD COLUMN IF NOT EXISTS target_track_id  INTEGER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blog_posts_rating_range') THEN
    ALTER TABLE public.blog_posts DROP CONSTRAINT blog_posts_rating_range;
  END IF;
END $$;

ALTER TABLE public.blog_posts
  ADD CONSTRAINT blog_posts_rating_range
  CHECK (rating IS NULL OR (rating BETWEEN 1 AND 10));

-- Vertimas: nuoroda į originalą, autorius, kalba
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS original_url    TEXT,
  ADD COLUMN IF NOT EXISTS original_author TEXT,
  ADD COLUMN IF NOT EXISTS original_lang   TEXT;       -- ISO 639-1 ('en', 'de', ...)

-- Quick / generinis embed (YouTube, Spotify, Bandcamp, SoundCloud, IG, Twitter)
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS embed_url           TEXT,
  ADD COLUMN IF NOT EXISTS embed_type          TEXT,  -- 'youtube' | 'spotify' | 'soundcloud' | 'bandcamp' | 'instagram' | 'twitter' | 'other'
  ADD COLUMN IF NOT EXISTS embed_thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS embed_title         TEXT,
  ADD COLUMN IF NOT EXISTS embed_html          TEXT;

-- ── 3. Tags (TEXT[] su GIN indeksu — paprasta MVP, vėliau galim normalizuoti) ─
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

-- ── 4. Foreign key'us pridedam atskirai (NOT VALID, vėliau VALIDATE) ──────
-- IF NOT EXISTS pattern per pg_constraint check, kad migracija būtų
-- idempotentinė.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'blog_posts_target_artist_fk'
  ) THEN
    ALTER TABLE public.blog_posts
      ADD CONSTRAINT blog_posts_target_artist_fk
      FOREIGN KEY (target_artist_id) REFERENCES public.artists(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'blog_posts_target_album_fk'
  ) THEN
    ALTER TABLE public.blog_posts
      ADD CONSTRAINT blog_posts_target_album_fk
      FOREIGN KEY (target_album_id) REFERENCES public.albums(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'blog_posts_target_track_fk'
  ) THEN
    ALTER TABLE public.blog_posts
      ADD CONSTRAINT blog_posts_target_track_fk
      FOREIGN KEY (target_track_id) REFERENCES public.tracks(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 5. Indeksai feed'ui ───────────────────────────────────────────────────
-- Naujausių publikuotų sąrašui (visi tipai)
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_recent
  ON public.blog_posts (published_at DESC)
  WHERE status = 'published' AND published_at IS NOT NULL;

-- Filtrui pagal tipą + DESC pagal datą
CREATE INDEX IF NOT EXISTS idx_blog_posts_type_published
  ON public.blog_posts (post_type, published_at DESC)
  WHERE status = 'published' AND published_at IS NOT NULL;

-- Tag GIN — palaiko `tags @> ARRAY['jazz']` ir `tags && ARRAY['jazz','rock']`
CREATE INDEX IF NOT EXISTS idx_blog_posts_tags_gin
  ON public.blog_posts USING GIN (tags);

-- Per-target indeksai: kai atveriam album/track puslapį, parodom related blog įrašus
CREATE INDEX IF NOT EXISTS idx_blog_posts_target_album
  ON public.blog_posts (target_album_id, published_at DESC)
  WHERE target_album_id IS NOT NULL AND status = 'published';

CREATE INDEX IF NOT EXISTS idx_blog_posts_target_track
  ON public.blog_posts (target_track_id, published_at DESC)
  WHERE target_track_id IS NOT NULL AND status = 'published';

CREATE INDEX IF NOT EXISTS idx_blog_posts_target_artist
  ON public.blog_posts (target_artist_id, published_at DESC)
  WHERE target_artist_id IS NOT NULL AND status = 'published';

-- ── 6. Komentarai ─────────────────────────────────────────────────────────
COMMENT ON COLUMN public.blog_posts.post_type IS
  'Discriminator: article|quick|review|translation|creation|journal. Quick = embed-only, article = full text, review = + rating + target_*, translation = + original_*';
COMMENT ON COLUMN public.blog_posts.tags IS
  'Free-form Lithuanian/English tagai cross-cutting kategorizacijai. GIN indeksas palaiko @> ir && operatorius.';
COMMENT ON COLUMN public.blog_posts.embed_type IS
  'Auto-detected pagal embed_url: youtube|spotify|soundcloud|bandcamp|instagram|twitter|other.';
