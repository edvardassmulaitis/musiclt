-- 20260712b_tournaments_groups_vote_all.sql
--
-- Dainų „playoffs" v3 — visi ratai balsuojami + kuruoti pogrupiai + šalinimas.
--
-- Kodėl (savininko sprendimas 2026-07-12):
--   1) VISI RATAI BALSUOJAMI. Anksčiau ankstyvi ratai buvo auto-išsprendžiami
--      pagal YT peržiūras (decided_by='seed') — atrodė klaidinančiai („kodėl
--      tiek daug jau užbaigta?"), o tikslas yra kuo DAUGIAU dienos dvikovų,
--      kad turnyrai suktųsi metų metus. vote_from_round dabar visada 1.
--   2) KURUOTI POGRUPIAI (group_key). Dideli stiliai skaidomi į kuruotus
--      substilių pogrupius (ne po vieną substilių, o grupėmis + „Kita"
--      catch-all likusiems). Priežastis: World Pop 32 vietos netalpino
--      Billie Eilish/Beyoncé/Selena Gomez; „Kitų stilių" skaidymas į 3
--      substilius išmesdavo Israel Kamakawiwo'ole (1,58B) ir visą latino bangą.
--      substyle_id paliekamas legacy (nebe naudojamas naujam seed'ui).
--   3) ŠALINIMAS. Savininkas gali išimti kandidatą iš bracket'o (peek UI) —
--      pašalinta daina registruojama exclusions lentelėje, o turnyras
--      pergeneruojamas; į vietą ateina kita daina (to paties atlikėjo kita
--      populiariausia arba kitas atlikėjas iš eilės).

BEGIN;

-- ── 0. Senų (v2) turnyrų išvalymas ──────────────────────────────────────────
-- Balsavimų dar nebuvo (decided_by='vote' → 0 eilučių), tad saugu perstatyti
-- nuo nulio: v2 turnyrai buvo su auto-ratais ir be pogrupių, jų struktūra
-- nesuderinama su nauju unikalumo indeksu (world „Kitų stilių" 3 substilių
-- turnyrai dalinasi tą patį genre_id be group_key). Vienintelis matas su
-- duel_drop_id nuoroda — dropas lieka kaip savarankiška dienos dvikova.
DELETE FROM public.boombox_tournaments;

-- ── 1. group_key: kuruoto pogrupio raktas (pvz. 'rnb', 'latin', 'estrada') ──
ALTER TABLE public.boombox_tournaments
  ADD COLUMN IF NOT EXISTS group_key TEXT;

-- Unikalumas dabar pagal (scope, genre, group_key) — substyle_id legacy
DROP INDEX IF EXISTS public.idx_boombox_tournament_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_boombox_tournament_unique_v2
  ON public.boombox_tournaments (scope, genre_id, COALESCE(group_key, ''));

-- ── 2. Pašalinti kandidatai — niekada nebegrįžta į jokį turnyrą ─────────────
CREATE TABLE IF NOT EXISTS public.boombox_tournament_exclusions (
  track_id BIGINT PRIMARY KEY REFERENCES public.tracks(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: skaityti nereikia niekam (naudoja tik service-role), rašyti — tik jam
ALTER TABLE public.boombox_tournament_exclusions ENABLE ROW LEVEL SECURITY;

-- ── 3. Indeksas substilių lookup'ui (seed'as ieško pagal substyle_id — be jo
--       seq scan per visą artist_substyles ir statement timeout) ─────────────
CREATE INDEX IF NOT EXISTS idx_artist_substyles_substyle
  ON public.artist_substyles (substyle_id, artist_id);

COMMIT;
