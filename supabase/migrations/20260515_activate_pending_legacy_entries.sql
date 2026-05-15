-- ============================================================
-- 2026-05-15 — Auto-activate music.lt scrape entries
-- ============================================================
-- Edvardo sprendimas (2026-05-15): music.lt scrape entries iškart aktyvūs,
-- matomi viešai per main diskografijos tab'us (Studijiniai/Kiti/Singlai).
-- Wiki Import paskui veikia kaip enrichment overlay (release_year,
-- peak_chart, certifications, is_single, video_url, lyrics).
--
-- Pending review tab'as natūraliai išnyksta — admin'as nebenaudoja per
-- review-by-row dropdown'us. Music.lt scrape yra one-off, vėliau viskas
-- tvarkoma per Wiki ir other source'us.
--
-- Backfill: visi existing 'legacy_scrape_pending' → 'legacy_scrape_v1'.
-- ============================================================

-- 1. Diagnostic — kiek entries pasikeis
DO $$
DECLARE
  n_alb INTEGER;
  n_trk INTEGER;
BEGIN
  SELECT count(*) INTO n_alb FROM public.albums WHERE source = 'legacy_scrape_pending';
  SELECT count(*) INTO n_trk FROM public.tracks WHERE source = 'legacy_scrape_pending';
  RAISE NOTICE 'Pending → v1: % albums, % tracks', n_alb, n_trk;
END $$;

-- 2. Activate albums
UPDATE public.albums
SET source = 'legacy_scrape_v1'
WHERE source = 'legacy_scrape_pending';

-- 3. Activate tracks
UPDATE public.tracks
SET source = 'legacy_scrape_v1'
WHERE source = 'legacy_scrape_pending';

-- 4. Verify
DO $$
DECLARE
  n_alb_left INTEGER;
  n_trk_left INTEGER;
BEGIN
  SELECT count(*) INTO n_alb_left FROM public.albums WHERE source = 'legacy_scrape_pending';
  SELECT count(*) INTO n_trk_left FROM public.tracks WHERE source = 'legacy_scrape_pending';
  RAISE NOTICE 'Po activate: % pending albums liko, % pending tracks liko', n_alb_left, n_trk_left;
END $$;
