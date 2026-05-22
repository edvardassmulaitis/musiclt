-- ============================================================
-- 2026-05-21c — resolve_pending_likes RPC
-- ============================================================
-- Iškviečiama po atlikėjo/albumo/track'o importavimo: paskaito likes
-- lentelę pagal (entity_type, entity_legacy_id) ir set'ina entity_id
-- naujam modern ID.
--
-- Edge case'as: jei tas pats user'is jau turi LIKE'ą tam modern entity'iui
-- (pvz. likeino šitą atlikėją kitokiu būdu — modern auth, ar per kitą
-- legacy_id), turim duplicate (entity_type, entity_id, user_username).
-- Sprendžiam: DELETE pending eilutę (priority — modern data), arba MERGE
-- per ON CONFLICT (čia naudojam DELETE-then-UPDATE pattern'ą su FOR UPDATE
-- lock'u).
--
-- Naudojimas:
--   SELECT resolve_pending_likes('artist', 12345, 678);
--   SELECT resolve_pending_likes('track',  601192, 99001);
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.resolve_pending_likes(
  p_entity_type       TEXT,
  p_entity_legacy_id  BIGINT,
  p_modern_id         BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated   INT := 0;
  v_dropped   INT := 0;
BEGIN
  IF p_entity_type NOT IN ('artist','album','track','event','thread','post') THEN
    RAISE EXCEPTION 'invalid entity_type %', p_entity_type;
  END IF;
  IF p_entity_legacy_id IS NULL OR p_modern_id IS NULL THEN
    RAISE EXCEPTION 'entity_legacy_id and modern_id are required';
  END IF;

  -- 1. DELETE pending'us, jei user'is jau turi resolved LIKE'ą šitam
  --    modern entity'iui (priority — modern row'a, drop'iname placeholder'į).
  --    Tai apsaugo nuo `likes_unique_username` violation per žemiau esantį UPDATE.
  WITH dropped AS (
    DELETE FROM public.likes l
    WHERE l.entity_type = p_entity_type
      AND l.entity_legacy_id = p_entity_legacy_id
      AND l.entity_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.likes l2
        WHERE l2.entity_type = p_entity_type
          AND l2.entity_id = p_modern_id
          AND l2.user_username = l.user_username
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_dropped FROM dropped;

  -- 2. UPDATE'inam likusius pending → set entity_id
  WITH updated AS (
    UPDATE public.likes
       SET entity_id = p_modern_id
     WHERE entity_type = p_entity_type
       AND entity_legacy_id = p_entity_legacy_id
       AND entity_id IS NULL
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_updated FROM updated;

  RETURN jsonb_build_object(
    'entity_type',       p_entity_type,
    'entity_legacy_id',  p_entity_legacy_id,
    'modern_id',         p_modern_id,
    'resolved',          v_updated,
    'dropped_duplicate', v_dropped
  );
END $$;

COMMENT ON FUNCTION public.resolve_pending_likes IS
  'Po entity importavimo: set''ina likes.entity_id placeholder''iams (kur '
  'entity_legacy_id match''ina). Sprendžia dublikatus prieš UPDATE.';

-- ============================================================
-- Batch variant: per atlikėjo import'ą perduodame visus naujai sukurtus
-- (legacy_id, modern_id) pair'us vienu call'u (efektyviau).
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_pending_likes_batch(
  p_entity_type  TEXT,
  p_pairs        JSONB  -- [{"legacy_id": 12345, "modern_id": 678}, ...]
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pair       JSONB;
  v_resolved   INT := 0;
  v_dropped    INT := 0;
  v_one_result JSONB;
BEGIN
  IF jsonb_typeof(p_pairs) <> 'array' THEN
    RAISE EXCEPTION 'p_pairs must be a JSONB array';
  END IF;

  FOR v_pair IN SELECT * FROM jsonb_array_elements(p_pairs)
  LOOP
    v_one_result := public.resolve_pending_likes(
      p_entity_type,
      (v_pair->>'legacy_id')::BIGINT,
      (v_pair->>'modern_id')::BIGINT
    );
    v_resolved := v_resolved + COALESCE((v_one_result->>'resolved')::INT, 0);
    v_dropped  := v_dropped  + COALESCE((v_one_result->>'dropped_duplicate')::INT, 0);
  END LOOP;

  RETURN jsonb_build_object(
    'entity_type',       p_entity_type,
    'pair_count',        jsonb_array_length(p_pairs),
    'resolved',          v_resolved,
    'dropped_duplicate', v_dropped
  );
END $$;

COMMIT;
