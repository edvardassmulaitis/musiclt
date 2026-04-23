-- Events legacy table + expand legacy_likes to accept 'event' entity_type.
--
-- Purpose: pilnas grupių-centric scrape įima ir renginius + attendees.

-- 1) Expand legacy_likes CHECK constraint
ALTER TABLE public.legacy_likes
  DROP CONSTRAINT IF EXISTS legacy_likes_entity_type_check;
ALTER TABLE public.legacy_likes
  ADD CONSTRAINT legacy_likes_entity_type_check
  CHECK (entity_type IN ('artist','album','track','message','event','other'));

-- 2) Events lentelė
CREATE TABLE IF NOT EXISTS public.events_legacy (
    legacy_id INTEGER PRIMARY KEY,
    slug TEXT,
    title TEXT,
    artist_legacy_id INTEGER,   -- jei event'as priklauso konkrečiai grupei
    event_date DATE,
    event_time TEXT,
    city TEXT,
    venue_name TEXT,
    ticket_price_text TEXT,     -- raw "154 - 304 Lt" ar "€20"
    ticket_price_min NUMERIC,
    ticket_price_max NUMERIC,
    ticket_url TEXT,
    description TEXT,
    source_url TEXT NOT NULL,
    imported_at TIMESTAMPTZ DEFAULT now(),
    source TEXT DEFAULT 'legacy_scrape_v1'
);

CREATE INDEX IF NOT EXISTS idx_events_legacy_artist ON public.events_legacy (artist_legacy_id);
CREATE INDEX IF NOT EXISTS idx_events_legacy_date ON public.events_legacy (event_date DESC);

-- 3) RLS public read
ALTER TABLE public.events_legacy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read" ON public.events_legacy;
CREATE POLICY "public read" ON public.events_legacy FOR SELECT USING (true);

-- 4) Convenience view
CREATE OR REPLACE VIEW public.v_artist_events_upcoming AS
SELECT
  a.id AS artist_id,
  a.name AS artist_name,
  e.legacy_id AS event_legacy_id,
  e.title,
  e.event_date,
  e.city,
  e.venue_name,
  e.ticket_price_text,
  (SELECT COUNT(*) FROM public.legacy_likes
   WHERE entity_type = 'event' AND entity_legacy_id = e.legacy_id) AS attendee_count
FROM public.events_legacy e
LEFT JOIN public.artists a ON a.legacy_id = e.artist_legacy_id
ORDER BY e.event_date DESC NULLS LAST;

COMMENT ON TABLE public.events_legacy IS
  'Legacy music.lt events, scraped from /Artist-Name-renginys-{id}.html pages.';
