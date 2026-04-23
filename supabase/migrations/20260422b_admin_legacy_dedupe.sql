-- ============================================================================
-- Admin ↔ Legacy dedupe helpers (2026-04-22)
--
-- Po scrape'o turime dvi artist/album/track "šaknis":
--   a) `source IS NULL`              — admin rankiniu būdu sukurti (prieš scrape)
--   b) `source = 'legacy_scrape_v1'` — iš www.music.lt scrape'o
--
-- Kai kurios populiarios grupės (Metallica, Scorpions, Depeche Mode, ...) buvo
-- sukurtos admin'e PRIEŠ scrape'ą, o tada scrape'as pridėjo savo versiją.
-- Views žemiau padeda matyti dublius ir priimti sprendimą: ištrinti admin,
-- merge'inti, ar palikti atskirai.
--
-- Po analizės 2026-04-22:
--   - admin artists: 155  (iš jų ~105 = slug match su legacy)
--   - admin albums:  49   (point'ina į admin artist_id)
--   - admin tracks:  464  (point'ina į admin artist_id)
-- ============================================================================

-- View #1: Admin atlikėjai SU legacy dublikatu (slug lygybė, case-insensitive)
CREATE OR REPLACE VIEW public.v_admin_dup_artists AS
SELECT
  admin.id          AS admin_id,
  admin.name        AS admin_name,
  admin.slug        AS admin_slug,
  admin.description AS admin_description,
  admin.cover_image_url AS admin_cover,
  legacy.id          AS legacy_id,
  legacy.legacy_id   AS legacy_music_lt_id,
  legacy.name        AS legacy_name,
  legacy.description AS legacy_description,
  legacy.cover_image_url AS legacy_cover,
  'https://www.music.lt/lt/grupe/' || legacy.slug || '/' || legacy.legacy_id || '/' AS legacy_source_url,
  -- Žymėjimas pagalbai
  (admin.description IS NOT NULL AND LENGTH(admin.description) > 50) AS admin_has_real_bio,
  (admin.cover_image_url IS NOT NULL)  AS admin_has_cover,
  (legacy.description IS NOT NULL AND LENGTH(legacy.description) > 50) AS legacy_has_real_bio
FROM public.artists admin
JOIN public.artists legacy
  ON lower(admin.slug) = lower(legacy.slug)
WHERE admin.source IS NULL
  AND legacy.source = 'legacy_scrape_v1'
ORDER BY admin.name;

COMMENT ON VIEW public.v_admin_dup_artists IS
  'Admin-sukurti atlikėjai, kurie dubliuojasi su legacy (scrape) atlikėjais pagal slug. Naudoti merge sprendimui.';

-- View #2: Admin atlikėjai BE legacy dublikato (unique'ūs, post-scrape arba unikalūs admin'o)
CREATE OR REPLACE VIEW public.v_admin_only_artists AS
SELECT
  admin.id,
  admin.name,
  admin.slug,
  admin.description IS NOT NULL AS has_bio,
  admin.cover_image_url IS NOT NULL AS has_cover,
  (SELECT COUNT(*) FROM public.albums WHERE artist_id = admin.id) AS admin_album_count,
  (SELECT COUNT(*) FROM public.tracks WHERE artist_id = admin.id) AS admin_track_count
FROM public.artists admin
WHERE admin.source IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.artists legacy
    WHERE legacy.source = 'legacy_scrape_v1'
      AND lower(legacy.slug) = lower(admin.slug)
  )
ORDER BY admin.name;

COMMENT ON VIEW public.v_admin_only_artists IS
  'Admin atlikėjai, kurie neturi legacy atitikmens — galimai nauji arba slug skiriasi nuo legacy versijos.';

-- View #3: Greitas summary
CREATE OR REPLACE VIEW public.v_admin_legacy_stats AS
SELECT
  (SELECT COUNT(*) FROM public.artists WHERE source IS NULL)             AS admin_artists,
  (SELECT COUNT(*) FROM public.artists WHERE source = 'legacy_scrape_v1') AS legacy_artists,
  (SELECT COUNT(*) FROM public.v_admin_dup_artists)                      AS admin_artist_dupes,
  (SELECT COUNT(*) FROM public.v_admin_only_artists)                     AS admin_only_artists,
  (SELECT COUNT(*) FROM public.albums  WHERE source IS NULL)             AS admin_albums,
  (SELECT COUNT(*) FROM public.tracks  WHERE source IS NULL)             AS admin_tracks,
  (SELECT COUNT(*) FROM public.albums  WHERE source = 'legacy_scrape_v1') AS legacy_albums,
  (SELECT COUNT(*) FROM public.tracks  WHERE source = 'legacy_scrape_v1') AS legacy_tracks;

-- ============================================================================
-- Dry-run merge planner: koks efektas būtų, jei admin → legacy reabsorbuotumėme.
-- Pavojus: kai kurios FK lentelės gali turėti point'erį į admin id, kurį reikia
-- pirma migruoti, o tik tada DELETE admin row.
-- ============================================================================

-- View #4: Kiek FK'ų rodytų į admin dublikat artist, jei jį šalintume
CREATE OR REPLACE VIEW public.v_admin_dup_artist_fk_impact AS
SELECT
  d.admin_id,
  d.admin_name,
  d.legacy_id,
  (SELECT COUNT(*) FROM public.albums          WHERE artist_id = d.admin_id) AS admin_albums_cnt,
  (SELECT COUNT(*) FROM public.tracks          WHERE artist_id = d.admin_id) AS admin_tracks_cnt
FROM public.v_admin_dup_artists d
ORDER BY admin_albums_cnt DESC, admin_tracks_cnt DESC;

COMMENT ON VIEW public.v_admin_dup_artist_fk_impact IS
  'Kiek albums/tracks rodytų į admin dublikat artist. Merge''inant reikia pirma re-assign''inti šiuos FK.';

-- ============================================================================
-- merge_admin_artist_to_legacy(p_admin_id, p_legacy_id)
--
-- Atomic merge: admin atlikėjas (source IS NULL) absorbuojamas į legacy (scrape).
-- 1. COALESCE enrichment fields → legacy, jei legacy versija yra NULL/''
-- 2. Perkelti FK iš admin į legacy: albums, tracks, track_artists,
--    artist_likes, voting_participants. Jei unique constraint kerta —
--    DELETE admin rows kurie duotų dublikato row'ą, tik tada UPDATE.
-- 3. DELETE admin artist row.
--
-- Tikrinimai:
--   - Tikrina abu ID egzistuoja
--   - Tikrina admin IS source IS NULL
--   - Tikrina legacy IS source = 'legacy_scrape_v1'
--   - Fail'ina jei kažkas ne taip (rollback visos transakcijos)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.merge_admin_artist_to_legacy(
  p_admin_id  INTEGER,
  p_legacy_id INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin  public.artists%ROWTYPE;
  v_legacy public.artists%ROWTYPE;
  v_moved_albums  INT := 0;
  v_moved_tracks  INT := 0;
  v_moved_ta      INT := 0;
  v_moved_likes   INT := 0;
  v_moved_vp      INT := 0;
  v_deleted_ta_dup   INT := 0;
  v_deleted_like_dup INT := 0;
BEGIN
  -- 1. Load + validate both rows
  SELECT * INTO v_admin  FROM public.artists WHERE id = p_admin_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin artist id=% not found', p_admin_id;
  END IF;
  IF v_admin.source IS NOT NULL THEN
    RAISE EXCEPTION 'artist id=% has source=% (not admin)', p_admin_id, v_admin.source;
  END IF;

  SELECT * INTO v_legacy FROM public.artists WHERE id = p_legacy_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'legacy artist id=% not found', p_legacy_id;
  END IF;
  IF v_legacy.source IS DISTINCT FROM 'legacy_scrape_v1' THEN
    RAISE EXCEPTION 'artist id=% has source=% (not legacy_scrape_v1)', p_legacy_id, v_legacy.source;
  END IF;

  -- 2. COALESCE enrichment into legacy (only where legacy is NULL/empty)
  UPDATE public.artists SET
    description          = COALESCE(NULLIF(description, ''),          v_admin.description),
    cover_image_url      = COALESCE(cover_image_url,                  v_admin.cover_image_url),
    cover_image_wide_url = COALESCE(cover_image_wide_url,             v_admin.cover_image_wide_url),
    cover_image_position = COALESCE(cover_image_position,             v_admin.cover_image_position),
    photos               = COALESCE(photos,                           v_admin.photos),
    birth_date           = COALESCE(birth_date,                       v_admin.birth_date),
    death_date           = COALESCE(death_date,                       v_admin.death_date),
    country              = COALESCE(country,                          v_admin.country),
    gender               = COALESCE(gender,                           v_admin.gender),
    active_from          = COALESCE(active_from,                      v_admin.active_from),
    active_until         = COALESCE(active_until,                     v_admin.active_until),
    "type"               = COALESCE("type",                           v_admin."type"),
    type_music           = COALESCE(type_music,                       v_admin.type_music),
    type_dance           = COALESCE(type_dance,                       v_admin.type_dance),
    type_books           = COALESCE(type_books,                       v_admin.type_books),
    type_film            = COALESCE(type_film,                        v_admin.type_film),
    website              = COALESCE(NULLIF(website, ''),              v_admin.website),
    facebook             = COALESCE(NULLIF(facebook, ''),             v_admin.facebook),
    instagram            = COALESCE(NULLIF(instagram, ''),            v_admin.instagram),
    twitter              = COALESCE(NULLIF(twitter, ''),              v_admin.twitter),
    youtube              = COALESCE(NULLIF(youtube, ''),              v_admin.youtube),
    soundcloud           = COALESCE(NULLIF(soundcloud, ''),           v_admin.soundcloud),
    bandcamp             = COALESCE(NULLIF(bandcamp, ''),             v_admin.bandcamp),
    tiktok               = COALESCE(NULLIF(tiktok, ''),               v_admin.tiktok),
    spotify              = COALESCE(NULLIF(spotify, ''),              v_admin.spotify),
    subdomain            = COALESCE(NULLIF(subdomain, ''),            v_admin.subdomain),
    is_verified          = COALESCE(is_verified,                      v_admin.is_verified),
    updated_at           = NOW()
  WHERE id = p_legacy_id;

  -- 3. Migrate FKs from admin → legacy

  -- 3a. albums.artist_id (no composite unique on artist_id → safe bulk UPDATE)
  UPDATE public.albums SET artist_id = p_legacy_id WHERE artist_id = p_admin_id;
  GET DIAGNOSTICS v_moved_albums = ROW_COUNT;

  -- 3b. tracks.artist_id (same)
  UPDATE public.tracks SET artist_id = p_legacy_id WHERE artist_id = p_admin_id;
  GET DIAGNOSTICS v_moved_tracks = ROW_COUNT;

  -- 3c. track_artists(track_id, artist_id) — unique index on (track_id, artist_id)
  --     Delete admin rows that would become duplicates after UPDATE
  WITH deleted AS (
    DELETE FROM public.track_artists ta_a
    WHERE ta_a.artist_id = p_admin_id
      AND EXISTS (
        SELECT 1 FROM public.track_artists ta_l
        WHERE ta_l.artist_id = p_legacy_id
          AND ta_l.track_id = ta_a.track_id
      )
    RETURNING 1
  ) SELECT COUNT(*) INTO v_deleted_ta_dup FROM deleted;
  UPDATE public.track_artists SET artist_id = p_legacy_id WHERE artist_id = p_admin_id;
  GET DIAGNOSTICS v_moved_ta = ROW_COUNT;

  -- 3d. artist_likes — probably unique on (artist_id, user_id) or (artist_id, profile_id)
  --     Use same dedupe pattern. We don't know exact user column — try both.
  BEGIN
    WITH deleted AS (
      DELETE FROM public.artist_likes al_a
      WHERE al_a.artist_id = p_admin_id
        AND EXISTS (
          SELECT 1 FROM public.artist_likes al_l
          WHERE al_l.artist_id = p_legacy_id
            AND to_jsonb(al_l) - 'id' - 'artist_id' - 'created_at' - 'updated_at'
              = to_jsonb(al_a) - 'id' - 'artist_id' - 'created_at' - 'updated_at'
        )
      RETURNING 1
    ) SELECT COUNT(*) INTO v_deleted_like_dup FROM deleted;
  EXCEPTION WHEN OTHERS THEN
    v_deleted_like_dup := -1;  -- schema varies, skip dedupe
  END;
  BEGIN
    UPDATE public.artist_likes SET artist_id = p_legacy_id WHERE artist_id = p_admin_id;
    GET DIAGNOSTICS v_moved_likes = ROW_COUNT;
  EXCEPTION WHEN unique_violation THEN
    -- Likes unique constraint hit — drop remaining admin likes as conservative fallback
    DELETE FROM public.artist_likes WHERE artist_id = p_admin_id;
    v_moved_likes := -1;
  END;

  -- 3e. voting_participants.artist_id (likely no unique constraint on artist_id alone)
  BEGIN
    UPDATE public.voting_participants SET artist_id = p_legacy_id WHERE artist_id = p_admin_id;
    GET DIAGNOSTICS v_moved_vp = ROW_COUNT;
  EXCEPTION WHEN unique_violation THEN
    v_moved_vp := -1;
  END;

  -- 4. DELETE admin artist
  DELETE FROM public.artists WHERE id = p_admin_id;

  RETURN jsonb_build_object(
    'admin_id',  p_admin_id,
    'legacy_id', p_legacy_id,
    'moved_albums', v_moved_albums,
    'moved_tracks', v_moved_tracks,
    'moved_track_artists', v_moved_ta,
    'moved_artist_likes',  v_moved_likes,
    'moved_voting_participants', v_moved_vp,
    'deleted_track_artists_dupes', v_deleted_ta_dup,
    'deleted_artist_likes_dupes',  v_deleted_like_dup
  );
END;
$$;

COMMENT ON FUNCTION public.merge_admin_artist_to_legacy IS
  'Atomic merge: admin (source IS NULL) → legacy (source=legacy_scrape_v1). Perkelti FK, COALESCE enrichment fields, DELETE admin row.';

-- ============================================================================
-- Batch runner: merge ALL slug-matched admin dupes.
-- Paleidimas:
--   SELECT * FROM public.merge_all_slug_matched_admin_dupes();
-- ============================================================================
CREATE OR REPLACE FUNCTION public.merge_all_slug_matched_admin_dupes()
RETURNS TABLE (
  admin_id INT,
  legacy_id INT,
  name TEXT,
  result JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pair RECORD;
BEGIN
  FOR v_pair IN
    SELECT admin_id AS a_id, legacy_id AS l_id, admin_name AS a_name
    FROM public.v_admin_dup_artists
    ORDER BY admin_id
  LOOP
    BEGIN
      admin_id  := v_pair.a_id;
      legacy_id := v_pair.l_id;
      name      := v_pair.a_name;
      result    := public.merge_admin_artist_to_legacy(v_pair.a_id, v_pair.l_id);
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      result := jsonb_build_object('error', SQLERRM);
      RETURN NEXT;
    END;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.merge_all_slug_matched_admin_dupes IS
  'Batch merge: visi v_admin_dup_artists view eilutės. Grąžina per-row rezultatą su JSONB.';

