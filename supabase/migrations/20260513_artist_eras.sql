-- Artist eras (custom periodization for an artist's discography).
--
-- WHY: a flat chronological album grid for big artists (Coldplay = 22
-- albums, Queen = 30+) is visually flat and gives no narrative. Allow
-- admins to bucket albums into named eras with optional descriptions, while
-- still keeping the auto-decade fallback at the rendering layer (so most
-- artists need zero data here).
--
-- A row in `artist_eras` represents one era; albums are NOT directly linked
-- via FK (instead the rendering layer assigns each album to the matching
-- era by year_start..year_end), but we keep `featured_album_ids` for
-- explicit „spotlight inside this era" picks.
--
-- Order of eras on the page is `sort_order` ASC. Convention: newest era
-- first → sort_order = 0; older → higher numbers. Admin UI will surface
-- drag-reorder.

CREATE TABLE IF NOT EXISTS artist_eras (
  id           bigserial   PRIMARY KEY,
  artist_id    bigint      NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  sort_order   int         NOT NULL DEFAULT 0,
  title        text        NOT NULL,
  subtitle     text,
  year_start   int         NOT NULL,
  year_end     int,                          -- NULL = „— dabar"
  description  text,                          -- 1–2 sakiniai, rodomas po title
  featured_album_ids bigint[] DEFAULT '{}'::bigint[],
  source       text        DEFAULT 'manual',  -- 'manual' | 'auto_decade' | 'wikipedia'
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS artist_eras_artist_sort_idx
  ON artist_eras (artist_id, sort_order);

CREATE INDEX IF NOT EXISTS artist_eras_year_range_idx
  ON artist_eras (artist_id, year_start, year_end);

-- updated_at trigger
CREATE OR REPLACE FUNCTION artist_eras_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS artist_eras_touch ON artist_eras;
CREATE TRIGGER artist_eras_touch
  BEFORE UPDATE ON artist_eras
  FOR EACH ROW EXECUTE FUNCTION artist_eras_touch_updated_at();

-- RLS — public read, admin write (per Supabase default JWT pattern).
ALTER TABLE artist_eras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS artist_eras_select_public ON artist_eras;
CREATE POLICY artist_eras_select_public
  ON artist_eras FOR SELECT
  USING (true);

-- service_role bypasses RLS by default (admin operations).

COMMENT ON TABLE artist_eras IS
  'Optional per-artist period grouping for discography display. NULL year_end = ongoing era.';
COMMENT ON COLUMN artist_eras.featured_album_ids IS
  'Album IDs to render larger inside this era (spotlight slots). Albums still belong to era by year, not by this list.';
COMMENT ON COLUMN artist_eras.source IS
  'Provenance hint — manual (admin), auto_decade (auto-generated from decades), wikipedia (extracted from wiki sections).';
