-- 20260711b_boombox_tournaments.sql
--
-- Dainų „playoffs" — vieno stiliaus knockout turnyras dienos dvikovoms.
--
-- Koncepcija:
--   * kiekvienam stiliui (8 pagrindinės grupės) sukuriamas bracket'as iš
--     populiariausių (pagal YT peržiūras) dainų; dydis pagal stiliaus
--     populiarumą (32 dideliems, 16 mažesniems)
--   * ankstyvi ratai auto-išsprendžiami pagal peržiūras (decided_by='seed')
--   * aštrusis galas (nuo ketvirtfinalių) — dienos bendruomenės balsavimas:
--     kiekviena diena parodo vieną „gyvą" matą kaip dienos dvikovą; dienos
--     gale daugumos balsas nustato nugalėtoją (decided_by='vote')
--   * kai išaiškėja čempionas → status='done', startuoja kito stiliaus turnyras
--   * visą medį galima parodyti vartotojui (viešas read)

BEGIN;

-- ── 1. Turnyrai (vienas per stilių; queue tvarka pagal sort_order) ──────────
CREATE TABLE IF NOT EXISTS public.boombox_tournaments (
  id BIGSERIAL PRIMARY KEY,
  genre_id BIGINT NOT NULL REFERENCES public.genres(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size IN (8, 16, 32, 64)),
  vote_from_round INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','done')),
  current_round INTEGER NOT NULL DEFAULT 1,
  champion_track_id BIGINT REFERENCES public.tracks(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tik VIENAS aktyvus turnyras vienu metu
CREATE UNIQUE INDEX IF NOT EXISTS idx_boombox_tournament_active
  ON public.boombox_tournaments ((status))
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_boombox_tournament_queue
  ON public.boombox_tournaments (status, sort_order, created_at)
  WHERE status = 'pending';

-- ── 2. Matai (visi bracket'o matai visų ratų) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.boombox_tournament_matches (
  id BIGSERIAL PRIMARY KEY,
  tournament_id BIGINT NOT NULL REFERENCES public.boombox_tournaments(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,               -- 1 = pirmas ratas, didėja iki finalo
  slot INTEGER NOT NULL,                -- pozicija rate (0-based)
  track_a_id BIGINT REFERENCES public.tracks(id) ON DELETE SET NULL,
  track_b_id BIGINT REFERENCES public.tracks(id) ON DELETE SET NULL,
  winner_track_id BIGINT REFERENCES public.tracks(id) ON DELETE SET NULL,
  decided_by TEXT CHECK (decided_by IN ('seed','vote')),
  duel_drop_id BIGINT REFERENCES public.boombox_duel_drops(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,             -- kada tapo „gyvu" dienos matu
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, round, slot)
);

CREATE INDEX IF NOT EXISTS idx_boombox_tmatch_tournament
  ON public.boombox_tournament_matches (tournament_id, round, slot);
-- „Gyvo" mato paieška: neišspręstas, jau paskelbtas
CREATE INDEX IF NOT EXISTS idx_boombox_tmatch_live
  ON public.boombox_tournament_matches (tournament_id, published_at DESC)
  WHERE winner_track_id IS NULL AND published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_boombox_tmatch_duel
  ON public.boombox_tournament_matches (duel_drop_id)
  WHERE duel_drop_id IS NOT NULL;

-- ── 3. RLS (kaip kitų žaidimų: skaitymas viešas, rašymas tik service-role) ──
ALTER TABLE public.boombox_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boombox_tournament_matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS boombox_tournaments_read ON public.boombox_tournaments;
CREATE POLICY boombox_tournaments_read ON public.boombox_tournaments FOR SELECT USING (true);
DROP POLICY IF EXISTS boombox_tmatch_read ON public.boombox_tournament_matches;
CREATE POLICY boombox_tmatch_read ON public.boombox_tournament_matches FOR SELECT USING (true);

COMMIT;
