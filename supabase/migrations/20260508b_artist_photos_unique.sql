-- Pridedam UNIQUE constraint ant artist_photos (artist_id, url) — anksčiau
-- re-runs sukurdavo duplicate'us (820 vietoj 41 nuotraukų). Pirma dedupe
-- esamus, tada constraint.

-- Dedupe — paliekam mažiausią id už kiekvieną (artist_id, url) porą
DELETE FROM public.artist_photos a
USING public.artist_photos b
WHERE a.id > b.id
  AND a.artist_id = b.artist_id
  AND a.url = b.url;

-- UNIQUE constraint (PostgreSQL nepalaiko ADD CONSTRAINT IF NOT EXISTS,
-- todėl per DO blocką tikrinam ar jau egzistuoja).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_artist_photos_url'
    ) THEN
        ALTER TABLE public.artist_photos
            ADD CONSTRAINT uq_artist_photos_url
            UNIQUE (artist_id, url);
    END IF;
END $$;
