-- Atnaujinam `finalize_top_week(BIGINT)` RPC: išskaidome lifecycle
-- atsakomybes — finalize tampa "compute positions only" operacija.
--
-- Senas finalize daro:
--   - Updates positions
--   - Increments weeks_in_top (PROBLEMA — turėtų daryti Reset/cron)
--   - Sets is_new = (pp.position IS NULL) (PROBLEMA — Reset jau setina is_new=false,
--     bet finalize override'ina į true, nes prev_week querio pp.position null jei
--     prev finalizuotos savaitės nėra; testavimo cikluose tai nuolatos null)
--   - Sets prev_position = pp.position iš prev_week (PROBLEMA — Reset jau setina
--     prev_position iš dabartinės pozicijos, bet finalize override'ina į null)
--
-- Naujas finalize daro tik:
--   - Updates positions pagal balsus
--   - prev_position COALESCE: išlaiko Reset'o nustatytą reikšmę, jei yra
--   - peak_position pagal naują poziciją
--   - total_votes
--   - NEBESETINA weeks_in_top (Reset += 1, Insert = 1)
--   - NEBESETINA is_new (Insert = true, Reset = false)
--   - NEBESETINA finalized_at, total_votes savaitėje (anksčiau buvo)
--
-- Dabar lifecycle:
--   - Insert (populate / /weeks self-heal / cron / Reset's new approved):
--       weeks_in_top=1, is_new=true, prev_position=NULL
--   - Finalize: positions update, prev_position COALESCE
--   - Reset (start of next cycle): weeks_in_top += 1, is_new=false,
--       prev_position = current position (trend); GRADUATE if weeks_in_top >= 12
--
-- Taip suteikiama teisinga semantika: 1/12 pirmą savaitę, 2/12 antrą, ..., 12/12
-- paskutinę savaitę (voting allowed), tada Reset'as pašalina dainą.

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
      pp.position                                                         AS prev_week_position,
      e.peak_position
      FROM top_entries e
      LEFT JOIN vote_counts vc ON vc.track_id = e.track_id
      LEFT JOIN prev_pos    pp ON pp.track_id = e.track_id
     WHERE e.week_id = p_week_id
  )
  UPDATE top_entries te
     SET position      = r.new_position,
         -- COALESCE: jei Reset'as nustatė prev_position, IŠLAIKOM. Kitaip
         -- imam iš ankstesnės savaitės (real cron rotation atveju).
         prev_position = COALESCE(te.prev_position, r.prev_week_position),
         total_votes   = r.votes,
         peak_position = LEAST(COALESCE(r.peak_position, r.new_position), r.new_position)
         -- weeks_in_top: NEBESETINA. Lifecycle valdo Insert (=1) ir Reset (+= 1).
         -- is_new: NEBESETINA. Lifecycle valdo Insert (=true) ir Reset (=false).
    FROM ranked r
   WHERE te.id = r.id;

  -- Suskaičiuoti bendrą balsų sumą savaitei
  SELECT COUNT(*)::INT INTO v_total
    FROM top_votes
   WHERE week_id = p_week_id
     AND vote_type = 'like';

  -- Pažymėti savaitę kaip finalizuotą — paliekame is_active=true.
  UPDATE top_weeks
     SET is_finalized = TRUE,
         finalized_at = NOW(),
         total_votes  = v_total
   WHERE id = p_week_id;
END;
$$;

GRANT EXECUTE ON FUNCTION finalize_top_week(BIGINT) TO service_role;
