-- Add scoring columns to artists table
ALTER TABLE artists
  ADD COLUMN IF NOT EXISTS score integer,
  ADD COLUMN IF NOT EXISTS score_override integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS score_updated_at timestamptz;

-- Index for sorting by score
CREATE INDEX IF NOT EXISTS idx_artists_score ON artists (score DESC NULLS LAST);

-- Add chart/certification columns to albums table (for INT scoring)
ALTER TABLE albums
  ADD COLUMN IF NOT EXISTS certifications jsonb,
  ADD COLUMN IF NOT EXISTS peak_chart_position integer;
