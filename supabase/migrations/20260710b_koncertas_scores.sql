-- 20260710b_koncertas_scores.sql
--
-- „Dienos koncertas" rezultatai — praplečiam game_scores CHECK sąrašą.

ALTER TABLE public.game_scores DROP CONSTRAINT IF EXISTS game_scores_game_check;
ALTER TABLE public.game_scores ADD CONSTRAINT game_scores_game_check
  CHECK (game IN ('kvizas','dvikovos','vadybininkas','vaizdas','sekundes','metai','gaudykle','koncertas'));
