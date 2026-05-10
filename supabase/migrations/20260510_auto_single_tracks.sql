-- Auto-mark tracks as is_single when their album has type_single=true.
--
-- Reason: Wiki parser (lib/wiki-parser.ts) populates tracks.is_single
-- only when track title exactly matches Wikipedia singles infobox list.
-- Strict matching missesa lot of cases:
--   • Title variants ("We Pray (Be Our Guest)" vs "We Pray")
--   • Standalone single releases (track exists in album but album is
--     type_single=true → it IS a single by definition)
--
-- Coldplay had 21 tracks marked is_single, Wikipedia lists 43 singles.
-- After this migration, all tracks belonging to type_single albums
-- get is_single=true.
--
-- Idempotent: only updates rows where current value DIFFERS.

UPDATE tracks t
SET is_single = TRUE
FROM album_tracks at
JOIN albums a ON a.id = at.album_id
WHERE at.track_id = t.id
  AND a.type_single = TRUE
  AND (t.is_single IS DISTINCT FROM TRUE);

-- Verify count after migration:
-- SELECT COUNT(*) FROM tracks WHERE is_single = TRUE;
