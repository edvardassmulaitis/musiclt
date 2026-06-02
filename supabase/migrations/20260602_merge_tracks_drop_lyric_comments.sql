-- ============================================================
-- 2026-06-02 — merge_tracks RPC: pašalintos track_lyric_comments nuorodos
-- ============================================================
-- 20260528_db_size_cleanup.sql DROP'ino public.track_lyric_comments lentelę
-- (nebenaudojama feature), bet merge_tracks v2 (20260519) vis dar į ją
-- kreipdavosi (snapshot + transfer UPDATE). Todėl bet koks dainų merge
-- nukrisdavo su `relation "track_lyric_comments" does not exist`.
--
-- Šitas REPLACE'as = identiškas 20260519 v2, tik be 2 track_lyric_comments
-- nuorodų (snapshot raktas + UPDATE transfer). Visa kita logika nepakeista.
-- ============================================================

BEGIN;

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
  v_likes_moved   INTEGER := 0;
  v_likes_dropped INTEGER := 0;
  v_comments_moved INTEGER := 0;
BEGIN
  IF p_winner_id IS NULL OR p_loser_id IS NULL THEN
    RAISE EXCEPTION 'winner_id and loser_id are required';
  END IF;
  IF p_winner_id = p_loser_id THEN
    RAISE EXCEPTION 'winner and loser must be different tracks';
  END IF;

  -- Lock both rows
  SELECT * INTO v_winner FROM tracks WHERE id = p_winner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'winner track % not found', p_winner_id; END IF;

  SELECT * INTO v_loser  FROM tracks WHERE id = p_loser_id  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'loser track % not found', p_loser_id; END IF;

  v_loser_main := v_loser.artist_id;

  -- Snapshot loser'io state'ą + visus rel'ed rows kuriuos liesim
  -- 2026-06-02: track_lyric_comments raktas pašalintas (lentelė nebeegzistuoja).
  v_snapshot := jsonb_build_object(
    'track',         to_jsonb(v_loser),
    'album_tracks',  COALESCE((SELECT jsonb_agg(to_jsonb(at)) FROM album_tracks at WHERE at.track_id = p_loser_id), '[]'::jsonb),
    'track_artists', COALESCE((SELECT jsonb_agg(to_jsonb(ta)) FROM track_artists ta WHERE ta.track_id = p_loser_id), '[]'::jsonb),
    'likes',         COALESCE((SELECT jsonb_agg(to_jsonb(l))  FROM likes l WHERE l.entity_type='track' AND l.entity_id = p_loser_id), '[]'::jsonb),
    'comments',      COALESCE((SELECT jsonb_agg(to_jsonb(c))  FROM comments c WHERE c.track_id = p_loser_id), '[]'::jsonb)
  );

  -- Apply chosen field values (loser → winner). Unchosen lieka winner'io.
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

  -- album_tracks UNION (winner laiko savo (album, pos); duplikatai skip)
  INSERT INTO album_tracks (album_id, track_id, position, is_primary)
  SELECT at.album_id, p_winner_id, at.position, COALESCE(at.is_primary, false)
  FROM album_tracks at
  WHERE at.track_id = p_loser_id
  ON CONFLICT (album_id, track_id) DO NOTHING;

  -- track_artists UNION (winner laiko savo featuring; duplikatai skip)
  INSERT INTO track_artists (track_id, artist_id, is_primary)
  SELECT p_winner_id, ta.artist_id, COALESCE(ta.is_primary, false)
  FROM track_artists ta
  WHERE ta.track_id = p_loser_id
  ON CONFLICT (track_id, artist_id) DO NOTHING;

  -- LIKES transfer (polymorphic — entity_type='track'), dedup per user_username.
  -- 2026-06-02: likes lentelė db-size cleanup'e sumažinta — pašalinti stulpeliai
  -- user_rank, user_avatar_url, rating, source, user_agent. INSERT'as naudoja
  -- tik dabar egzistuojančius: entity_legacy_id, user_id, user_username, anon_id,
  -- created_at.
  WITH inserted AS (
    INSERT INTO likes (
      entity_type, entity_id, entity_legacy_id, user_id, user_username, anon_id, created_at
    )
    SELECT 'track', p_winner_id, l.entity_legacy_id, l.user_id, l.user_username, l.anon_id, l.created_at
    FROM likes l
    WHERE l.entity_type = 'track' AND l.entity_id = p_loser_id
    ON CONFLICT (entity_type, entity_id, user_username) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_likes_moved FROM inserted;

  SELECT count(*) INTO v_likes_dropped
  FROM likes WHERE entity_type='track' AND entity_id = p_loser_id;
  v_likes_dropped := v_likes_dropped - v_likes_moved;

  DELETE FROM likes WHERE entity_type='track' AND entity_id = p_loser_id;

  -- COMMENTS transfer (track_id column, no unique constraint)
  UPDATE comments SET track_id = p_winner_id WHERE track_id = p_loser_id;
  GET DIAGNOSTICS v_comments_moved = ROW_COUNT;

  -- 2026-06-02: track_lyric_comments transfer PAŠALINTAS (lentelė DROP'inta
  -- per 20260528_db_size_cleanup.sql).

  -- track_drops transfer (su partial unique handling)
  INSERT INTO track_drops (track_id, user_id, session_fp, emoji, created_at)
  SELECT p_winner_id, user_id, session_fp, emoji, created_at
  FROM track_drops
  WHERE track_id = p_loser_id
  ON CONFLICT DO NOTHING;

  DELETE FROM track_drops WHERE track_id = p_loser_id;

  -- track_plays transfer (no unique, just stats — append)
  UPDATE track_plays SET track_id = p_winner_id WHERE track_id = p_loser_id;

  -- track_video_views_history (snapshot history, no unique)
  UPDATE track_video_views_history SET track_id = p_winner_id WHERE track_id = p_loser_id;

  -- Junction tables: news_tracks, blog_post_tracks, playlist_tracks, daily_song_picks
  BEGIN
    UPDATE news_tracks SET track_id = p_winner_id WHERE track_id = p_loser_id;
  EXCEPTION WHEN unique_violation THEN
    DELETE FROM news_tracks WHERE track_id = p_loser_id;
  END;

  BEGIN
    UPDATE blog_post_tracks SET track_id = p_winner_id WHERE track_id = p_loser_id;
  EXCEPTION WHEN unique_violation THEN
    DELETE FROM blog_post_tracks WHERE track_id = p_loser_id;
  END;

  BEGIN
    UPDATE playlist_tracks SET track_id = p_winner_id WHERE track_id = p_loser_id;
  EXCEPTION WHEN unique_violation THEN
    DELETE FROM playlist_tracks WHERE track_id = p_loser_id;
  END;

  BEGIN
    UPDATE daily_song_picks SET track_id = p_winner_id WHERE track_id = p_loser_id;
  EXCEPTION WHEN unique_violation THEN
    DELETE FROM daily_song_picks WHERE track_id = p_loser_id;
  END;

  -- Audit log
  INSERT INTO track_merges (winner_id, loser_id, loser_title, loser_artist_id, merged_by, field_choices, snapshot_json)
  VALUES (p_winner_id, p_loser_id, v_loser.title, v_loser.artist_id, p_merged_by, p_field_choices, v_snapshot);

  -- Hard-delete loser. Likę FK CASCADE'ai išvalys mažas relikvijas.
  DELETE FROM tracks WHERE id = p_loser_id;

  RETURN jsonb_build_object(
    'winner_id',         p_winner_id,
    'loser_id',          p_loser_id,
    'likes_moved',       v_likes_moved,
    'likes_dropped_dup', v_likes_dropped,
    'comments_moved',    v_comments_moved
  );
END;
$$;

REVOKE ALL ON FUNCTION merge_tracks(INTEGER, INTEGER, JSONB, UUID) FROM PUBLIC;

COMMENT ON FUNCTION merge_tracks(INTEGER, INTEGER, JSONB, UUID) IS
  '2026-06-02 v3: kaip v2, bet be track_lyric_comments nuorodų (lentelė DROP''inta per db-size cleanup).';

COMMIT;
