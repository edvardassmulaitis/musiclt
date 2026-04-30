-- ============================================================
-- 2026-04-30 — `push_subscriptions` lentelė (Web Push API)
-- ============================================================
-- Saugom kiekvieno user'io kiekvieno device'o push subscription objects'ą,
-- kurį grąžina browser'is per `pushManager.subscribe()`. Vienas user'is
-- gali turėti kelis row'us (telefonas + laptopas + darbinė machine),
-- viskas siunčiama paraleliai per web-push lib.
--
-- endpoint UNIQUE — taip apsaugot nuo duplikatų jei user'is dar kartą
-- subscribe'ina ant to paties device'o.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user
  ON public.push_subscriptions (user_id);

COMMENT ON TABLE public.push_subscriptions IS
  'Web Push API subscription objects per device. Vienas user gali turėti kelis row''us (skirtingi browser/device).';
