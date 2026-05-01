-- ═══════════════════════════════════════════════════════════════════
--  Like counts RPC — pagreitina artist/album/track page'us
-- ═══════════════════════════════════════════════════════════════════
--
-- Anksčiau:
--   getTracks pagal artist_id paimdavo dainas, paskui chunked likes
--   queries (CHUNK=40, paginated po 1000) su 5-10 round-trip'ais
--   Mikutavičiui (3000+ likes / 70 tracks). Tas pats getAlbums,
--   getLegacyCommunity. Total ~2-4s.
--
-- Dabar:
--   Vienos RPC funkcijos: like_counts_by_entity ir artist_community_likes.
--   1 round-trip'as Postgres'ui, agregacija atliekama DB pusėje su GROUP BY.
--   Mikutavičiaus page total: ~3.5s → <1s tikimasi.
--
-- Idempotentiška: CREATE OR REPLACE funkcijoms; perrun'ti saugu.
--
-- ─── Per-entity like count aggregation ───────────────────────────────
-- Naudojama getTracks ir getAlbums, kad per vieną round-trip'ą gautume
-- like_count visiems track_id arba album_id sąrašui.
-- Sample call (JS):
--   sb.rpc('like_counts_by_entity', {
--     p_entity_type: 'track', p_entity_ids: [101, 102, ...]
--   })
-- → grąžina [{ entity_id: 101, like_count: 23 }, ...]

CREATE OR REPLACE FUNCTION public.like_counts_by_entity(
  p_entity_type text,
  p_entity_ids bigint[]
)
RETURNS TABLE(entity_id bigint, like_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT entity_id, count(*)::bigint AS like_count
  FROM public.likes
  WHERE entity_type = p_entity_type
    AND entity_id = ANY(p_entity_ids)
  GROUP BY entity_id;
$$;

GRANT EXECUTE ON FUNCTION public.like_counts_by_entity(text, bigint[])
  TO anon, authenticated, service_role;

-- ─── Artist community likes aggregation ──────────────────────────────
-- Naudojama getLegacyCommunity. Per vieną kvietimą grąžina:
--   • artist'o tiesioginiai fans'ai (su rank info, neaggreguota)
--   • aggregated user counts per visus artist + albums + tracks likes
--     (top fans + distinct users count)
--
-- Returns single row, su 4 arrays/scalars JSON formatu — kad būtų
-- patogu PostgREST grąžinti vienu fetch'u.

CREATE OR REPLACE FUNCTION public.artist_community_likes(
  p_artist_id bigint,
  p_album_ids bigint[],
  p_track_ids bigint[]
)
RETURNS TABLE(
  artist_fans jsonb,           -- [{user_username, user_rank, user_avatar_url}, ...] sorted by rank
  top_fans jsonb,              -- [{user_username, user_rank, user_avatar_url, like_count}, ...] top 30
  distinct_users bigint,       -- # unique users across artist+albums+tracks
  total_events bigint          -- total like rows
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH all_likes AS (
    SELECT user_username, user_rank, user_avatar_url
    FROM public.likes
    WHERE entity_type = 'artist' AND entity_id = p_artist_id
    UNION ALL
    SELECT user_username, user_rank, user_avatar_url
    FROM public.likes
    WHERE entity_type = 'album' AND entity_id = ANY(p_album_ids)
    UNION ALL
    SELECT user_username, user_rank, user_avatar_url
    FROM public.likes
    WHERE entity_type = 'track' AND entity_id = ANY(p_track_ids)
  ),
  artist_fans_cte AS (
    -- Distinct fans tik artist lygmens, su rank info — naudojama "Kam patinka"
    -- modal'e ir count'ui ant heart-button.
    SELECT DISTINCT ON (user_username)
      user_username, user_rank, user_avatar_url
    FROM public.likes
    WHERE entity_type = 'artist' AND entity_id = p_artist_id
  ),
  user_aggregate AS (
    -- Per-user count'ai aggregated per visus artist+album+track likes.
    SELECT
      user_username,
      max(user_rank) AS user_rank,
      max(user_avatar_url) AS user_avatar_url,
      count(*)::bigint AS like_count
    FROM all_likes
    GROUP BY user_username
  )
  SELECT
    -- artist_fans — sorted by rank priority (manual mapping pagal Lt rangus)
    -- Priority: VIP=100, Super=90, Ultra=80, Aktyvus narys=70, Narys=60,
    --   Įsibėgėjantis=50, Aktyvus naujokas=40, Naujokas=30, default=10.
    (SELECT coalesce(jsonb_agg(t ORDER BY priority DESC, user_username), '[]'::jsonb)
     FROM (
       SELECT
         user_username, user_rank, user_avatar_url,
         CASE
           WHEN lower(user_rank) LIKE '%vip%' THEN 100
           WHEN lower(user_rank) LIKE '%super%' THEN 90
           WHEN lower(user_rank) LIKE '%ultra%' THEN 80
           WHEN lower(user_rank) LIKE '%aktyvus narys%' THEN 70
           WHEN lower(user_rank) LIKE '%įsibėgėjantis%'
                OR lower(user_rank) LIKE '%isibegejantis%' THEN 50
           WHEN lower(user_rank) LIKE '%narys%' THEN 60
           WHEN lower(user_rank) LIKE '%aktyvus naujokas%' THEN 40
           WHEN lower(user_rank) LIKE '%naujokas%' THEN 30
           ELSE 10
         END AS priority
       FROM artist_fans_cte
     ) t
    ) AS artist_fans,
    -- top_fans — top 30 by aggregated like_count (DESC), tiebreak alphabetical
    (SELECT coalesce(jsonb_agg(t ORDER BY like_count DESC, user_username), '[]'::jsonb)
     FROM (
       SELECT user_username, user_rank, user_avatar_url, like_count
       FROM user_aggregate
       ORDER BY like_count DESC, user_username
       LIMIT 30
     ) t
    ) AS top_fans,
    (SELECT count(*) FROM user_aggregate) AS distinct_users,
    (SELECT count(*) FROM all_likes) AS total_events;
$$;

GRANT EXECUTE ON FUNCTION public.artist_community_likes(bigint, bigint[], bigint[])
  TO anon, authenticated, service_role;

-- ─── Indexes (jei dar nėra) ──────────────────────────────────────────
-- Šios funkcijos remiasi (entity_type, entity_id) indeksu, kuris turėtų jau
-- egzistuoti iš ankstesnių migracijų. Pridedam IF NOT EXISTS apsaugai.

CREATE INDEX IF NOT EXISTS likes_entity_lookup_idx
  ON public.likes (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS likes_entity_user_idx
  ON public.likes (entity_type, entity_id, user_username);
