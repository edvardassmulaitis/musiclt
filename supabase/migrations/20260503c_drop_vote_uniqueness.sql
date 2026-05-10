-- Pašaliname `top_votes` unique constraint'ą, kad būtų galima multi-vote
-- (vienas user'is gali atiduoti iki N balsų vienai dainai).
--
-- Senas constraint: UNIQUE (week_id, user_id, track_id)
-- Tai blokavo kai user'is bandydavo balsuoti antrą kartą už tą pačią dainą.
--
-- Naujas modelis:
--   - Per-song limit (TS pusėje): 10 balsų per dainą (5 anon)
--   - Be savaitinio limito — gali atiduoti po 10 balsų visoms dainoms
--   - Kiekvienas balsavimas = atskira eilutė (audit trail)
--   - finalize_top_week skaičiuoja per COUNT(*)

ALTER TABLE top_votes DROP CONSTRAINT IF EXISTS top_votes_week_id_user_id_track_id_key;

-- Sanity: jei yra panašus pavadinimas, taip pat dropinam (kai kurios versijos
-- generuoja kitokį pavadinimą).
DO $$
DECLARE
  c TEXT;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'top_votes'::regclass
       AND contype = 'u'
       AND conname LIKE '%week_id%user_id%track_id%'
  LOOP
    EXECUTE format('ALTER TABLE top_votes DROP CONSTRAINT IF EXISTS %I', c);
  END LOOP;
END $$;
