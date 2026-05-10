-- ============================================================
-- 2026-05-01 — activity_events.entity_image
-- ============================================================
-- "Kas vyksta" feed'ui (NotificationsBell + LiveWidget) reikia rodyti
-- entity nuotraukos (artist photo, album cover, track cover, event poster).
-- Pridedam denormalized URL kolumną — log'inant užfiksuojam dabartinę
-- nuotraukos URL'ą, kad UI nereikėtų atskiro JOIN'o renderinant feed'ą.
-- ============================================================

ALTER TABLE public.activity_events
  ADD COLUMN IF NOT EXISTS entity_image TEXT;

COMMENT ON COLUMN public.activity_events.entity_image IS
  'Snapshot URL nuotraukos atvaizdavimui Kas vyksta feed''e (artist/album/track cover, event poster).';
