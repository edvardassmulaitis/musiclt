-- ============================================================
-- 2026-06-15 — „Mano muzika" valdymas + naujo nario onboarding
-- ============================================================
-- Iki šiol nario mėgstamos muzikos (atlikėjai / stiliai / nuotaikos daina)
-- buvo užpildoma TIK per legacy migraciją (admin), be jokio vartotojo UI.
-- Šis migration'as prideda pilną „Mano muzika" valdymo modelį:
--
--   * profile_favorite_artists  — papildom is_featured + weight + note
--   * profile_favorite_albums   — NAUJA (kuruoti mėgstami albumai)
--   * profile_favorite_tracks   — NAUJA (kuruotos mėgstamos dainos)
--   * profile_mood_songs        — NAUJA (nuotaikos dainų kolekcija; vienas
--                                  active sinchronizuojamas su
--                                  profiles.mood_song_track_id)
--   * profiles.music_setup_*    — onboarding būsenos vėliavos
--
-- Konvencija (kaip profile_favorite_artists): rašoma per service-role
-- (createAdminClient) iš API route'ų su getServerSession auth gating'u,
-- todėl RLS policy'ų nereikia. sort_order = rodymo eilė (drag), is_featured
-- = „prisegtas" (rodomas pirmas / paryškintas), weight = populiarumo svoris
-- (0-100, leidžia rankiniu būdu kelti/leisti įrašą profilio top'e).
-- ============================================================

BEGIN;

-- ── 1. profile_favorite_artists — papildomi valdymo laukai ────────────────
ALTER TABLE public.profile_favorite_artists
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS weight      SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS note        TEXT;

COMMENT ON COLUMN public.profile_favorite_artists.is_featured IS
  'Prisegtas atlikėjas — rodomas pirmas / paryškintas profilio kolekcijoje.';
COMMENT ON COLUMN public.profile_favorite_artists.weight IS
  'Populiarumo svoris 0-100 (rankinis), leidžia kelti įrašą profilio top''e.';
COMMENT ON COLUMN public.profile_favorite_artists.note IS
  'Laisvas nario komentaras prie atlikėjo (kodėl mėgsta).';


-- ── 2. profile_favorite_albums — kuruoti mėgstami albumai ─────────────────
CREATE TABLE IF NOT EXISTS public.profile_favorite_albums (
  user_id     UUID    NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  album_id    BIGINT  NOT NULL REFERENCES public.albums(id)   ON DELETE CASCADE,
  sort_order  INT     NOT NULL DEFAULT 0,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  weight      SMALLINT NOT NULL DEFAULT 0,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, album_id)
);
CREATE INDEX IF NOT EXISTS idx_profile_fav_albums_user
  ON public.profile_favorite_albums (user_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_profile_fav_albums_album
  ON public.profile_favorite_albums (album_id);

COMMENT ON TABLE public.profile_favorite_albums IS
  'Per-nario kuruotų mėgstamų albumų sąrašas. Valdoma /mano-muzika.';


-- ── 3. profile_favorite_tracks — kuruotos mėgstamos dainos ────────────────
CREATE TABLE IF NOT EXISTS public.profile_favorite_tracks (
  user_id     UUID    NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  track_id    BIGINT  NOT NULL REFERENCES public.tracks(id)   ON DELETE CASCADE,
  sort_order  INT     NOT NULL DEFAULT 0,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  weight      SMALLINT NOT NULL DEFAULT 0,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, track_id)
);
CREATE INDEX IF NOT EXISTS idx_profile_fav_tracks_user
  ON public.profile_favorite_tracks (user_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_profile_fav_tracks_track
  ON public.profile_favorite_tracks (track_id);

COMMENT ON TABLE public.profile_favorite_tracks IS
  'Per-nario kuruotų mėgstamų dainų sąrašas (atskira nuo „nuotaikos dainų").';


-- ── 4. profile_mood_songs — nuotaikos dainų kolekcija ─────────────────────
-- profiles.mood_song_track_id lieka „active" nuotaikos daina (rodoma hero).
-- Šita lentelė leidžia laikyti KELIAS nuotaikos dainas su etiketėmis ir
-- greitai perjungti aktyvią. resolve_active_mood_song() sinchronizuoja
-- profiles.mood_song_track_id su is_active=true įrašu.
CREATE TABLE IF NOT EXISTS public.profile_mood_songs (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID    NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  track_id   BIGINT  NOT NULL REFERENCES public.tracks(id)   ON DELETE CASCADE,
  mood_label TEXT,                                  -- pvz. „Rytinė", „Liūdesy"
  is_active  BOOLEAN NOT NULL DEFAULT false,
  sort_order INT     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profile_mood_songs_unique UNIQUE (user_id, track_id)
);
CREATE INDEX IF NOT EXISTS idx_profile_mood_songs_user
  ON public.profile_mood_songs (user_id, sort_order);
-- Tik VIENA aktyvi nuotaikos daina per narį.
CREATE UNIQUE INDEX IF NOT EXISTS uq_profile_mood_songs_active
  ON public.profile_mood_songs (user_id) WHERE is_active;

COMMENT ON TABLE public.profile_mood_songs IS
  'Nario nuotaikos dainų kolekcija. is_active=true sinchronizuojama su '
  'profiles.mood_song_track_id per resolve_active_mood_song().';


-- ── 5. profiles — onboarding būsenos ──────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS music_setup_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS music_setup_skipped      BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.music_setup_completed_at IS
  'Kada narys užbaigė „Mano muzika" susidėjimo srautą (onboarding).';
COMMENT ON COLUMN public.profiles.music_setup_skipped IS
  'Narys praleido onboarding srautą — nerodom prompto vėl.';


-- ── 6. RPC: resolve_active_mood_song ──────────────────────────────────────
-- Nustato vieną aktyvią nuotaikos dainą ir sinchronizuoja
-- profiles.mood_song_track_id. Idempotentiška.
CREATE OR REPLACE FUNCTION public.resolve_active_mood_song(
  p_user_id  UUID,
  p_track_id BIGINT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Nuimam seną active
  UPDATE public.profile_mood_songs
     SET is_active = false
   WHERE user_id = p_user_id AND is_active;

  IF p_track_id IS NOT NULL THEN
    -- Įterpiam jei nėra, ir pažymim active
    INSERT INTO public.profile_mood_songs (user_id, track_id, is_active)
    VALUES (p_user_id, p_track_id, true)
    ON CONFLICT (user_id, track_id)
    DO UPDATE SET is_active = true;

    UPDATE public.profiles
       SET mood_song_track_id = p_track_id,
           mood_song_set_at    = COALESCE(mood_song_set_at, now())
     WHERE id = p_user_id;
  ELSE
    UPDATE public.profiles
       SET mood_song_track_id = NULL
     WHERE id = p_user_id;
  END IF;
END;
$$;

COMMIT;
