-- ============================================================
-- 2026-05-18 — UGC migration: daily song picks, mood song, legacy
-- profile meta, pending links queue, likes entity_type extension.
-- ============================================================
-- Pirmoji vartotojų turinio migracijos partija. Edvardas paprašė pradėti
-- nuo įrašų / kūrybos / vertimų ir baigti dienos dainų pasirinkimais ir
-- like'ais. Šis migration'as pridenga viską, kas dar neturi vietos esamoje
-- DB schemoje:
--
--   1. profiles — pridedame legacy_user_id (music.lt user.<N>), VIP flag'ą,
--      sukūrimo datą sename forume, karma taškus, esamą "Nuotaikos daina"
--      track FK (1-1, ne istorija) ir kada user'is paskutinį kartą ją
--      pakeitė.
--   2. likes.entity_type — pridedame 'blog_post' ir 'daily_pick' (komentarų
--      'comment'/'forum_post' jau buvo).
--   3. daily_song_picks — kasdienis user'io track pasirinkimas + komentaras.
--      Vieną žmogaus per dieną garantuojam UNIQUE'u. Like'us tracking'inam
--      per canonical `likes` lentelę (entity_type='daily_pick').
--   4. ugc_pending_links — queue iš nuorodų, kurios scrape metu nukreipė
--      į DAR neimportuotą entity (artist/album/track). Po kiekvieno
--      `import_artist.py` paleidimo sweep'as bandys jas resolve'inti.
--   5. profile_blogs_for_legacy — helper funkcija, kuri kuriamam ghost
--      user'iui automatiškai pridės `blogs` įrašą, kad blog_posts.blog_id
--      FK constraint'as gyventų.
--
-- Idempotentinis: visa per `IF NOT EXISTS` / DO blokus. Saugu paleisti
-- pakartotinai.
-- ============================================================


-- ── 1. profiles ext ──────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS legacy_user_id      INTEGER,           -- music.lt user.<N>
  ADD COLUMN IF NOT EXISTS joined_legacy_at    DATE,              -- "Narys nuo: 2011-08-11"
  ADD COLUMN IF NOT EXISTS legacy_karma_points INTEGER,           -- "Reitingo taškai: 49682"
  ADD COLUMN IF NOT EXISTS is_vip_legacy       BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mood_song_track_id  INTEGER,           -- esama "Nuotaikos daina"
  ADD COLUMN IF NOT EXISTS mood_song_set_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS legacy_age          INTEGER,           -- profile metai
  ADD COLUMN IF NOT EXISTS legacy_city         TEXT,              -- profile miestas
  ADD COLUMN IF NOT EXISTS last_seen_legacy_at TIMESTAMPTZ;       -- "Paskutinį kartą matytas"

-- Unique constraint legacy_user_id (jei pridedam, vienas profile = vienas legacy ID)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_legacy_user_id_unique'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_legacy_user_id_unique UNIQUE (legacy_user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_mood_song_track_fk'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_mood_song_track_fk
      FOREIGN KEY (mood_song_track_id) REFERENCES public.tracks(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_legacy_user_id
  ON public.profiles (legacy_user_id)
  WHERE legacy_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_mood_song
  ON public.profiles (mood_song_track_id)
  WHERE mood_song_track_id IS NOT NULL;


-- ── 2. likes.entity_type — pridedame blog_post + daily_pick ──────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'likes_entity_type_check'
  ) THEN
    ALTER TABLE public.likes DROP CONSTRAINT likes_entity_type_check;
  END IF;
END $$;

ALTER TABLE public.likes
  ADD CONSTRAINT likes_entity_type_check
  CHECK (entity_type IN (
    'artist','album','track','event','thread','post','comment','forum_post','news',
    'blog_post','daily_pick'
  ));


