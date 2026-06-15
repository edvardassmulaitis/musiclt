-- ============================================================
-- 2026-06-15b — „Mano muzika" pakopos (Topas / Mėgstami / Biblioteka)
-- ============================================================
-- Didelėms kolekcijoms (šimtai patiktukų) rankinis viso sąrašo rikiavimas
-- netinka. Pereinam prie pakopų:
--   • bucket=1  → „Topas" (iki 20, rodomas profilyje, drag + jump-to-position)
--   • bucket=2  → „Mėgstami" (iki 100, sustumdomi)
--   • be kuruoto įrašo → „Biblioteka" (visi patiktukai, auto-sort + paieška)
--
-- Esamus kuruotus įrašus perkeliam: featured → Topas, kiti → Mėgstami.
--
-- + likes.user_id backfill: daug legacy patiktukų turi tik user_username
--   (be user_id). Susiejam su profiliais pagal lower(username), kad „Mano
--   muzika" / bibliotekos užklausos eitų per user_id indeksą (greitaveika).
-- ============================================================

BEGIN;

-- ── 1. bucket stulpelis ───────────────────────────────────────────────────
ALTER TABLE public.profile_favorite_artists ADD COLUMN IF NOT EXISTS bucket SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE public.profile_favorite_albums  ADD COLUMN IF NOT EXISTS bucket SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE public.profile_favorite_tracks  ADD COLUMN IF NOT EXISTS bucket SMALLINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profile_favorite_artists.bucket IS '0=biblioteka, 1=Topas (max 20), 2=Mėgstami (max 100)';

-- ── 2. Esamus curated įrašus į pakopas (featured→Topas, kiti→Mėgstami) ─────
UPDATE public.profile_favorite_artists SET bucket = CASE WHEN is_featured THEN 1 ELSE 2 END WHERE bucket = 0;
UPDATE public.profile_favorite_albums  SET bucket = CASE WHEN is_featured THEN 1 ELSE 2 END WHERE bucket = 0;
UPDATE public.profile_favorite_tracks  SET bucket = CASE WHEN is_featured THEN 1 ELSE 2 END WHERE bucket = 0;

-- ── 3. Indeksai pakopų filtravimui ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pfa_user_bucket ON public.profile_favorite_artists (user_id, bucket, sort_order);
CREATE INDEX IF NOT EXISTS idx_pfal_user_bucket ON public.profile_favorite_albums  (user_id, bucket, sort_order);
CREATE INDEX IF NOT EXISTS idx_pft_user_bucket ON public.profile_favorite_tracks  (user_id, bucket, sort_order);

COMMIT;
