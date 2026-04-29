-- ============================================================
-- 2026-04-30 — `notifications` lentelė (in-app notifications system)
-- ============================================================
-- Vienas centrinis store visiems user-facing notification'ams. `type`
-- discriminator + `data` JSONB leidžia laisvai pridėti naujus event tipus
-- be schema migracijų. Pirmoji versija dengia:
--   - 'comment_reply'         — kažkas atsakė į tavo komentarą
--   - 'entity_comment'        — kažkas pakomentavo prie track/album/blog kuris
--                               yra "tavo" (author/uploader)
--   - 'comment_like'          — kažkas palaikino tavo komentarą
--   - 'blog_like'             — kažkas palaikino tavo blogo įrašą
--   - 'blog_comment'          — kažkas pakomentavo tavo blogo įrašą
--   - 'favorite_artist_track' — naujas track'as nuo tavo mėgstamos grupės
--   - 'daily_song_winner'     — tavo nominuotas track'as laimėjo dienos dainą
--
-- Vėliau lengvai pridėsim 'event_reminder', 'mention', 'thread_reply', etc.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id                BIGSERIAL PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type              TEXT NOT NULL,
  actor_id          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_username    TEXT,
  actor_full_name   TEXT,
  actor_avatar_url  TEXT,
  entity_type       TEXT,                -- 'track' | 'album' | 'artist' | 'blog' | 'comment' | 'event' | 'thread' | 'post'
  entity_id         BIGINT,
  url               TEXT,                -- direct deep-link client'ui
  title             TEXT,                -- short headline ("Naujas atsakymas į tavo komentarą")
  snippet           TEXT,                -- preview text (first ~140 chars of comment, etc)
  data              JSONB,               -- extra context (track name, artist name, etc)
  read_at           TIMESTAMPTZ,         -- NULL = unread
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Greitai pateikt unread count per user_id
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id)
  WHERE read_at IS NULL;

-- Sąrašui (DESC by created_at)
CREATE INDEX IF NOT EXISTS idx_notifications_user_recent
  ON public.notifications (user_id, created_at DESC);

-- Dedup pagalba (kad tas pats user_id-actor-entity-type pora nepasikartotų
-- per trumpą laiką; enforce'inam application layer'yje, indekso pakanka).
CREATE INDEX IF NOT EXISTS idx_notifications_dedup
  ON public.notifications (user_id, type, entity_type, entity_id, actor_id);

COMMENT ON TABLE public.notifications IS
  'In-app notifications. type discriminator + data JSONB. read_at IS NULL = unread.';

-- ============================================================
-- profile_favorite_artists — užtikrinam kad lentelė egzistuoja
-- ============================================================
-- Šita lentelė jau naudojama lib/supabase-blog.ts'e (getProfileFavoriteArtists),
-- bet nerasta jokios CREATE TABLE migracijos. Sukuriam idempotentiškai —
-- jei prod jau egzistuoja, IF NOT EXISTS praleis. Reikia notification'ams
-- ('favorite_artist_track' tipas).
CREATE TABLE IF NOT EXISTS public.profile_favorite_artists (
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  artist_id   BIGINT NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, artist_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_favorite_artists_artist
  ON public.profile_favorite_artists (artist_id);
