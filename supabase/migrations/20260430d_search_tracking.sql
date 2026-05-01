-- ============================================================
-- 2026-04-30d — Master search tracking
-- ============================================================
-- Saugom user'ių paieškos click'us, kad galėtume:
--   - Suskaičiuoti, kurie atlikėjai/dainos dažniausiai randami per paiešką
--   - Parodyti "Populiaru dabar" sekciją modal'e (top artists + tracks
--     iš last-7-dienų click'ų)
--   - Future: trending querys (paskutinės savaitės top užklausos kaip
--     pill chip'ai)
--
-- Schema: viena lentelė individual click event'ams. Aggregation per query
-- (GROUP BY + count). Indeksai užtikrina, kad SELECT ant 7d window'o liks
-- greitas net su >100k įrašu.

CREATE TABLE IF NOT EXISTS public.search_clicks (
  id          BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,         -- 'artists' | 'tracks' | 'albums' | 'profiles' | 'events' | 'news' | 'blog_posts' | 'discussions' | 'venues'
  entity_id   BIGINT NOT NULL,       -- ID atitinkamoje lentelėje (uuid event'ams — castinam į text laidymo vietoj; čia laikom 0 jei tipas ne-bigint)
  entity_uuid TEXT,                  -- jei tipas turi uuid (events) — saugom čia
  query       TEXT,                  -- ką user'is paieškoje įvedė (gali būt NULL)
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_clicks_entity      ON public.search_clicks(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_search_clicks_entity_uuid ON public.search_clicks(entity_type, entity_uuid);
CREATE INDEX IF NOT EXISTS idx_search_clicks_recent      ON public.search_clicks(created_at DESC);

-- RLS — anonim user'iai gali INSERT'inti (rašom click'us be auth), bet
-- SELECT'inti tik admin'ai (raw events; agregatai eis per service-role).
ALTER TABLE public.search_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS search_clicks_insert_anon ON public.search_clicks;
CREATE POLICY search_clicks_insert_anon
  ON public.search_clicks FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS search_clicks_select_admin ON public.search_clicks;
CREATE POLICY search_clicks_select_admin
  ON public.search_clicks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
  );
