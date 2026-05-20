-- ============================================================
-- 2026-05-18c — UGC profile extended: papildoma informacija + stiliai + draugai
-- ============================================================
-- Po 20260518b užbaigus pirmos partijos importavimą paaiškėjo, kad music.lt
-- profilis turi žymiai daugiau laukų nei buvo paimta. Šis migration'as
-- pridenga visus likusius pagrindinio + `informacija` puslapio laukus:
--
--   /user/<username> turinys:
--     * Mėgstami stiliai (14 styles su legacy_id, slug, name)
--     * Muzikometras (broad style proportions — 8 broad styles su %)
--
--   /user/<username>/informacija turinys:
--     * Gimimo data (1998-08-25)
--     * Užsiėmimas (Studijuoju)
--     * Mėgstamiausios knygos (laisvas tekstas)
--     * Interneto svetainė (URL — naudoti esamą `profiles.website`)
--     * Apie save (didelis bio tekstas — naudoti esamą `profiles.bio`)
--     * Parašas (forumo signature)
--   Statistika:
--     * Buvo prisijungęs (login count)
--     * Parašė žinučių/komentarų (message count)
--     * Vidutinis žinutės ilgis
--     * Balsavimų vidurkis: dainų / albumų / grupių
--
--   /user/<username>/draugai turinys:
--     * Friends list — username sąrašas (žemo prioriteto, MVP simple version)
--
-- Tables:
--   profile_favorite_styles — N:M tarp profiles ir music.lt stilių
--   user_friendships — directed (a → b) draugystės ryšiai (simmetric MVP'ui)
-- ============================================================


-- ── 1. profiles ext kolonos (papildoma informacija + stats) ───────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS legacy_birth_date        DATE,
  ADD COLUMN IF NOT EXISTS legacy_occupation        TEXT,
  ADD COLUMN IF NOT EXISTS legacy_favorite_books    TEXT,
  ADD COLUMN IF NOT EXISTS legacy_signature         TEXT,
  ADD COLUMN IF NOT EXISTS legacy_login_count       INTEGER,
  ADD COLUMN IF NOT EXISTS legacy_message_count     INTEGER,
  ADD COLUMN IF NOT EXISTS legacy_avg_message_len   NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS legacy_vote_avg_track    NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS legacy_vote_avg_album    NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS legacy_vote_avg_artist   NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS legacy_liked_artist_count INTEGER,
  ADD COLUMN IF NOT EXISTS legacy_liked_album_count INTEGER,
  ADD COLUMN IF NOT EXISTS legacy_liked_track_count INTEGER,
  ADD COLUMN IF NOT EXISTS legacy_music_meter       JSONB;    -- broad style proportions


-- ── 2. profile_favorite_styles ────────────────────────────────────────────
-- Sąrašas user'io „Mėgstamų stilių" iš profile main page'o.
-- legacy_style_id / legacy_style_slug / style_name laikom kaip pirmą instanciją;
-- vėliau, kai DB'e turės kanoninę „styles" lentelę, perpiešim į FK.
CREATE TABLE IF NOT EXISTS public.profile_favorite_styles (
  id              BIGSERIAL PRIMARY KEY,
  profile_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  legacy_style_id INTEGER NOT NULL,                       -- music.lt /lt/stilius/<slug>/<id>/
  style_slug      TEXT NOT NULL,
  style_name      TEXT NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,             -- 1-based, kaip rodoma music.lt
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profile_fav_styles_unique UNIQUE (profile_id, legacy_style_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_fav_styles_profile
  ON public.profile_favorite_styles (profile_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_profile_fav_styles_style
  ON public.profile_favorite_styles (legacy_style_id);

COMMENT ON TABLE public.profile_favorite_styles IS
  'Per-profile mėgstamų music.lt stilių sąrašas. Iš /user/<u> "Mėgstami stiliai" sekcijos. Sort_order — kaip rodoma original profile.';


-- ── 3. user_friendships ──────────────────────────────────────────────────
-- Music.lt draugystės iš /user/<u>/draugai puslapio.
-- MVP — directed (a→b reiškia „a friend'inęs b"). Music.lt formaliai turi tik
-- vienpusišką „pridėti į draugus", bet po importo galim sumetrizuoti.
CREATE TABLE IF NOT EXISTS public.user_friendships (
  id            BIGSERIAL PRIMARY KEY,
  profile_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  friend_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source        TEXT NOT NULL DEFAULT 'legacy_scrape' CHECK (source IN ('legacy_scrape','auth')),
  legacy_added_at TIMESTAMPTZ,  -- jei music.lt rodo
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT friendships_unique UNIQUE (profile_id, friend_id),
  CONSTRAINT friendships_no_self CHECK (profile_id <> friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_profile ON public.user_friendships (profile_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend  ON public.user_friendships (friend_id);
