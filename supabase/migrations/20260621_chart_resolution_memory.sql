-- ─────────────────────────────────────────────────────────────────────────────
-- chart_resolution_memory — pastovi „atmintis" kuriam katalogo entitetui (daina/
-- albumas) priklauso konkretus chart įrašas (atlikėjas|pavadinimas).
--
-- PROBLEMA: chart_store.py carry-over saugojo rankinius/auto sujungimus TIK tame
-- pačiame chart_id. Kai period_label pasikeičia (kworb deda šios dienos datą →
-- kasdien naujas chart row), upsert sukuria NAUJĄ chartą, o carry-over skaito
-- senus entries iš to NAUJO (tuščio) chart_id → sujungimas prarandamas ir kitą
-- dieną pora vėl 'pending'. Tai matėsi kaip „sujungiau, o rytoj vėl atsietas".
--
-- SPRENDIMAS: globali, nuo chart'o/edition'o NEpriklausoma lentelė, raktas =
-- normalizuotas(atlikėjas)|normalizuotas(pavadinimas) + kind. Kiekvieną kartą kai
-- įrašas sujungiamas (auto, bulk ar rankiniu būdu) — UPSERT čia. Per ingest, jei
-- inline auto-match nerado, konsultuojam šią atmintį PRIEŠ paliekant 'pending'.
--
-- norm_key formatas = matchNorm(artist) || '|' || matchNorm(title), kur matchNorm:
--   lower → unaccent (LT/diakritika) → versijų priesagų nuėmimas → feat/() nuėmimas
--   → tik raidės/skaitmenys (unicode, KIRILICA išsaugoma) → vienas tarpas.
-- aggr_key = ta pati be VISŲ skliaustų (fallback'ui kai raw title šiek tiek kinta).
--
-- FK on delete: jei daina/albumas ištrinamas — atminties eilutė pati pasišalina
-- (cascade); artist_id → set null. Taip atmintis savaime nekaupia „stale" rodyklių.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chart_resolution_memory (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  norm_key    text NOT NULL,
  aggr_key    text,
  kind        text NOT NULL CHECK (kind IN ('track', 'album')),
  track_id    bigint REFERENCES public.tracks(id)  ON DELETE CASCADE,
  album_id    bigint REFERENCES public.albums(id)  ON DELETE CASCADE,
  artist_id   bigint REFERENCES public.artists(id) ON DELETE SET NULL,
  resolve_state text NOT NULL DEFAULT 'matched',  -- 'matched' | 'created'
  last_artist_name text,
  last_title       text,
  hits        integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (norm_key, kind)
);

-- Pagrindinis lookup: (norm_key, kind). aggr_key — antrinis fallback lookup.
CREATE INDEX IF NOT EXISTS idx_chart_res_mem_key
  ON public.chart_resolution_memory (norm_key, kind);
CREATE INDEX IF NOT EXISTS idx_chart_res_mem_aggr
  ON public.chart_resolution_memory (aggr_key, kind)
  WHERE aggr_key IS NOT NULL;

-- updated_at touch
CREATE OR REPLACE FUNCTION public.touch_chart_res_mem()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_chart_res_mem ON public.chart_resolution_memory;
CREATE TRIGGER trg_touch_chart_res_mem
  BEFORE UPDATE ON public.chart_resolution_memory
  FOR EACH ROW EXECUTE FUNCTION public.touch_chart_res_mem();
