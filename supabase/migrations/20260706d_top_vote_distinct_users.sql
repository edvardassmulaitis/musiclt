-- 2026-07-06 — ANTI-CHEAT: top40/top30 finalizacija reitinguoja pagal UNIKALIUS
-- prisijungusius balsuotojus (COUNT DISTINCT user_id), NE eilučių skaičių.
--
-- Buvo: `COUNT(*)` per visus top_votes (įskaitant anon + 10 paspaudimų/user +
-- race-condition eilutes) → vienas user'is / botas galėjo išpūsti reitingą.
-- Dabar: vienas prisijungęs vartotojas = 1 balsas dainai; anon balsai pozicijų
-- neįtakoja (kaip ir dokumentuota). Suderinta su TS (finalizeWeekTS) ir LIVE
-- (app/api/top/entries) skaičiavimu.

CREATE OR REPLACE FUNCTION public.finalize_top_week(p_week_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- ANTI-CHEAT: unikalūs prisijungę balsuotojai per dainą (ne eilutės, ne anon).
  WITH vote_counts AS (
    SELECT track_id, COUNT(DISTINCT user_id)::INT AS votes
      FROM top_votes
     WHERE week_id = p_week_id
       AND vote_type = 'like'
       AND user_id IS NOT NULL
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
      pp.position                                                         AS prev_week_position,
      e.peak_position
      FROM top_entries e
      LEFT JOIN vote_counts vc ON vc.track_id = e.track_id
      LEFT JOIN prev_pos    pp ON pp.track_id = e.track_id
     WHERE e.week_id = p_week_id
  )
  UPDATE top_entries te
     SET position      = r.new_position,
         prev_position = COALESCE(te.prev_position, r.prev_week_position),
         total_votes   = r.votes,
         peak_position = LEAST(COALESCE(r.peak_position, r.new_position), r.new_position)
    FROM ranked r
   WHERE te.id = r.id;

  -- Bendra registruotų balsuotojų suma savaitei (unikalūs).
  SELECT COUNT(DISTINCT user_id)::INT INTO v_total
    FROM top_votes
   WHERE week_id = p_week_id
     AND vote_type = 'like'
     AND user_id IS NOT NULL;

  UPDATE top_weeks
     SET is_finalized = TRUE,
         finalized_at = NOW(),
         total_votes  = v_total
   WHERE id = p_week_id;
END;
$function$;
