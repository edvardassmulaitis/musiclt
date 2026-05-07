-- Add legacy_id + source_url į events lentelę kad canonical pipeline'as
-- (forum_lib.upsert_event) galetume idempotent'iškai re-import'inti.
-- event_artists junction jau egzistuoja — nieko keisti nereikia.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS legacy_id BIGINT,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS is_legacy BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_events_legacy_id
  ON public.events (legacy_id) WHERE legacy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_legacy
  ON public.events (is_legacy) WHERE is_legacy = TRUE;
