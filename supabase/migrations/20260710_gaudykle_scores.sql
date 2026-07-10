-- 20260710_gaudykle_scores.sql
--
-- „Atlikėjų gaudyklė" rezultatai — kad pabaigoje matytųsi, kaip pasirodei
-- tarp paskutinių 100 geriausių. Praplečiam game_scores CHECK sąrašą.

ALTER TABLE public.game_scores DROP CONSTRAINT IF EXISTS game_scores_game_check;
ALTER TABLE public.game_scores ADD CONSTRAINT game_scores_game_check
  CHECK (game IN ('kvizas','dvikovos','vadybininkas','vaizdas','sekundes','metai','gaudykle'));
