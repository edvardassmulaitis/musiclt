-- ============================================================
-- 2026-07-10 — Fantasy v3: kapitonas ×2, privačios lygos, bot komandos
-- ============================================================
BEGIN;

ALTER TABLE public.fantasy_teams
  ADD COLUMN IF NOT EXISTS captain_artist_id BIGINT REFERENCES public.artists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.fantasy_leagues (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 40),
  owner_team_id BIGINT REFERENCES public.fantasy_teams(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fantasy_league_members (
  league_id BIGINT NOT NULL REFERENCES public.fantasy_leagues(id) ON DELETE CASCADE,
  team_id BIGINT NOT NULL REFERENCES public.fantasy_teams(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, team_id)
);
CREATE INDEX IF NOT EXISTS idx_fll_team ON public.fantasy_league_members (team_id);

ALTER TABLE public.fantasy_leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fantasy_league_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fantasy_leagues_read" ON public.fantasy_leagues;
CREATE POLICY "fantasy_leagues_read" ON public.fantasy_leagues FOR SELECT USING (true);
DROP POLICY IF EXISTS "fantasy_league_members_read" ON public.fantasy_league_members;
CREATE POLICY "fantasy_league_members_read" ON public.fantasy_league_members FOR SELECT USING (true);

COMMIT;
