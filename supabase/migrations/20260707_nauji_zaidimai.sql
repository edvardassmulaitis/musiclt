-- 20260707_nauji_zaidimai.sql
--
-- Nauji greiti žaidimai:
--   * 'sekundes' — „Atspėk iš sekundės": 1 s ištrauka → +3 s → +5 s,
--     kuo mažiau klausei, tuo daugiau taškų.
--   * 'metai'    — „Kurie metai?": albumo viršelis + pavadinimas, spėk
--     išleidimo metus (4 variantai; answer_id = metai).
-- Praplečiam game CHECK sąrašus.

ALTER TABLE public.game_scores DROP CONSTRAINT IF EXISTS game_scores_game_check;
ALTER TABLE public.game_scores ADD CONSTRAINT game_scores_game_check
  CHECK (game IN ('kvizas','dvikovos','vadybininkas','vaizdas','sekundes','metai'));

ALTER TABLE public.game_rounds DROP CONSTRAINT IF EXISTS game_rounds_game_check;
ALTER TABLE public.game_rounds ADD CONSTRAINT game_rounds_game_check
  CHECK (game IN ('kvizas','vaizdas','sekundes','metai'));
