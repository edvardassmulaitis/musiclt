-- ============================================================
-- 2026-04-30 — Track drops (emoji reactions)
-- ============================================================
-- "Drops" = lengvi emoji reaction signals ant dainų. 4 emoji:
--   fire   🔥 banger
--   goat   🐐 GOAT
--   cry    😭 hits different
--   yikes  😬 not for me
--
-- Vienas useris gali turėti TIK VIENĄ drop'ą ant dainos vienu metu —
-- jei jau turi 'fire' ir spaudžia 'goat', fire panaikinamas + goat
-- pridedamas. Implementacija: UPSERT pagal (track_id, identity).
--
-- Anonim'ams: identity = session_fp (HTTPOnly cookie UUID), kuris
-- išlieka tarp puslapių apsilankymo. Auth'inti'iems: identity = user_id.
-- UNIQUE indeksas užtikrina vienas-drop-per-identity-per-track.

CREATE TABLE IF NOT EXISTS public.track_drops (
  id          BIGSERIAL PRIMARY KEY,
  track_id    INTEGER NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  session_fp  TEXT,
  emoji       TEXT NOT NULL CHECK (emoji IN ('fire', 'goat', 'cry', 'yikes')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Identity check: turi būti arba user_id, arba session_fp (ne abu null'ai).
  CONSTRAINT track_drops_identity_check CHECK (
    user_id IS NOT NULL OR session_fp IS NOT NULL
  )
);

-- Vienas drop per identity per track. COALESCE leidžia mums turėti vieną
-- partial unique indexą abiem identity tipams (auth + anon).
CREATE UNIQUE INDEX IF NOT EXISTS track_drops_unique_user
  ON public.track_drops (track_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS track_drops_unique_anon
  ON public.track_drops (track_id, session_fp)
  WHERE user_id IS NULL AND session_fp IS NOT NULL;

-- Aggregation indeksas — dažniausia užklausa: SELECT emoji, COUNT(*) WHERE track_id=N GROUP BY emoji
CREATE INDEX IF NOT EXISTS track_drops_track_emoji_idx
  ON public.track_drops (track_id, emoji);

-- Anti-abuse: rate-limit'as per session_fp (jei vienas anon labai
-- aktyviai drop'ina po visus dainas — galim count'ą per IP / per
-- session per hour). Indekso užtenka, sliding window logika
-- daroma API endpoint'e.
CREATE INDEX IF NOT EXISTS track_drops_session_created_idx
  ON public.track_drops (session_fp, created_at DESC)
  WHERE session_fp IS NOT NULL;
