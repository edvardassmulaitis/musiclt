-- ============================================================
-- 2026-05-19 — merge_tracks RPC patobulinimas
-- ============================================================
-- 2 sisteminiai trūkumai 2026-04-21 originaliame RPC:
--
--   1. Likes/comments NEpersiunčiami iš loser į winner. Loser ištrinamas
--      hard-delete, FK su CASCADE žudo track_drops/track_plays/lyric_comments,
--      o `likes` (polymorphic, be FK) lieka orphaned eilutės. Visi user
--      engagement signal'ai prarasti.
--
--   2. Loser'io main artist'as automatiškai pridedamas kaip featuring
--      winner'iui. Cross-artist merge'uose (pvz. Queen Barcelona → Freddie
--      Mercury Barcelona) tai sukuria klaidingą featuring (FM 1988 solo
--      albume „Barcelona" Queen nedalyvauja, tik Greatest Hits III
--      kontekstinė asociacija). Featuring'ai turi būti adminuojami
--      explicit'iškai per UI, ne kaip merge side-effect.
--
-- Pakeitimai šitoje migracijoje:
--   • Pridėta likes transfer su (entity_type, entity_id, user_username)
--     ON CONFLICT DO NOTHING dedup. Jei tas pats user'is lik'ino abi
--     versijas, paliekamas vienas like winner'iui (loser'is dingsta).
--   • Pridėta comments transfer (UPDATE — nėra UNIQUE constraint).
--   • Pridėta track_lyric_comments transfer (UPDATE).
--   • Pridėta track_drops transfer su dedup'inimu (partial unique
--     indexais ant (track_id, user_id) ir (track_id, session_fp)).
--   • Pridėta track_plays + track_video_views_history transfer (UPDATE).
--   • Pridėta news_tracks + blog_post_tracks + playlist_tracks +
--     daily_song_picks transfer (UPDATE su ON CONFLICT DO NOTHING).
--   • PAŠALINTA „loser_main_artist → winner_featuring" auto-insert logika.
--   • Snapshot išplėstas: likes, comments, track_lyric_comments įtraukti į
--     snapshot_json, kad revert galėtų atstatyti viską.
--
-- Backward compat: signature ta pati, return value ta pati. Senasis
-- merge'as veikė tik su jokio user-engagement-data turinčiais track'ais —
-- tas case'as toliau veiks. Naujas case'as (su likes/comments) tinkamai
-- persiunčia.
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
  v_snapshot := jsonb_build_object(
    'track',         to_jsonb(v_loser),
    'album_tracks',  COALESCE((SELECT jsonb_agg(to_jsonb(at)) FROM album_tracks at WHERE at.track_id = p_loser_id), '[]'::jsonb),
    'track_artists', COALESCE((SELECT jsonb_agg(to_jsonb(ta)) FROM track_artists ta WHERE ta.track_id = p_loser_id), '[]'::jsonb),
    'likes',         COALESCE((SELECT jsonb_agg(to_jsonb(l))  FROM likes l WHERE l.entity_type='track' AND l.entity_id = p_loser_id), '[]'::jsonb),
    'comments',      COALESCE((SELECT jsonb_agg(to_jsonb(c))  FROM comments c WHERE c.track_id = p_loser_id), '[]'::jsonb),
    'lyric_comments',COALESCE((SELECT jsonb_agg(to_jsonb(lc)) FROM track_lyric_comments lc WHERE lc.track_id = p_loser_id), '[]'::jsonb)
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

  -- ──────────────────────────────────────────────────────────────────
  -- album_tracks UNION (winner laiko savo (album, pos); duplikatai skip)
  -- ──────────────────────────────────────────────────────────────────
  INSERT INTO album_tracks (album_id, track_id, position, is_primary)
  SELECT at.album_id, p_winner_id, at.position, COALESCE(at.is_primary, false)
  FROM album_tracks at
  WHERE at.track_id = p_loser_id
  ON CONFLICT (album_id, track_id) DO NOTHING;

  -- ──────────────────────────────────────────────────────────────────
  -- track_artists UNION (winner laiko savo featuring; duplikatai skip)
  -- ──────────────────────────────────────────────────────────────────
  INSERT INTO track_artists (track_id, artist_id, is_primary)
  SELECT p_winner_id, ta.artist_id, COALESCE(ta.is_primary, false)
  FROM track_artists ta
  WHERE ta.track_id = p_loser_id
  ON CONFLICT (track_id, artist_id) DO NOTHING;

  -- ──────────────────────────────────────────────────────────────────
  -- 2026-05-19: REMOVED — loser_main_artist auto-add as featuring.
  -- Featuring artists turi būti adminuojami explicit per UI, ne implicit
  -- per merge. Cross-artist merge atvejais (Queen Barcelona → FM
  -- Barcelona) implicit add'as kuria klaidingą featuring kontekstą.
  -- ──────────────────────────────────────────────────────────────────

  -- ──────────────────────────────────────────────────────────────────
  -- LIKES transfer (polymorphic — entity_type='track')
  -- ──────────────────────────────────────────────────────────────────
  -- Dedup: jei tas pats user_username jau turi like ant winner'io,
  -- skip'inam loser'io like (vienas user = vienas like per entity).
  -- COUNT'inam, kiek persiųsta vs kiek prarasta dėl dedup.
  WITH inserted AS (
    INSERT INTO likes (
      entity_type, entity_id, entity_legacy_id, user_id, user_username,
      user_rank, user_avatar_url, rating, source, anon_id, user_agent, created_at
    )
    SELECT 'track', p_winner_id, l.entity_legacy_id, l.user_id, l.user_username,
           l.user_rank, l.user_avatar_url, l.rating, l.source, l.anon_id, l.user_agent, l.created_at
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

  -- ──────────────────────────────────────────────────────────────────
  -- COMMENTS transfer (track_id column, no unique constraint)
  -- ──────────────────────────────────────────────────────────────────
  UPDATE comments SET track_id = p_winner_id WHERE track_id = p_loser_id;
  GET DIAGNOSTICS v_comments_moved = ROW_COUNT;

  -- ──────────────────────────────────────────────────────────────────
  -- track_lyric_comments transfer
  -- ──────────────────────────────────────────────────────────────────
  -- ATSARGIAI: lyric comments turi selection_start/end į lyrics tekstą.
  -- Jei winner.lyrics ≠ loser.lyrics, offset'ai gali būti netinkami.
  -- Bet pažiūrėjus, geriausia transfer'inti (turim nors textą) nei
  -- prarasti — UI parodys reaction'ą per selected_text fallback.
  UPDATE track_lyric_comments SET track_id = p_winner_id WHERE track_id = p_loser_id;

  -- ──────────────────────────────────────────────────────────────────
  -- track_drops transfer (su partial unique handling)
  -- ──────────────────────────────────────────────────────────────────
  -- UNIQUE: (track_id, user_id) WHERE user_id IS NOT NULL;
  --         (track_id, session_fp) WHERE user_id IS NULL.
  -- Loser'io drops, kurie konflikt'uos su winner'io drops, paliksim
  -- delete'inant. Naudojam DELETE + INSERT pattern'ą.
  INSERT INTO track_drops (track_id, user_id, session_fp, emoji, created_at)
  SELECT p_winner_id, user_id, session_fp, emoji, created_at
  FROM track_drops
  WHERE track_id = p_loser_id
  ON CONFLICT DO NOTHING;  -- both unique indexes accepted

  DELETE FROM track_drops WHERE track_id = p_loser_id;

  -- ──────────────────────────────────────────────────────────────────
  -- track_plays transfer (no unique, just stats — append)
  -- ──────────────────────────────────────────────────────────────────
  UPDATE track_plays SET track_id = p_winner_id WHERE track_id = p_loser_id;

  -- ──────────────────────────────────────────────────────────────────
  -- track_video_views_history (snapshot history, no unique)
  -- ──────────────────────────────────────────────────────────────────
  UPDATE track_video_views_history SET track_id = p_winner_id WHERE track_id = p_loser_id;

  -- ──────────────────────────────────────────────────────────────────
  -- Junction tables: news_tracks, blog_post_tracks, playlist_tracks
  -- (best-effort UPDATE; rare in practice for merged tracks).
  -- Jei UPDATE conflict'uos su UNIQUE — skip per exception handler.
  -- ──────────────────────────────────────────────────────────────────
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

  -- ──────────────────────────────────────────────────────────────────
  -- Audit log
  -- ──────────────────────────────────────────────────────────────────
  INSERT INTO track_merges (winner_id, loser_id, loser_title, loser_artist_id, merged_by, field_choices, snapshot_json)
  VALUES (p_winner_id, p_loser_id, v_loser.title, v_loser.artist_id, p_merged_by, p_field_choices, v_snapshot);

  -- ──────────────────────────────────────────────────────────────────
  -- Hard-delete loser. Likę FK CASCADE'ai išvalys mažas relikvijas
  -- (album_tracks loser eilutes, track_artists loser eilutes ir kt.).
  -- voting_participants.track_id yra SET NULL (per 20260421_voting_system.sql).
  -- ──────────────────────────────────────────────────────────────────
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

-- Permissions nepakeisti — service_role only (originali GRANT iš
-- 20260421_track_merges.sql tebegalioja, nes REPLACE'inam tą pačią funkciją).
REVOKE ALL ON FUNCTION merge_tracks(INTEGER, INTEGER, JSONB, UUID) FROM PUBLIC;

COMMENT ON FUNCTION merge_tracks(INTEGER, INTEGER, JSONB, UUID) IS
  '2026-05-19 v2: persiunčia likes/comments/drops/plays/lyric_comments iš loser į winner. PAŠALINTA loser_main → winner_featuring auto-add (per Edvardo prašymą — featuring tik per explicit UI).';

COMMIT;
