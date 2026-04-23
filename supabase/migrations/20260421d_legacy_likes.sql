-- Legacy likes — kas ką like'ino senoje music.lt sistemoje
--
-- Šaltinis: scrape iš https://www.music.lt/?rate;list.{entity_type};id.{legacy_id}
-- Pvz. Depeche Mode (artist, id=10) → 638 like'intojai.
--
-- entity_type mapping:
--   'artist'  — ?rate;list.5;id.X
--   'album'   — ?rate;list.2;id.X (JS-rendered — gal neveiks be login)
--   'track'   — ?rate;list.1;id.X
--   'message' — ?rate;list.53;id.X (forum post)

CREATE TABLE IF NOT EXISTS public.legacy_likes (
    id BIGSERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('artist','album','track','message','other')),
    entity_legacy_id INTEGER NOT NULL,
    user_username TEXT NOT NULL,
    -- Rank from like list page: "Naujokas" / "Atradimas" / etc.
    user_rank TEXT,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    source TEXT DEFAULT 'legacy_scrape_v1',

    -- Unique pair: same user neturi du kartus like'inti tą patį daiktą
    UNIQUE (entity_type, entity_legacy_id, user_username)
);

CREATE INDEX IF NOT EXISTS idx_legacy_likes_entity
  ON public.legacy_likes (entity_type, entity_legacy_id);
CREATE INDEX IF NOT EXISTS idx_legacy_likes_user
  ON public.legacy_likes (user_username);

COMMENT ON TABLE public.legacy_likes IS
  'Like history from legacy music.lt. Each row = user likes an entity (artist/album/track/forum-post).';

-- RLS: public read
ALTER TABLE public.legacy_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read" ON public.legacy_likes;
CREATE POLICY "public read" ON public.legacy_likes FOR SELECT USING (true);

-- Convenience view: like summary per artist
CREATE OR REPLACE VIEW public.v_artist_like_stats AS
SELECT
  a.id AS artist_id,
  a.name,
  a.slug,
  a.legacy_id,
  COUNT(l.id) AS like_count
FROM public.artists a
LEFT JOIN public.legacy_likes l
  ON l.entity_type = 'artist' AND l.entity_legacy_id = a.legacy_id
WHERE a.source IN ('legacy_scrape_v1','legacy+wikipedia')
GROUP BY a.id, a.name, a.slug, a.legacy_id
ORDER BY like_count DESC NULLS LAST;

-- Top likers
CREATE OR REPLACE VIEW public.v_top_likers AS
SELECT
  user_username,
  COUNT(*) AS total_likes,
  COUNT(*) FILTER (WHERE entity_type='artist') AS artist_likes,
  COUNT(*) FILTER (WHERE entity_type='album')  AS album_likes,
  COUNT(*) FILTER (WHERE entity_type='track')  AS track_likes
FROM public.legacy_likes
GROUP BY user_username
ORDER BY total_likes DESC;
