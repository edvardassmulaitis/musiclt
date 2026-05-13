-- Deduplicate artist_eras rows and add a unique constraint so seed
-- migrations / multi-runs don't create duplicates.
--
-- Strategy:
--   1. Delete duplicate rows, keeping the lowest id per (artist_id, title,
--      year_start) group. This preserves the original insert and drops
--      any later identical re-runs.
--   2. Re-apply the Coldplay seed (idempotent since we just deduped).
--   3. Add a partial unique index — same artist can't have two eras with
--      the same (title, year_start) tuple. Title can repeat across artists.

DELETE FROM artist_eras a
USING artist_eras b
WHERE a.artist_id = b.artist_id
  AND a.title     = b.title
  AND a.year_start = b.year_start
  AND a.id        > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS artist_eras_unique_per_artist
  ON artist_eras (artist_id, title, year_start);
