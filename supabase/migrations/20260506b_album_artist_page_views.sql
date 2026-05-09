-- ============================================================
-- 2026-05-06b — Page view tracking for albums + artists
-- ============================================================
-- Toks pat patternas kaip 20260506_page_view_tracking.sql,
-- bet `albums` ir `artists` lentelėms. Counter denormalizuotas
-- ant kiekvienos lentelės, increment'inamas atomic'iškai per RPC.
--
-- 30 min cookie dedup'as endpoint'e, kad page reload'ai netaškytų.

ALTER TABLE public.albums
  ADD COLUMN IF NOT EXISTS page_view_count BIGINT NOT NULL DEFAULT 0;

ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS page_view_count BIGINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS albums_page_view_count_idx
  ON public.albums (page_view_count DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS artists_page_view_count_idx
  ON public.artists (page_view_count DESC NULLS LAST);

CREATE OR REPLACE FUNCTION public.increment_album_page_view(p_album_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count BIGINT;
BEGIN
  UPDATE public.albums
     SET page_view_count = COALESCE(page_view_count, 0) + 1
   WHERE id = p_album_id
   RETURNING page_view_count INTO new_count;
  RETURN new_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_artist_page_view(p_artist_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count BIGINT;
BEGIN
  UPDATE public.artists
     SET page_view_count = COALESCE(page_view_count, 0) + 1
   WHERE id = p_artist_id
   RETURNING page_view_count INTO new_count;
  RETURN new_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_album_page_view(BIGINT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_artist_page_view(BIGINT) TO anon, authenticated, service_role;
