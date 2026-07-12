-- 20260712_tournaments_scope_substyle.sql
--
-- Dainų „playoffs" v2 — dvi lygiagrečios eilės ir substilių turnyrai.
--
-- Kodėl:
--   1) SCOPE. Seed'inant grynai pagal YT peržiūras, lietuviai iškrenta visiškai:
--      geriausias LT rokas (ba. — SAVO, 30M) prieš OneRepublic (4,4 mlrd.) — ~100x
--      skirtumas. Music.lt tai nepriimtina, o likusi žaidimų sistema
--      (lib/zaidimai.ts QUIZ_CATEGORIES) jau turi scope 'lt' | 'foreign'.
--      Sprendimas: dvi atskiros turnyrų eilės — LT ir pasaulio — sukasi
--      lygiagrečiai, o dienos dvikova kasdien ateina pakaitomis iš vienos ir kitos.
--
--   2) SUBSTYLE. Du stiliai yra semantiniai sąvartynai, kuriuose turnyras beprasmis:
--        „Rimtoji"    → Jazz(327) + Classical(178) + Blues(138) + Opera + Gospel…
--        „Kitų stilių" → Country(159) + Filmų muzika(116) + Reggae(101)…
--      Klausimas „geriausia rimtosios muzikos daina?" (Chopin prieš Sinatrą prieš
--      Sade) atsakymo neturi. Todėl jiems turnyrai vyksta SUBSTILIAUS lygmeniu.
--      Likę 6 stiliai (Hip-hop 82% koncentracija, Pop 47%, Elektroninė 45%,
--      Rokas 33%, Sunkioji 27%, Alternatyva) lieka stiliaus lygmeniu — juose
--      klausimas „geriausia roko daina?" prasmingas.
--      LT pusėje substiliai neskaidomi (LT Rimtoji teturi 30 atlikėjų).

BEGIN;

-- ── 1. scope: 'lt' | 'world' ────────────────────────────────────────────────
ALTER TABLE public.boombox_tournaments
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'world';

DO $$ BEGIN
  ALTER TABLE public.boombox_tournaments
    ADD CONSTRAINT boombox_tournaments_scope_chk CHECK (scope IN ('lt','world'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. substyle_id: NULL = turnyras viso stiliaus lygmeniu ──────────────────
ALTER TABLE public.boombox_tournaments
  ADD COLUMN IF NOT EXISTS substyle_id BIGINT
  REFERENCES public.substyles(id) ON DELETE CASCADE;

-- ── 3. Aktyvumas — po VIENĄ aktyvų turnyrą KIEKVIENAME scope ────────────────
-- (senasis indeksas leido tik vieną aktyvų iš viso — dabar LT ir pasaulio
--  turnyrai turi suktis vienu metu)
DROP INDEX IF EXISTS public.idx_boombox_tournament_active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_boombox_tournament_active_per_scope
  ON public.boombox_tournaments (scope)
  WHERE status = 'active';

-- Eilė — atskira kiekvienam scope
DROP INDEX IF EXISTS public.idx_boombox_tournament_queue;
CREATE INDEX IF NOT EXISTS idx_boombox_tournament_queue
  ON public.boombox_tournaments (scope, status, sort_order, created_at)
  WHERE status = 'pending';

-- Tas pats turnyras (scope + stilius + substilius) neturi kartotis
CREATE UNIQUE INDEX IF NOT EXISTS idx_boombox_tournament_unique
  ON public.boombox_tournaments (scope, genre_id, COALESCE(substyle_id, 0));

COMMIT;
