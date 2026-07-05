-- ============================================================
-- 2026-07-06 — Muzikos vadybininkas v2: TĘSTINĖ FANTASY LYGA
-- ============================================================
-- Testuotojo/Edvardo feedback'as: ne quick-sim, o tęstinumas kaip
-- krepšinio rinkos žaidimuose — REALŪS atlikėjai, REALŪS jų rezultatai
-- (YouTube augimas, topai, releizai), savaitės/mėnesio/sezono lyderiai.
--
-- Modelis:
--   * fantasy_teams — 1 komanda per user'į/anon'ą, biudžetas 220 tšk.
--   * fantasy_roster — 5 aktyvūs atlikėjai (released_at NULL), istorija lieka.
--   * fantasy_artist_weeks — kiekvieno atlikėjo REALŪS savaitės taškai
--     (skaičiuoja /api/cron/fantasy-savaite kas pirmadienį):
--       chart_points   — finalizuoto top40/lt_top30 pozicijos
--       yt_points      — YouTube augimas (views delta istorija arba score_trending)
--       release_points — nauji releizai tą savaitę
--       base_points    — bazinis aktyvumas iš artist score
--   * fantasy_team_weeks — komandos savaitės suma (roster'io snapshot'as).
--
-- Lygos lentelės: savaitė = team_weeks; mėnuo/sezonas = SUM(team_weeks).
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.fantasy_teams (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  anon_id UUID,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 30),
  budget INTEGER NOT NULL DEFAULT 220,      -- pradinis biudžetas
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((user_id IS NOT NULL) OR (anon_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fantasy_team_user ON public.fantasy_teams (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fantasy_team_anon ON public.fantasy_teams (anon_id) WHERE anon_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.fantasy_roster (
  id BIGSERIAL PRIMARY KEY,
  team_id BIGINT NOT NULL REFERENCES public.fantasy_teams(id) ON DELETE CASCADE,
  artist_id BIGINT NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  price INTEGER NOT NULL,                   -- už kiek pasirašyta
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ                   -- NULL = aktyvus
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fantasy_roster_active
  ON public.fantasy_roster (team_id, artist_id) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fantasy_roster_team ON public.fantasy_roster (team_id, released_at);
CREATE INDEX IF NOT EXISTS idx_fantasy_roster_artist ON public.fantasy_roster (artist_id) WHERE released_at IS NULL;

CREATE TABLE IF NOT EXISTS public.fantasy_artist_weeks (
  artist_id BIGINT NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,                 -- pirmadienis
  chart_points INTEGER NOT NULL DEFAULT 0,
  yt_points INTEGER NOT NULL DEFAULT 0,
  release_points INTEGER NOT NULL DEFAULT 0,
  base_points INTEGER NOT NULL DEFAULT 0,
  total_points INTEGER NOT NULL DEFAULT 0,
  details JSONB,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (artist_id, week_start)
);
CREATE INDEX IF NOT EXISTS idx_fantasy_aw_week ON public.fantasy_artist_weeks (week_start, total_points DESC);

CREATE TABLE IF NOT EXISTS public.fantasy_team_weeks (
  team_id BIGINT NOT NULL REFERENCES public.fantasy_teams(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  breakdown JSONB,                          -- [{artist_id, name, points}]
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, week_start)
);
CREATE INDEX IF NOT EXISTS idx_fantasy_tw_week ON public.fantasy_team_weeks (week_start, points DESC);

-- RLS: skaityti viešai (lygos lentelės), rašyti tik service role (API)
ALTER TABLE public.fantasy_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fantasy_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fantasy_artist_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fantasy_team_weeks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fantasy_teams_read" ON public.fantasy_teams;
CREATE POLICY "fantasy_teams_read" ON public.fantasy_teams FOR SELECT USING (true);
DROP POLICY IF EXISTS "fantasy_roster_read" ON public.fantasy_roster;
CREATE POLICY "fantasy_roster_read" ON public.fantasy_roster FOR SELECT USING (true);
DROP POLICY IF EXISTS "fantasy_artist_weeks_read" ON public.fantasy_artist_weeks;
CREATE POLICY "fantasy_artist_weeks_read" ON public.fantasy_artist_weeks FOR SELECT USING (true);
DROP POLICY IF EXISTS "fantasy_team_weeks_read" ON public.fantasy_team_weeks;
CREATE POLICY "fantasy_team_weeks_read" ON public.fantasy_team_weeks FOR SELECT USING (true);

-- game_scores: naujas žaidimas 'vaizdas' (atspėk iš nuotraukos)
ALTER TABLE public.game_scores DROP CONSTRAINT IF EXISTS game_scores_game_check;
ALTER TABLE public.game_scores ADD CONSTRAINT game_scores_game_check
  CHECK (game IN ('kvizas','dvikovos','vadybininkas','vaizdas'));

COMMIT;
