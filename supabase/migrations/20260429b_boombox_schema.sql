-- ============================================================
-- 2026-04-29b — Boombox engagement zonos schema
-- ============================================================
-- Music.lt Boombox: kasdienis 3-misijų wizard'as (atspėk vaizdą,
-- dvikova, dienos verdiktas) + curated short video drops feed'as.
--
-- Pagrindiniai principai:
--   * Anonymous-first — user_id arba anon_id (UUID iš ml_anon_id cookie)
--   * Drop'ai (= turinio vienetai) admin'o pre-generuojami ir scheduled'inami
--     pagal datą. /today endpoint'as pasirenka pagal current_date.
--   * Per-user-per-drop kompletavimas (unique constraint) — vienas atsakymas
--     tau iš tiek vienos paskyros (user_id) ar device'o (anon_id).
--   * Stats (kiek % balsavo už ką) skaičiuojami on-demand iš completions.
-- ============================================================

BEGIN;

-- ── 1. Image Guess drop'ai ───────────────────────────────────
-- Admin'as įkelia AI sugeneruotą vaizdą + parenka teisingą track'ą
-- + 3 decoy track'us. Decoys turėtų būti pakankamai panašūs.
CREATE TABLE IF NOT EXISTS public.boombox_image_drops (
  id BIGSERIAL PRIMARY KEY,
  image_url TEXT NOT NULL,
  ai_prompt TEXT,
  correct_track_id BIGINT NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  decoy_track_ids BIGINT[] NOT NULL,
  difficulty INTEGER NOT NULL DEFAULT 2 CHECK (difficulty BETWEEN 1 AND 5),
  scheduled_for DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','archived')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (array_length(decoy_track_ids, 1) = 3)
);
CREATE INDEX idx_boombox_image_scheduled ON public.boombox_image_drops (scheduled_for) WHERE status = 'ready';
CREATE INDEX idx_boombox_image_status ON public.boombox_image_drops (status);


-- ── 2. Duel drop'ai (porinis balsavimas) ──────────────────────
CREATE TABLE IF NOT EXISTS public.boombox_duel_drops (
  id BIGSERIAL PRIMARY KEY,
  matchup_type TEXT NOT NULL CHECK (matchup_type IN ('old_vs_old','new_vs_new','old_vs_new')),
  track_a_id BIGINT NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  track_b_id BIGINT NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  scheduled_for DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','archived')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (track_a_id != track_b_id)
);
CREATE INDEX idx_boombox_duel_scheduled ON public.boombox_duel_drops (scheduled_for) WHERE status = 'ready';
CREATE INDEX idx_boombox_duel_status ON public.boombox_duel_drops (status);


-- ── 3. Verdict drop'ai (dienos daina reakcijai) ───────────────
CREATE TABLE IF NOT EXISTS public.boombox_verdict_drops (
  id BIGSERIAL PRIMARY KEY,
  track_id BIGINT NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  scheduled_for DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','archived')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_boombox_verdict_scheduled ON public.boombox_verdict_drops (scheduled_for) WHERE status = 'ready';
CREATE INDEX idx_boombox_verdict_status ON public.boombox_verdict_drops (status);


-- ── 4. Curated short video drop'ai ────────────────────────────
-- TikTok / IG Reels / YT Shorts linkai, susieti su music.lt atlikėjais.
CREATE TABLE IF NOT EXISTS public.boombox_video_drops (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('tiktok','reels','shorts','youtube')),
  source_url TEXT NOT NULL,
  embed_id TEXT,
  caption TEXT NOT NULL,
  related_artist_id BIGINT REFERENCES public.artists(id) ON DELETE SET NULL,
  related_track_id BIGINT REFERENCES public.tracks(id) ON DELETE SET NULL,
  scheduled_for DATE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','archived','dead')),
  curated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_health_check TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_boombox_video_scheduled ON public.boombox_video_drops (scheduled_for, sort_order) WHERE status = 'ready';
CREATE INDEX idx_boombox_video_artist ON public.boombox_video_drops (related_artist_id);
CREATE INDEX idx_boombox_video_status ON public.boombox_video_drops (status);


-- ── 5. User completion log ────────────────────────────────────
-- Vienas įrašas per (user_or_anon, drop). Stats skaičiuojami iš čia.
CREATE TABLE IF NOT EXISTS public.boombox_completions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  anon_id UUID,
  mission_type TEXT NOT NULL CHECK (mission_type IN ('image_guess','duel','verdict','video_react')),
  drop_id BIGINT NOT NULL,
  drop_table TEXT NOT NULL CHECK (drop_table IN ('boombox_image_drops','boombox_duel_drops','boombox_verdict_drops','boombox_video_drops')),
  payload JSONB NOT NULL,
  is_correct BOOLEAN,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((user_id IS NOT NULL) OR (anon_id IS NOT NULL))
);

