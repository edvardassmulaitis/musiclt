-- ============================================================
-- 2026-04-30 — notification preferences (per-user, per-type toggles)
-- ============================================================
-- Vienas row per (user, type) — jei toggle išjungta, createNotification
-- praleidžia šio tipo įrašą tam user'iui. Default: viskas įjungta (jei
-- row'o nėra — laikoma enabled).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, type)
);

CREATE INDEX IF NOT EXISTS idx_notif_prefs_user
  ON public.notification_preferences (user_id);

COMMENT ON TABLE public.notification_preferences IS
  'Per-user notification toggles. Row absence = enabled (default).';
