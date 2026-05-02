-- ============================================================
-- 2026-05-02 — Topas blog tipas (vartotojo top'ai)
-- ============================================================
-- Naujas post tipas leidžiantis nariams kurti "TOP 10 LT albumų", "Mano
-- mėgstamiausios dainos" ir pan. Sąrašuose elementai gali būti:
--   - music.lt entity (artist/album/track) — su nuoroda į puslapį
--   - custom freeform įrašas — title + optional artist + image_url
--
-- Architektūra: list_items JSONB stulpelis, ne atskira lentelė. JSONB
-- patogu MVP'ui — viena užklausa duoda full post data, vartotojas keičia
-- viską kartu, nereikia query optimization'o (tik 1-50 elementų per topą).
-- Vėliau galima migruoti į blog_post_list_items lentelę jei prireiks
-- cross-cutting query'ų ("kiek topų įtraukė šitą dainą").
-- ============================================================

-- ── 1. Pridedam 'topas' į CHECK constraint'ą ──────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blog_posts_post_type_check') THEN
    ALTER TABLE public.blog_posts DROP CONSTRAINT blog_posts_post_type_check;
  END IF;
END $$;

ALTER TABLE public.blog_posts
  ADD CONSTRAINT blog_posts_post_type_check
  CHECK (post_type IN ('article', 'review', 'translation', 'creation', 'event', 'topas'));

-- ── 2. list_items JSONB ───────────────────────────────────────────────────
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS list_items JSONB NOT NULL DEFAULT '[]'::JSONB;

-- ── 3. GIN indeksas list_items @> queries (pvz. "topai įtraukę track 42") ─
CREATE INDEX IF NOT EXISTS idx_blog_posts_list_items_gin
  ON public.blog_posts USING GIN (list_items);

COMMENT ON COLUMN public.blog_posts.list_items IS
  'Topas tipo įrašuose — JSONB array of {rank, type, entity_id, entity_slug, title, artist, image_url, comment}. Tuščias array kitiems tipams.';
