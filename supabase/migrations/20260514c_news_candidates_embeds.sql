-- ============================================================
-- 2026-05-14 — news_candidates: embed_urls + visi prie news priskirti tracks
-- ============================================================
-- Tikslas: kad naujieji release'ai turėtų YT/Spotify video kortelę
-- inbox'e (kaip ir realios news'os) — saugom embed URLs iš source'o.
-- ============================================================

ALTER TABLE public.news_candidates
  ADD COLUMN IF NOT EXISTS embed_urls TEXT[] DEFAULT '{}';
