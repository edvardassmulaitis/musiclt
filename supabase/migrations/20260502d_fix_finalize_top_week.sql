-- Fix `finalize_top_week(p_week_id BIGINT)` RPC.
--
-- Problema: admin TOP Sąrašai puslapyje paspaudus "⚡ Finalizuoti dabar"
-- failina su:
--   column "vote_count" of relation "top_entries" does not exist
--
-- Priežastis: Supabase Studio'je sukurta `finalize_top_week` funkcija
-- references'ina `top_entries.vote_count` column'ą, kurio nėra. Tikrasis
-- column'as vadinasi `total_votes` (ką naudoja visa TS koda — žr.
-- `app/api/top/entries/route.ts`, `app/api/top/cron/route.ts`,
-- `app/topas/page.tsx`).
--
-- Funkcija nebuvo commit'inta į repo, todėl perrašom čia "from scratch"
-- pagal cron'o logiką (`app/api/top/cron/route.ts`):
--   1. Suskaičiuoti balsus (`top_votes.vote_type='like'`) per track'ą.
--   2. Surikiuoti entries pagal balsus desc, priskirti naujas pozicijas.
--   3. Atnaujinti prev_position iš PRAEITOS finalizuotos savaitės.
--   4. Pažymėti is_new = (prev_position IS NULL).
--   5. Atnaujinti peak_position (mažiausią poziciją kada nors pasiektą).
--   6. Inkrementuoti weeks_in_top.
--   7. Pažymėti `top_weeks.is_finalized=true, is_active=false, finalized_at=NOW(), total_votes=count`.
--
-- Saugu paleisti kelis kartus — IF NOT FOUND/IS NULL guards'ai apsaugo,
-- tuščia entries lentelė tiesiog nieko neatnaujins (UPDATE 0 rows).

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
  -- 1. Patikrinti savaitę
  SELECT top_type, is_finalized
    INTO v_top_type, v_already
    FROM top_weeks
   WHERE id = p_week_id;

  IF v_top_type IS NULL THEN
    RAISE EXCEPTION 'Week % not found', p_week_id;
  END IF;

  IF v_already THEN
    -- Idempotent: nieko nedarom, jei jau finalizuota
    RETURN;
  END IF;

  -- 2. Atnaujinti pozicijas + total_votes pagal balsus
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
     WHERE top_type   = v_top_type
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

  -- 3. Suskaičiuoti bendrą balsų sumą savaitei
  SELECT COUNT(*)::INT INTO v_total
    FROM top_votes
   WHERE week_id = p_week_id
     AND vote_type = 'like';

  -- 4. Pažymėti savaitę kaip finalizuotą
  UPDATE top_weeks
     SET is_finalized = TRUE,
         is_active    = FALSE,
         finalized_at = NOW(),
         total_votes  = v_total
   WHERE id = p_week_id;
END;
$$;

-- Suteikti vykdymą service_role klientui (admin endpoint'ai naudoja
-- createAdminClient → service_role).
GRANT EXECUTE ON FUNCTION finalize_top_week(BIGINT) TO service_role;
