-- ============================================================
-- 2026-05-02 — Blog supaprastinimas: drop quick/journal, add event review
-- ============================================================
-- Po pirmo iteracijos paaiškėjo, kad:
--   - quick mode'as buvo confusing — paste-and-go logika dabar gyvena
--     pačiame editor'iuje (Iframe paste rules), tad atskiro tipo nereikia
--   - dienoraštis nesiskyrė nuo article — drop'inam, kad nebūtų triviališkų
--     dubliuotų tipų
--   - vartotojai nori "Renginio apžvalga" — recenzija events lentelei
--
-- Naujas tipų rinkinys: article (default), review, translation, creation, event
-- Visi quick/journal įrašai konvertuojami į article (saugu — tai tik
-- defaultinė vertė, neprarandam content'o).
-- ============================================================

-- ── 1. Konvertuojam quick/journal į article ───────────────────────────────
UPDATE public.blog_posts
   SET post_type = 'article'
 WHERE post_type IN ('quick', 'journal');

-- ── 2. Atnaujinam CHECK constraint ────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blog_posts_post_type_check') THEN
    ALTER TABLE public.blog_posts DROP CONSTRAINT blog_posts_post_type_check;
  END IF;
END $$;

ALTER TABLE public.blog_posts
  ADD CONSTRAINT blog_posts_post_type_check
  CHECK (post_type IN ('article', 'review', 'translation', 'creation', 'event'));

-- ── 3. Pridedam target_event_id ───────────────────────────────────────────
-- events.id yra UUID (skirtingai nuo artist/album/track INTEGER ID'ų)
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS target_event_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'blog_posts_target_event_fk'
  ) THEN
    ALTER TABLE public.blog_posts
      ADD CONSTRAINT blog_posts_target_event_fk
      FOREIGN KEY (target_event_id) REFERENCES public.events(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_blog_posts_target_event
  ON public.blog_posts (target_event_id, published_at DESC)
  WHERE target_event_id IS NOT NULL AND status = 'published';

-- ── 4. Update'inam type indeksus pasikeitusiam tipų rinkiniui ─────────────
-- (esamos indeksai yra partial be tipo apribojimo, tad jie tinka, tiesiog
-- update'inam komentarą)

COMMENT ON COLUMN public.blog_posts.post_type IS
  'Discriminator: article|review|translation|creation|event. Article = full text (default), review = + rating + target_artist/album/track, translation = + target_track (LT lyrics), creation = original work, event = renginio apžvalga su target_event_id';
