-- ============================================================================
-- Track merge flow: audit log + atomic RPC
-- ============================================================================
-- Scenario: importing different artists' discographies creates duplicate tracks
-- of the same featuring song (e.g. "03 Bonnie & Clyde" appears under both Jay-Z
-- and Beyoncé imports). This migration adds:
--   1. track_merges audit table — records every merge, with full snapshot so
--      merges can be reverted if wrong.
--   2. merge_tracks() RPC — atomic transaction that copies data/links from
--      loser → winner, logs to audit, then hard-deletes loser.
--   3. Unique constraints on album_tracks and track_artists join tables so
--      ON CONFLICT DO NOTHING works cleanly during union.
-- ============================================================================

-- Ensure join tables have uniqueness we rely on for the union step.
-- If data already violates, the statements will fail — clean up duplicates
-- manually first, then rerun.
CREATE UNIQUE INDEX IF NOT EXISTS uq_album_tracks_album_track
  ON album_tracks (album_id, track_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_track_artists_track_artist
  ON track_artists (track_id, artist_id);

-- Audit log
CREATE TABLE IF NOT EXISTS track_merges (
  id               BIGSERIAL PRIMARY KEY,
  winner_id        INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  loser_id         INTEGER NOT NULL,      -- intentionally NOT FK — loser row is deleted, kept for audit trail
  loser_title      TEXT NOT NULL,
  loser_artist_id  INTEGER,
  merged_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  merged_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  field_choices    JSONB,                 -- {"title":"winner"|"loser", "release_year":"winner"|"loser", ...}
  snapshot_json    JSONB NOT NULL,        -- full loser row + album_tracks + track_artists before merge (for revert)
  reverted_at      TIMESTAMPTZ,
  reverted_by      UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_track_merges_winner    ON track_merges (winner_id);
CREATE INDEX IF NOT EXISTS idx_track_merges_loser     ON track_merges (loser_id);
CREATE INDEX IF NOT EXISTS idx_track_merges_merged_at ON track_merges (merged_at DESC);

-- RLS: only admins read/write track_merges via service role (which bypasses RLS).
-- Public cannot see merge history.
ALTER TABLE track_merges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS track_merges_no_public ON track_merges;
CREATE POLICY track_merges_no_public ON track_merges FOR SELECT USING (false);

-- ============================================================================
-- merge_tracks(winner_id, loser_id, field_choices, merged_by)
-- ============================================================================
-- Executes an atomic merge:
--   - Snapshots loser row + all links to JSONB for audit/revert.
--   - Applies chosen scalar fields to winner (per field_choices).
--   - Unions loser's album_tracks into winner's (ON CONFLICT DO NOTHING — preserves winner's positions).
--   - Unions loser's track_artists (featuring) into winner's.
--   - If loser's main artist isn't already winner's main or featuring, adds as featuring.
--   - Inserts track_merges audit row.
--   - Hard-deletes loser row; FK cascades handle leftover album_tracks/track_artists;
--     voting_participants.track_id is SET NULL by existing FK.
--
-- field_choices keys (all optional, default = keep winner):
--   title, type, is_single, release_date, release_year, release_month, release_day,
--   video_url, spotify_id, lyrics, chords, cover_url, description
-- Values: 'winner' (default, no-op) or 'loser' (copy from loser).
-- ============================================================================
CREATE OR REPLACE FUNCTION merge_tracks(
  p_winner_id     INTEGER,
  p_loser_id      INTEGER,
  p_field_choices JSONB DEFAULT '{}'::jsonb,
  p_merged_by     UUID  DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_loser         tracks%ROWTYPE;
  v_winner        tracks%ROWTYPE;
  v_snapshot      JSONB;
  v_loser_main    INTEGER;
  v_winner_has    BOOLEAN;
BEGIN
  IF p_winner_id IS NULL OR p_loser_id IS NULL THEN
    RAISE EXCEPTION 'winner_id and loser_id are required';
  END IF;
  IF p_winner_id = p_loser_id THEN
    RAISE EXCEPTION 'winner and loser must be different tracks';
  END IF;

  -- Lock both rows for the duration of the transaction
  SELECT * INTO v_winner FROM tracks WHERE id = p_winner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'winner track % not found', p_winner_id; END IF;

  SELECT * INTO v_loser  FROM tracks WHERE id = p_loser_id  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'loser track % not found', p_loser_id; END IF;

  v_loser_main := v_loser.artist_id;

  -- Snapshot everything we might need to restore
  v_snapshot := jsonb_build_object(
    'track',         to_jsonb(v_loser),
    'album_tracks',  COALESCE(
                       (SELECT jsonb_agg(to_jsonb(at)) FROM album_tracks at WHERE at.track_id = p_loser_id),
                       '[]'::jsonb
                     ),
    'track_artists', COALESCE(
                       (SELECT jsonb_agg(to_jsonb(ta)) FROM track_artists ta WHERE ta.track_id = p_loser_id),
                       '[]'::jsonb
                     )
  );

  -- Apply chosen fields (loser → winner). Anything not marked stays as winner's.
  UPDATE tracks SET
    title         = CASE WHEN p_field_choices->>'title'         = 'loser' THEN v_loser.title         ELSE title         END,
    type          = CASE WHEN p_field_choices->>'type'          = 'loser' THEN v_loser.type          ELSE type          END,
    is_single     = CASE WHEN p_field_choices->>'is_single'     = 'loser' THEN v_loser.is_single     ELSE is_single     END,
    release_date  = CASE WHEN p_field_choices->>'release_date'  = 'loser' THEN v_loser.release_date  ELSE release_date  END,
    release_year  = CASE WHEN p_field_choices->>'release_year'  = 'loser' THEN v_loser.release_year  ELSE release_year  END,
    release_month = CASE WHEN p_field_choices->>'release_month' = 'loser' THEN v_loser.release_month ELSE release_month END,
    release_day   = CASE WHEN p_field_choices->>'release_day'   = 'loser' THEN v_loser.release_day   ELSE release_day   END,
    video_url     = CASE WHEN p_field_choices->>'video_url'     = 'loser' THEN v_loser.video_url     ELSE video_url     END,
    spotify_id    = CASE WHEN p_field_choices->>'spotify_id'    = 'loser' THEN v_loser.spotify_id    ELSE spotify_id    END,
    lyrics        = CASE WHEN p_field_choices->>'lyrics'        = 'loser' THEN v_loser.lyrics        ELSE lyrics        END,
    chords        = CASE WHEN p_field_choices->>'chords'        = 'loser' THEN v_loser.chords        ELSE chords        END,
    cover_url     = CASE WHEN p_field_choices->>'cover_url'     = 'loser' THEN v_loser.cover_url     ELSE cover_url     END,
    description   = CASE WHEN p_field_choices->>'description'   = 'loser' THEN v_loser.description   ELSE description   END,
    updated_at    = NOW()
  WHERE id = p_winner_id;

  -- Union album links (winner keeps its existing (album, position); duplicates silently skipped)
  INSERT INTO album_tracks (album_id, track_id, position, is_primary)
  SELECT at.album_id, p_winner_id, at.position, COALESCE(at.is_primary, false)
  FROM album_tracks at
  WHERE at.track_id = p_loser_id
  ON CONFLICT (album_id, track_id) DO NOTHING;

  -- Union featuring artists
  INSERT INTO track_artists (track_id, artist_id, is_primary)
  SELECT p_winner_id, ta.artist_id, COALESCE(ta.is_primary, false)
  FROM track_artists ta
  WHERE ta.track_id = p_loser_id
  ON CONFLICT (track_id, artist_id) DO NOTHING;

  -- Add loser's main artist as featuring on winner, unless it's already the main or featuring
  SELECT EXISTS(SELECT 1 FROM tracks         WHERE id = p_winner_id AND artist_id = v_loser_main)
      OR EXISTS(SELECT 1 FROM track_artists  WHERE track_id = p_winner_id AND artist_id = v_loser_main)
  INTO v_winner_has;
  IF NOT v_winner_has AND v_loser_main IS NOT NULL THEN
    INSERT INTO track_artists (track_id, artist_id, is_primary)
    VALUES (p_winner_id, v_loser_main, false)
    ON CONFLICT (track_id, artist_id) DO NOTHING;
  END IF;

  -- Audit log
  INSERT INTO track_merges (winner_id, loser_id, loser_title, loser_artist_id, merged_by, field_choices, snapshot_json)
  VALUES (p_winner_id, p_loser_id, v_loser.title, v_loser.artist_id, p_merged_by, p_field_choices, v_snapshot);

  -- Hard-delete loser. FK cascades handle remaining link rows;
  -- voting_participants.track_id is SET NULL by its FK (see 20260421_voting_system.sql).
  DELETE FROM tracks WHERE id = p_loser_id;

  RETURN jsonb_build_object(
    'winner_id', p_winner_id,
    'loser_id',  p_loser_id,
    'merged_at', NOW()
  );
END;
$$;

-- ============================================================================
-- revert_track_merge(merge_id) — restore loser row + its links from snapshot.
-- Note: after revert, winner's changed fields stay changed (we don't track
-- pre-merge winner state; that's out of scope). Use with care.
-- ============================================================================
CREATE OR REPLACE FUNCTION revert_track_merge(
  p_merge_id    BIGINT,
  p_reverted_by UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_merge        track_merges%ROWTYPE;
  v_track_json   JSONB;
  v_at_row       JSONB;
  v_ta_row       JSONB;
BEGIN
  SELECT * INTO v_merge FROM track_merges WHERE id = p_merge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'merge % not found', p_merge_id; END IF;
  IF v_merge.reverted_at IS NOT NULL THEN
    RAISE EXCEPTION 'merge % already reverted at %', p_merge_id, v_merge.reverted_at;
  END IF;

  v_track_json := v_merge.snapshot_json->'track';

  -- Recreate the loser track row with its original id.
  -- If the id is already occupied (collision with a newer track), fail — manual intervention needed.
  IF EXISTS(SELECT 1 FROM tracks WHERE id = v_merge.loser_id) THEN
    RAISE EXCEPTION 'cannot revert: id % is already in use', v_merge.loser_id;
  END IF;

  INSERT INTO tracks (
    id, title, slug, artist_id, type, is_single,
    release_date, release_year, release_month, release_day,
    video_url, spotify_id, lyrics, chords, cover_url, description,
    is_new, is_new_date, created_at, updated_at
  ) VALUES (
    (v_track_json->>'id')::int,
    v_track_json->>'title',
    v_track_json->>'slug',
    (v_track_json->>'artist_id')::int,
    v_track_json->>'type',
    COALESCE((v_track_json->>'is_single')::bool, false),
    (v_track_json->>'release_date')::date,
    (v_track_json->>'release_year')::int,
    (v_track_json->>'release_month')::int,
    (v_track_json->>'release_day')::int,
    v_track_json->>'video_url',
    v_track_json->>'spotify_id',
    v_track_json->>'lyrics',
    v_track_json->>'chords',
    v_track_json->>'cover_url',
    v_track_json->>'description',
    COALESCE((v_track_json->>'is_new')::bool, false),
    (v_track_json->>'is_new_date')::date,
    COALESCE((v_track_json->>'created_at')::timestamptz, NOW()),
    NOW()
  );

  -- Restore album_tracks
  FOR v_at_row IN SELECT * FROM jsonb_array_elements(v_merge.snapshot_json->'album_tracks')
  LOOP
    INSERT INTO album_tracks (album_id, track_id, position, is_primary)
    VALUES (
      (v_at_row->>'album_id')::int,
      (v_at_row->>'track_id')::int,
      (v_at_row->>'position')::int,
      COALESCE((v_at_row->>'is_primary')::bool, false)
    )
    ON CONFLICT (album_id, track_id) DO NOTHING;
  END LOOP;

  -- Restore track_artists
  FOR v_ta_row IN SELECT * FROM jsonb_array_elements(v_merge.snapshot_json->'track_artists')
  LOOP
    INSERT INTO track_artists (track_id, artist_id, is_primary)
    VALUES (
      (v_ta_row->>'track_id')::int,
      (v_ta_row->>'artist_id')::int,
      COALESCE((v_ta_row->>'is_primary')::bool, false)
    )
    ON CONFLICT (track_id, artist_id) DO NOTHING;
  END LOOP;

  UPDATE track_merges
     SET reverted_at = NOW(), reverted_by = p_reverted_by
   WHERE id = p_merge_id;

  RETURN jsonb_build_object('merge_id', p_merge_id, 'restored_track_id', v_merge.loser_id);
END;
$$;

-- Expose RPCs to the service role only (default — service role bypasses any GRANT checks).
-- If anon ever needed to call these, REVOKE + GRANT to specific roles here.
REVOKE ALL ON FUNCTION merge_tracks(INTEGER, INTEGER, JSONB, UUID)   FROM PUBLIC;
REVOKE ALL ON FUNCTION revert_track_merge(BIGINT, UUID)              FROM PUBLIC;