CREATE UNIQUE INDEX idx_boombox_complete_user_drop
  ON public.boombox_completions (user_id, drop_table, drop_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX idx_boombox_complete_anon_drop
  ON public.boombox_completions (anon_id, drop_table, drop_id)
  WHERE anon_id IS NOT NULL;

CREATE INDEX idx_boombox_complete_drop ON public.boombox_completions (drop_table, drop_id);
CREATE INDEX idx_boombox_complete_date ON public.boombox_completions (completed_at);
CREATE INDEX idx_boombox_complete_user ON public.boombox_completions (user_id, completed_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_boombox_complete_anon ON public.boombox_completions (anon_id, completed_at DESC) WHERE anon_id IS NOT NULL;


-- ── 6. Streak cache ───────────────────────────────────────────
-- Atnaujinama po kiekvieno completion'o (trigger arba app-side).
CREATE TABLE IF NOT EXISTS public.boombox_streaks (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  anon_id UUID,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_active_date DATE,
  total_xp INTEGER NOT NULL DEFAULT 0,
  total_completions INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((user_id IS NOT NULL) OR (anon_id IS NOT NULL))
);

CREATE UNIQUE INDEX idx_boombox_streak_user ON public.boombox_streaks (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_boombox_streak_anon ON public.boombox_streaks (anon_id) WHERE anon_id IS NOT NULL;


-- ── 7. RLS policies ───────────────────────────────────────────
-- Drop'ų lentelės: viešas read (jei status='ready'), admin-only write.
-- Completions: viešas insert (anon arba auth), savo įrašus matai, agreguotus
-- stat'us bet kas. Streaks: read savo, write tik service role.

ALTER TABLE public.boombox_image_drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boombox_duel_drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boombox_verdict_drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boombox_video_drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boombox_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boombox_streaks ENABLE ROW LEVEL SECURITY;

-- Image drops: visi gali skaityti tuos, kurie ready ir scheduled <= today
CREATE POLICY "boombox_image_drops_read" ON public.boombox_image_drops
  FOR SELECT USING (status = 'ready' AND (scheduled_for IS NULL OR scheduled_for <= CURRENT_DATE));

CREATE POLICY "boombox_duel_drops_read" ON public.boombox_duel_drops
  FOR SELECT USING (status = 'ready' AND (scheduled_for IS NULL OR scheduled_for <= CURRENT_DATE));

CREATE POLICY "boombox_verdict_drops_read" ON public.boombox_verdict_drops
  FOR SELECT USING (status = 'ready' AND (scheduled_for IS NULL OR scheduled_for <= CURRENT_DATE));

CREATE POLICY "boombox_video_drops_read" ON public.boombox_video_drops
  FOR SELECT USING (status = 'ready' AND (scheduled_for IS NULL OR scheduled_for <= CURRENT_DATE));

-- Completions: kiekvienas gali insert savo įrašą, skaityti agreguotai (per RPC ar API)
CREATE POLICY "boombox_completions_insert" ON public.boombox_completions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "boombox_completions_read_own" ON public.boombox_completions
  FOR SELECT USING (user_id = auth.uid() OR true);  -- viešas, kad galėtume skaičiuoti stats

-- Streaks: skaityti viešai (irgi public stats), write tik service role
CREATE POLICY "boombox_streaks_read" ON public.boombox_streaks
  FOR SELECT USING (true);


-- ── 8. updated_at trigger'iai ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.boombox_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_boombox_image_updated BEFORE UPDATE ON public.boombox_image_drops
  FOR EACH ROW EXECUTE FUNCTION public.boombox_touch_updated_at();
CREATE TRIGGER trg_boombox_duel_updated BEFORE UPDATE ON public.boombox_duel_drops
  FOR EACH ROW EXECUTE FUNCTION public.boombox_touch_updated_at();
CREATE TRIGGER trg_boombox_verdict_updated BEFORE UPDATE ON public.boombox_verdict_drops
  FOR EACH ROW EXECUTE FUNCTION public.boombox_touch_updated_at();
CREATE TRIGGER trg_boombox_video_updated BEFORE UPDATE ON public.boombox_video_drops
  FOR EACH ROW EXECUTE FUNCTION public.boombox_touch_updated_at();

COMMIT;
