-- ============================================================
-- 2026-06-15d — „Mano muzika": atskiri stilių topai
-- ============================================================
-- Kiekvienam stiliui (žanrui) nario nepriklausomas rikiavimas: „mano roko
-- top", „mano pop top" ir t.t. Atskira nuo bendro sąrašo (profile_favorite_*).
-- entity → stilius vienareikšmis (pagal pagrindinį žanrą), todėl pakanka
-- vieno sort_order per (user, kind, entity); rikiuojant lyginam tik to paties
-- stiliaus įrašus.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.profile_style_ranks (
  user_id    UUID   NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind       TEXT   NOT NULL CHECK (kind IN ('artist', 'album', 'track')),
  entity_id  BIGINT NOT NULL,
  sort_order INT    NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_profile_style_ranks
  ON public.profile_style_ranks (user_id, kind, sort_order);

COMMENT ON TABLE public.profile_style_ranks IS
  'Nepriklausomas per-stilių rikiavimas „Mano muzika" stilių topams. '
  'sort_order lyginamas tik tarp to paties stiliaus (žanro) įrašų.';

COMMIT;
