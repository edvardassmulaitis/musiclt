-- ============================================================
-- 2026-05-21h — profile photos + mood song pending placeholder
-- ============================================================
-- Du papildomi pakeitimai narių migracijai:
--
-- 1. profiles.legacy_profile_photos JSONB — music.lt /images/lankytojai/<uid>/
--    photo array (`var photomN`, `var photodescmN` JS bloke). Saugom kaip
--    [{url, thumb_url, caption, sort_order}, ...]. UI rodys hero photo
--    sekcijoje, ne avatar'o vietoje.
--    profiles.cover_image_url ATNAUJINAMAS pagrindiniu photo URL'u
--    (backward compat su esamais UI komponentais).
--
-- 2. profiles.mood_song_legacy_track_id BIGINT — placeholder mood song
--    track'ui, kuris dar nemigruotas. Po atlikėjo/track'o importo
--    `resolve_pending_mood_song()` RPC set'ina mood_song_track_id.
-- ============================================================

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS legacy_profile_photos JSONB,
  ADD COLUMN IF NOT EXISTS mood_song_legacy_track_id BIGINT;

COMMENT ON COLUMN public.profiles.legacy_profile_photos IS
  'music.lt /images/lankytojai/<uid>/ photo array. Format: '
  '[{url, thumb_url, caption, sort_order}, ...]. Pirmasis = pagrindinis '
  'profilio paveikslėlis (ne avatar).';

COMMENT ON COLUMN public.profiles.mood_song_legacy_track_id IS
  'Placeholder mood song track_id (music.lt legacy_id), kol track migruotas. '
  'resolve_pending_mood_song() po atlikėjo importo set''ina mood_song_track_id.';

-- ============================================================
-- RPC: resolve_pending_mood_song
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_pending_mood_song(
  p_legacy_track_id  BIGINT,
  p_modern_track_id  BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT := 0;
BEGIN
  WITH updated AS (
    UPDATE public.profiles
       SET mood_song_track_id = p_modern_track_id,
           mood_song_set_at   = COALESCE(mood_song_set_at, now())
     WHERE mood_song_legacy_track_id = p_legacy_track_id
       AND mood_song_track_id IS NULL
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_updated FROM updated;

  RETURN jsonb_build_object(
    'legacy_track_id', p_legacy_track_id,
    'modern_track_id', p_modern_track_id,
    'resolved',        v_updated
  );
END $$;

COMMENT ON FUNCTION public.resolve_pending_mood_song IS
  'Po track migracijos: set''ina profiles.mood_song_track_id placeholder''iams '
  '(mood_song_legacy_track_id match).';

COMMIT;
