-- ============================================================
-- 2026-05-06 — Page view tracking for tracks (and albums later)
-- ============================================================
-- Naujas counter denormalizuotas ant `tracks.page_view_count`,
-- atnaujinamas atomic'iškai per RPC `increment_track_page_view`
-- iš track puslapio. UI sees current count be papildomu užklausų.
--
-- Dedup'as — cookie-based 30 min: vienas user/anon vienam track per
-- 30 min vienas page-view (server-side patikrinama tarp request'ų
-- per `last_seen_at` lentelę arba paprasčiausiai per cookie/sessionId).
--
-- Be triggers, be append-only event log'o (kol kas) — paprasta start.
-- Vėliau galima pridėti `track_page_views` event log'ą, jei reikės
-- analytics (per-country, time-series).

ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS page_view_count BIGINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS tracks_page_view_count_idx
  ON public.tracks (page_view_count DESC NULLS LAST);

-- Atomic increment RPC. Naudojam vietoj UPDATE...SET = +1, kad
-- concurrent klients negaudytų race condition'o.
CREATE OR REPLACE FUNCTION public.increment_track_page_view(p_track_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count BIGINT;
BEGIN
  UPDATE public.tracks
     SET page_view_count = COALESCE(page_view_count, 0) + 1
   WHERE id = p_track_id
   RETURNING page_view_count INTO new_count;
  RETURN new_count;
END;
$$;

-- Anonymous + authenticated užklausos turi galėti kviesti per RPC.
GRANT EXECUTE ON FUNCTION public.increment_track_page_view(BIGINT) TO anon, authenticated, service_role;
