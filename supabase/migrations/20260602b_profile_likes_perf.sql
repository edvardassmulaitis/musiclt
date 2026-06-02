-- 20260602b_profile_likes_perf.sql
--
-- PROFILE PERFORMANCE (2026-06-02)
-- Profilio puslapis (/@<username>, anksčiau /vartotojas/[username]) darė
-- case-insensitive ILIKE užklausas ant 735k-row / 221MB `likes` lentelės:
--   • getProfileLikesCounts — 6 atskiri COUNT(*) seq-scan'ai (~366ms kiekvienas)
--   • getProfileFavorite{Albums,Tracks} — ILIKE + ORDER BY id DESC
-- ILIKE nenaudoja plain btree indekso → seq scan per ~460k eilučių.
--
-- Sprendimas: funkcinis indeksas ant lower(user_username) + grupuoti RPC'ai,
-- kurie case-insensitivity tvarko per lower() (legacy CamelCase „Einaras13"
-- vs lowercase profile.username).
-- Po pakeitimo: counts ~366ms×6 → ~15ms (1 query); favorites ~41ms → <1ms.
-- JAU PRITAIKYTA prod DB per Management API 2026-06-02; failas — istorijai.

CREATE INDEX IF NOT EXISTS idx_likes_uname_lower
  ON public.likes (lower(user_username), entity_type, id DESC);

-- Visi like'ų skaičiai (resolved/pending) per entity_type vienu grupuotu query.
CREATE OR REPLACE FUNCTION public.profile_likes_counts(p_username text)
RETURNS TABLE(entity_type text, resolved bigint, pending bigint)
LANGUAGE sql STABLE AS $$
  SELECT entity_type,
    count(*) FILTER (WHERE entity_id IS NOT NULL) AS resolved,
    count(*) FILTER (WHERE entity_id IS NULL)     AS pending
  FROM public.likes
  WHERE lower(user_username) = lower(p_username)
    AND entity_type IN ('artist','album','track')
  GROUP BY entity_type;
$$;

-- Naujausių pamėgtų entity (album/track) ID'ai — index-ordered, robust ir
-- retiems / seniems user'iams (nebepriklauso nuo pkey backward scan'o).
CREATE OR REPLACE FUNCTION public.profile_favorite_like_ids(p_username text, p_type text, p_limit int)
RETURNS TABLE(entity_id bigint, created_at timestamptz)
LANGUAGE sql STABLE AS $$
  SELECT entity_id, created_at
  FROM public.likes
  WHERE lower(user_username) = lower(p_username)
    AND entity_type = p_type
    AND entity_id IS NOT NULL
  ORDER BY id DESC
  LIMIT p_limit;
$$;
