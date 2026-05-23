-- ============================================================
-- 2026-05-23 — Kūrybos subtype (Eilėraštis, Novelė, ...) column
-- ============================================================
-- Music.lt legacy „kūryba" turinį skirsto į subtype'us: Eilėraštis,
-- Novelė, Miniatiūra, Apsakymas, Esė, Proza, Daina. Anksčiau ši informacija
-- buvo metama į `tags` array'ų, bet tags rendering'as parodydavo kaip chip'us
-- ant post'ų ir nebuvo aiškiai sortable.
--
-- Pridedam dedicated `creation_subtype` stulpelį, kad galėtume filtruoti
-- /blog feed'ą per `post_type='creation' AND creation_subtype='Eilėraštis'`.
-- ============================================================

ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS creation_subtype TEXT;

-- Index'as filter'avimui per (post_type, creation_subtype, published_at DESC)
CREATE INDEX IF NOT EXISTS idx_blog_posts_creation_subtype
  ON public.blog_posts (creation_subtype, published_at DESC)
  WHERE creation_subtype IS NOT NULL AND status = 'published';

COMMENT ON COLUMN public.blog_posts.creation_subtype IS
  'Subtype for post_type=''creation'': Eilėraštis | Novelė | Miniatiūra | Apsakymas | Esė | Proza | Daina. NULL kitiems tipams.';

-- Backfill iš tags[] (jei seniau migracija įdėjo subtype į tags array'ų)
UPDATE public.blog_posts
   SET creation_subtype = sub.tag
  FROM (
    SELECT id, tag
      FROM public.blog_posts,
           unnest(tags) AS tag
     WHERE post_type = 'creation'
       AND tag IN ('Eilėraštis', 'Novelė', 'Miniatiūra', 'Apsakymas',
                   'Esė', 'Proza', 'Daina', 'kūryba')
       AND tag != 'kūryba'   -- skip generic 'kūryba' tag
  ) sub
 WHERE blog_posts.id = sub.id
   AND blog_posts.creation_subtype IS NULL;
