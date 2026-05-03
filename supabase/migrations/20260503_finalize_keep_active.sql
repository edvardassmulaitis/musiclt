-- Atnaujiname `finalize_top_week(BIGINT)` RPC: po finalizavimo paliekame
-- `is_active=true`, kad savaitė liktų matoma kaip einamoji (ne pakeičiame
-- į ateities savaitę).
--
-- Tvirta taisyklė: aktyvi topas savaitė = einamoji kalendorinė savaitė
-- (week_start = einamosios savaitės pirmadienis). Manual finalizavimas tik
-- pažymi `is_finalized=true` (užrakina balsavimą), bet NEŠLINKA savaitės.
--
-- Naują savaitę kuria tik:
--   1. /api/top/cron route'as pirmadienį/sekmadienį (calendar rotation)
--   2. /api/top/weeks GET self-heal (kai admin/lankytojas atidaro topą
--      pirmadienį, o kron'as kažkodėl nesukūrė)
--
-- Ne keičiame logikos, tik VIENOS eilutės skirtumas — `is_active=FALSE`
-- pašalintas iš UPDATE.

CREATE OR REPLACE FUNCTION finalize_top_week(p_week_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_top_type   TEXT;
  v_total      INT;
  v_already    BOOLEAN;
BEGIN
  SELECT top_type, is_finalized
    INTO v_top_type, v_already
    FROM top_weeks
   WHERE id = p_week_id;

  IF v_top_type IS NULL THEN
    RAISE EXCEPTION 'Week % not found', p_week_id;
  END IF;

  IF v_already THEN
    RETURN;
  END IF;

  -- Atnaujiname pozicijas + total_votes pagal balsus
  WITH vote_counts AS (
    SELECT track_id, COUNT(*)::INT AS votes
      FROM top_votes
     WHERE week_id = p_week_id
       AND vote_type = 'like'
     GROUP BY track_id
  ),
  prev_week AS (
    SELECT id
      FROM top_weeks
     WHERE top_type     = v_top_type
       AND is_finalized = TRUE
       AND id != p_week_id
     ORDER BY week_start DESC
     LIMIT 1
  ),
  prev_pos AS (
    SELECT track_id, position
      FROM top_entries
     WHERE week_id = (SELECT id FROM prev_week)
  ),
  ranked AS (
    SELECT
      e.id,
      e.track_id,
      COALESCE(vc.votes, 0)                                              AS votes,
      ROW_NUMBER() OVER (
        ORDER BY COALESCE(vc.votes, 0) DESC,
                 e.position ASC NULLS LAST,
                 e.id ASC
      )::INT                                                              AS new_position,
      pp.position                                                         AS prev_position,
      e.peak_position,
      e.weeks_in_top
      FROM top_entries e
      LEFT JOIN vote_counts vc ON vc.track_id = e.track_id
      LEFT JOIN prev_pos    pp ON pp.track_id = e.track_id
     WHERE e.week_id = p_week_id
  )
  UPDATE top_entries te
     SET position      = r.new_position,
         prev_position = r.prev_position,
         total_votes   = r.votes,
         peak_position = LEAST(COALESCE(r.peak_position, r.new_position), r.new_position),
         weeks_in_top  = COALESCE(r.weeks_in_top, 0) + 1,
         is_new        = (r.prev_position IS NULL)
    FROM ranked r
   WHERE te.id = r.id;

  -- Suskaičiuoti bendrą balsų sumą savaitei
  SELECT COUNT(*)::INT INTO v_total
    FROM top_votes
   WHERE week_id = p_week_id
     AND vote_type = 'like';

  -- Pažymėti savaitę kaip finalizuotą — BET PALIEKAME is_active=true.
  -- is_active flag'as belieka informacinis (calendar rotation valdoma kron'o
  -- + /weeks GET self-heal'o, bet NE finalize'o).
  UPDATE top_weeks
     SET is_finalized = TRUE,
         finalized_at = NOW(),
         total_votes  = v_total
   WHERE id = p_week_id;
END;
$$;

GRANT EXECUTE ON FUNCTION finalize_top_week(BIGINT) TO service_role;
