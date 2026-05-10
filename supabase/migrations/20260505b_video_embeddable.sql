-- ============================================================
-- 2026-05-05 — tracks.video_embeddable: ar embed leidžiamas?
-- ============================================================
-- Daug muzikos kanalų (pvz SelMusic) išjungia embed'ą trečioms
-- šalims (YouTube error: "Klaida 153" / "Owner has disabled
-- embedding"). Šitas video_url vis tiek vertingas (galim rodyti
-- thumbnail + link į YouTube), bet iframe rodo juodą langą.
--
-- Sprendimas: per enrich srautą tikrinam ar embed leidžiamas;
-- saugom flag'ą; UI atitinkamai render'ina iframe arba fallback.
--
-- Reikšmės:
--   NULL  — dar netikrinta (default arba nauja eilutė)
--   TRUE  — embed leidžiamas, normaliai rodo iframe
--   FALSE — embed disabled, UI rodo "Žiūrėti YouTube'e" CTA

ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS video_embeddable BOOLEAN;

-- Indeksas filter'ams (kiek track'ų turi embed disabled)
CREATE INDEX IF NOT EXISTS tracks_video_embeddable_idx
  ON public.tracks (video_embeddable)
  WHERE video_embeddable IS NOT NULL;