-- ── 3. daily_song_picks ──────────────────────────────────────────────────
-- Kasdienis user'io track pasirinkimas. Schema:
--   • author_id (FK profiles)
--   • track_id (FK tracks)
--   • picked_on (DATE)
--   • comment (TEXT, optional, user'io rich-form komentaras)
--   • legacy_id (BIGINT) — music.lt ?rate;list.60;id.<N> dalies
--   • like_count cache — gali būti perskaičiuotas iš canonical `likes`
CREATE TABLE IF NOT EXISTS public.daily_song_picks (
  id            BIGSERIAL PRIMARY KEY,
  legacy_id     BIGINT UNIQUE,                                  -- music.lt rate.60 id
  author_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  track_id      INTEGER REFERENCES public.tracks(id) ON DELETE SET NULL,
  legacy_track_id BIGINT,                                       -- jei track dar neimportuotas
  picked_on     DATE NOT NULL,
  comment       TEXT,
  like_count    INTEGER NOT NULL DEFAULT 0,
  source        TEXT NOT NULL DEFAULT 'legacy_scrape' CHECK (source IN ('legacy_scrape','auth')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Vienam žmogui — vienas pick'as per dieną
  CONSTRAINT daily_picks_unique_author_day UNIQUE (author_id, picked_on)
);

CREATE INDEX IF NOT EXISTS idx_daily_picks_author
  ON public.daily_song_picks (author_id, picked_on DESC);
CREATE INDEX IF NOT EXISTS idx_daily_picks_track
  ON public.daily_song_picks (track_id)
  WHERE track_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_daily_picks_legacy_track
  ON public.daily_song_picks (legacy_track_id)
  WHERE legacy_track_id IS NOT NULL AND track_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_daily_picks_recent
  ON public.daily_song_picks (picked_on DESC);

COMMENT ON TABLE public.daily_song_picks IS
  'Kasdienis vartotojo track pasirinkimas (music.lt "Dienos daina" istorija). UNIQUE(author_id, picked_on) — vienas per dieną. Like''us per canonical `likes` (entity_type=daily_pick).';


-- ── 4. ugc_pending_links ─────────────────────────────────────────────────
-- Kai UGC scrape metu sutinkam nuorodą į dar neimportuotą entity, įrašom
-- į queue. Po naujo `import_artist.py` paleidimo sweep'as resolve'ina.
CREATE TABLE IF NOT EXISTS public.ugc_pending_links (
  id              BIGSERIAL PRIMARY KEY,
  source_kind     TEXT NOT NULL CHECK (source_kind IN (
    'blog_post','daily_song_pick','profile_mood_song','like'
  )),
  source_id       BIGINT,                                   -- gali būti NULL like'ams (atskirta per legacy_username)
  source_uuid     UUID,                                     -- blog_posts.id (UUID)
  source_username TEXT,                                     -- like'ams ir mood_song'ams
  target_kind     TEXT NOT NULL CHECK (target_kind IN ('artist','album','track')),
  target_legacy_id BIGINT NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_tried_at   TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,
  resolved_id     BIGINT,                                   -- naujas artist/album/track ID po resolve'o
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Vienam source + target poros — viena queue eilė
  CONSTRAINT ugc_pending_unique UNIQUE (source_kind, source_id, source_uuid, source_username,
                                         target_kind, target_legacy_id)
);

CREATE INDEX IF NOT EXISTS idx_ugc_pending_unresolved
  ON public.ugc_pending_links (target_kind, target_legacy_id)
  WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ugc_pending_recent
  ON public.ugc_pending_links (created_at DESC)
  WHERE resolved_at IS NULL;

COMMENT ON TABLE public.ugc_pending_links IS
  'Queue UGC scrape metu sutiktų nuorodų į dar neimportuotas entity. Po kiekvieno import_artist.py — sweep''as resolve''ina ir update''ina source ([blog_posts|daily_song_picks|profiles|likes]).';


-- ── 5. blog_posts.legacy_id (legacy backref) ──────────────────────────────
-- Migracijos metu kiekvienam blog_post saugom music.lt legacy ID (diary 43091,
-- creation 13832, vertimas 587), kad dedup'intume re-run scrape'ą.
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS legacy_id        INTEGER,
  ADD COLUMN IF NOT EXISTS legacy_source    TEXT,                -- 'diary' | 'creation' | 'translate'
  ADD COLUMN IF NOT EXISTS legacy_source_url TEXT,
  ADD COLUMN IF NOT EXISTS edited_at        TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'blog_posts_legacy_source_check'
  ) THEN
    ALTER TABLE public.blog_posts
      ADD CONSTRAINT blog_posts_legacy_source_check
      CHECK (legacy_source IS NULL OR legacy_source IN ('diary','creation','translate','topas'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'blog_posts_legacy_unique'
  ) THEN
    ALTER TABLE public.blog_posts
      ADD CONSTRAINT blog_posts_legacy_unique UNIQUE (legacy_source, legacy_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_blog_posts_legacy
  ON public.blog_posts (legacy_source, legacy_id)
  WHERE legacy_id IS NOT NULL;


-- ── 6. comments.blog_post_id (canonical comments → blog_post link) ──────
-- Comments lentelė turi atskirus FK column'us per entity tipą:
-- track_id, album_id, event_id, news_id, discussion_id. Pridedam blog_post_id
-- kaip kitą entity tipą tame pačiame pattern'e.
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS discussion_id BIGINT;  -- canonical envelope (galim nebenaudoti, bet rezervuojam)

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS blog_post_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comments_blog_post_fk'
  ) THEN
    ALTER TABLE public.comments
      ADD CONSTRAINT comments_blog_post_fk
      FOREIGN KEY (blog_post_id) REFERENCES public.blog_posts(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comments_blog_post
  ON public.comments (blog_post_id, created_at DESC)
  WHERE blog_post_id IS NOT NULL;


-- ── 7. blogs.is_active default ────────────────────────────────────────────
-- Jeigu lentelė turi is_active stulpelį, scrape'as kuria su TRUE.
-- (No-op jei is_active jau egzistuoja su NOT NULL DEFAULT true.)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='blogs' AND column_name='is_active'
  ) THEN
    -- Nieko nedaryti, tik patikrinti, kad scrape'as gali skip'inti is_active.
    NULL;
  END IF;
END $$;
