-- ============================================================
-- 2026-07-06b — Žaidimų sąžiningumo pertvarka
-- ============================================================
-- Kodo peržiūros radinių taisymai:
--   1. game_rounds — atsakymai registruojami po raundą SERVERYJE.
--      Teisingas atsakymas nebekeliauja į naršyklę iš anksto, pirmas
--      atsakymas fiksuojamas negrįžtamai (unique), pakartojimai ignoruojami.
--   2. game_scores.quiz_id + unique — to paties žaidimo rezultato negalima
--      užskaityti du kartus (replay apsauga + dienos iššūkio 1 k./d. DB lygiu).
--   3. daily_quiz_snapshot — dienos iššūkis VISIEMS identiškas nepriklausomai
--      nuo lambda instancijų cache (pirmas sugeneravęs įrašo, kiti skaito).
--   4. game_bump_streak() RPC — atominis taškų/serijos kaupimas (FOR UPDATE),
--      lygiagretūs užskaitymai nebepameta XP.
-- ============================================================

BEGIN;

-- ── 1. Atsakymai po raundą ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.game_rounds (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  anon_id UUID,
  game TEXT NOT NULL CHECK (game IN ('kvizas','vaizdas')),
  quiz_id TEXT NOT NULL,
  r INTEGER NOT NULL,
  answer_id BIGINT,
  ms INTEGER NOT NULL DEFAULT 0,
  correct BOOLEAN NOT NULL DEFAULT false,
  points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((user_id IS NOT NULL) OR (anon_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_game_rounds_user
  ON public.game_rounds (user_id, game, quiz_id, r) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_game_rounds_anon
  ON public.game_rounds (anon_id, game, quiz_id, r) WHERE anon_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_game_rounds_quiz ON public.game_rounds (quiz_id);

ALTER TABLE public.game_rounds ENABLE ROW LEVEL SECURITY;
-- Jokių viešų policy — rašo/skaito tik service role per API.

-- ── 2. Replay apsauga rezultatams ─────────────────────────────
ALTER TABLE public.game_scores ADD COLUMN IF NOT EXISTS quiz_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_game_scores_user_quiz
  ON public.game_scores (user_id, game, quiz_id) WHERE user_id IS NOT NULL AND quiz_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_game_scores_anon_quiz
  ON public.game_scores (anon_id, game, quiz_id) WHERE anon_id IS NOT NULL AND quiz_id IS NOT NULL;

-- ── 3. Dienos iššūkio momentinė kopija ────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_quiz_snapshot (
  day DATE PRIMARY KEY,
  rounds JSONB NOT NULL,          -- [{r, ytId, startSec, correctId, options:[{id,title,artist}]}]
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.daily_quiz_snapshot ENABLE ROW LEVEL SECURITY;

-- ── 4. Atominis taškų/serijos kaupimas ────────────────────────
CREATE OR REPLACE FUNCTION public.game_bump_streak(
  p_user UUID, p_anon UUID, p_xp INTEGER, p_today DATE
) RETURNS TABLE (out_streak INTEGER, out_total_xp INTEGER) AS $$
DECLARE
  v_id BIGINT; v_last DATE; v_cur INTEGER;
BEGIN
  IF p_user IS NOT NULL THEN
    SELECT id, last_active_date, current_streak INTO v_id, v_last, v_cur
      FROM public.boombox_streaks WHERE user_id = p_user FOR UPDATE;
  ELSE
    SELECT id, last_active_date, current_streak INTO v_id, v_last, v_cur
      FROM public.boombox_streaks WHERE anon_id = p_anon FOR UPDATE;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.boombox_streaks
      (user_id, anon_id, current_streak, longest_streak, last_active_date, total_xp, total_completions)
    VALUES (p_user, p_anon, 1, 1, p_today, p_xp, 1)
    RETURNING current_streak, total_xp INTO out_streak, out_total_xp;
    RETURN NEXT; RETURN;
  END IF;

  IF v_last IS NULL THEN
    v_cur := 1;
  ELSIF v_last <> p_today THEN
    IF v_last = p_today - 1 THEN v_cur := v_cur + 1; ELSE v_cur := 1; END IF;
  END IF;

  UPDATE public.boombox_streaks SET
    current_streak = v_cur,
    longest_streak = GREATEST(longest_streak, v_cur),
    last_active_date = p_today,
    total_xp = total_xp + p_xp,
    total_completions = total_completions + 1,
    updated_at = now()
  WHERE id = v_id
  RETURNING current_streak, total_xp INTO out_streak, out_total_xp;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

COMMIT;
