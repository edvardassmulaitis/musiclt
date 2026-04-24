-- Photographers as first-class authors.
--
-- Context: photo captions used to be a blob — `{"a":"Brianhphoto · CC BY-SA 4.0","s":"https://..."}`.
-- Promoting photographers to their own table gives us:
--   1. A place to aggregate all photos by one photographer across artists.
--   2. Future `/fotografas/[slug]` showcase pages (especially for LT
--      photographers who want a portfolio on music.lt).
--   3. Normalized name/website/license fields instead of string parsing.
--
-- The `license` + `source_url` stay on `artist_photos` because they can vary
-- per photo (a photographer might have both CC BY-SA and CC0 photos).

CREATE TABLE IF NOT EXISTS public.photographers (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT UNIQUE,
  name TEXT NOT NULL,
  website_url TEXT,
  bio TEXT,
  avatar_url TEXT,
  instagram_url TEXT,
  facebook_url TEXT,
  -- Where this photographer was first discovered. Useful for de-duping
  -- Wikimedia usernames vs. self-registered LT photographers later.
  source TEXT,                   -- 'wikimedia' | 'flickr' | 'admin' | 'direct'
  external_url TEXT,             -- Canonical profile URL on the source site
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_photographers_slug ON public.photographers(slug);
CREATE INDEX IF NOT EXISTS idx_photographers_name ON public.photographers(name);

-- Link artist_photos to a photographer. Nullable so legacy rows remain valid.
ALTER TABLE public.artist_photos
  ADD COLUMN IF NOT EXISTS photographer_id BIGINT
    REFERENCES public.photographers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS license TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT;

CREATE INDEX IF NOT EXISTS idx_artist_photos_photographer
  ON public.artist_photos(photographer_id);

COMMENT ON TABLE public.photographers IS
  'Canonical list of photographers / image authors. Referenced from artist_photos.photographer_id.';
COMMENT ON COLUMN public.artist_photos.license IS
  'Per-photo license string (e.g. "CC BY-SA 4.0"). May differ across photos by the same photographer.';
COMMENT ON COLUMN public.artist_photos.source_url IS
  'Canonical source URL for this specific photo (Wikimedia file page, Flickr page, etc.).';
