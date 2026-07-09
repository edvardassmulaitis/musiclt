-- 20260709_daily_game_snapshot.sql
-- Bendra dienos „snapshot" lentelė album/metų žaidimams dienos iššūkyje —
-- kad turinys būtų identiškas visiems dalyviams (kaip daily_quiz_snapshot kvizui).
CREATE TABLE IF NOT EXISTS public.daily_game_snapshot (
  day    date NOT NULL,
  game   text NOT NULL,
  rounds jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, game)
);
ALTER TABLE public.daily_game_snapshot ENABLE ROW LEVEL SECURITY;
