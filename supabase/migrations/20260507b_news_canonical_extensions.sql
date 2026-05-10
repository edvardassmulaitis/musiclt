-- News canonical pipeline'as papildymai:
--   - discussions.artist_id2 — antras susijes atlikejas (multi-artist news)
--   - discussions.related_tracks — JSONB array tracked song refs (canonical news_songs adapter)
--   - likes constraint extends with 'news' — kad news article like'ai (atskirti
--     nuo comment'ų likes) galetu būti DB

ALTER TABLE public.discussions
  ADD COLUMN IF NOT EXISTS artist_id2 BIGINT REFERENCES public.artists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS related_tracks JSONB;

CREATE INDEX IF NOT EXISTS idx_discussions_artist_id2
  ON public.discussions (artist_id2)
  WHERE artist_id2 IS NOT NULL;

-- Extend likes constraint with 'news' (jau buvo: artist/album/track/event/thread/post/comment/forum_post)
ALTER TABLE public.likes
  DROP CONSTRAINT IF EXISTS likes_entity_type_check;

ALTER TABLE public.likes
  ADD CONSTRAINT likes_entity_type_check
  CHECK (entity_type IN ('artist','album','track','event','thread','post','comment','forum_post','news'));

CREATE INDEX IF NOT EXISTS idx_likes_news
  ON public.likes (entity_type, entity_id)
  WHERE entity_type = 'news';
