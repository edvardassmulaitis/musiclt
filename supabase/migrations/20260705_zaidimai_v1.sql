-- ============================================================
-- 2026-07-05 — Žaidimų zona v1 (/zaidimai)
-- ============================================================
-- Nauja atskira žaidimų sritis (testuotojo idėja: taškai UŽ ŽAIDIMUS,
-- ne už įrašus/komentarus → spam'eriai negauna pranašumo).
--
-- Žaidimai v1:
--   * dainu-kvizas    — songtrivia2.io stiliaus audio kvizas (10 raundų,
--                       YT ištrauka + 4 atsakymai + laikrodis). Turinys
--                       generuojamas dinamiškai iš tracks — be admin darbo.
--   * dvikovos        — boombox duel archyvo balsavimas serijomis.
--   * vadybininkas    — "Muzikos vadybininkas": pasamdyk 3 realius LT
--                       atlikėjus už biudžetą, simuliuok metus, agentūros vertė.
--
-- Taškai (XP) toliau kaupiami boombox_streaks (bendras žaidimų taškų
-- balansas, istoriškai jau naudotas boombox misijų). Ši lentelė saugo
-- PER-ŽAIDIMĄ rezultatus: rekordams, lyderių lentelėms ir dienos XP
-- limitams (anti-farm).
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.game_scores (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  anon_id UUID,
  game TEXT NOT NULL CHECK (game IN ('kvizas','dvikovos','vadybininkas')),
  category TEXT,                          -- kvizo kategorija / vadyb. sezonas
  score INTEGER NOT NULL DEFAULT 0,       -- žaidimo vidinis rezultatas
  max_score INTEGER,                      -- koks buvo maksimumas (kontekstui)
  correct_count INTEGER,                  -- kvizui: kiek teisingų
  round_count INTEGER,                    -- kvizui: kiek raundų
  xp_earned INTEGER NOT NULL DEFAULT 0,   -- kiek taškų realiai priskirta
  details JSONB,                          -- žaidimo specifika (atsakymai, roster'is...)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((user_id IS NOT NULL) OR (anon_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_game_scores_game_score ON public.game_scores (game, score DESC);
CREATE INDEX IF NOT EXISTS idx_game_scores_user_day ON public.game_scores (user_id, game, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_game_scores_anon_day ON public.game_scores (anon_id, game, created_at DESC) WHERE anon_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_game_scores_created ON public.game_scores (created_at DESC);

ALTER TABLE public.game_scores ENABLE ROW LEVEL SECURITY;

-- Skaityti galima viešai (lyderių lentelės) — asmens duomenų čia nėra,
-- tik user_id/anon_id UUID. Rašymas TIK per service role (API skaičiuoja
-- rezultatą server-side, klientas taškų neįrašinėja).
DROP POLICY IF EXISTS "game_scores_read" ON public.game_scores;
CREATE POLICY "game_scores_read" ON public.game_scores
  FOR SELECT USING (true);

COMMIT;
