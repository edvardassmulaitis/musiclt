-- Allow entity_type='forum_post' in unified `likes` lentelėje.
--
-- Music.lt'os forum thread'uose user'iai gali like'inti pavienius komentarus.
-- Šitą info reikia užfiksuoti scrape metu, kad naujoje versijoje matytume,
-- kas kam paliko 'like' (per LikesModal modal'į). Komentarų likes saugom su
-- entity_type='forum_post' ir entity_legacy_id = forum_posts.legacy_id.

ALTER TABLE public.likes
  DROP CONSTRAINT IF EXISTS likes_entity_type_check;

ALTER TABLE public.likes
  ADD CONSTRAINT likes_entity_type_check
  CHECK (entity_type IN ('artist','album','track','event','thread','post','comment','forum_post'));

-- Index forum_post lookup'ui — UI kraunant thread page nori greitai gauti
-- visus likers per WHERE entity_type='forum_post' AND entity_legacy_id IN (...).
CREATE INDEX IF NOT EXISTS idx_likes_forum_post
  ON public.likes (entity_type, entity_legacy_id)
  WHERE entity_type = 'forum_post';
