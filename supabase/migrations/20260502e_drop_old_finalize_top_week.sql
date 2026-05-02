-- Drop'iname seną `finalize_top_week(integer)` funkciją.
--
-- Problema: ankstesnė migracija 20260502d_fix_finalize_top_week.sql sukūrė
-- `finalize_top_week(p_week_id BIGINT)` versiją. Bet Supabase'e jau buvo
-- senesnė `finalize_top_week(p_week_id INTEGER)` versija (su vote_count bug'u).
-- PostgreSQL function overloading: skirtinga signatūra = skirtinga funkcija,
-- todėl `CREATE OR REPLACE FUNCTION ... BIGINT` sukūrė antrą versiją vietoj
-- pakeitimo pirmosios.
--
-- Rezultate `supabase.rpc('finalize_top_week', ...)` failina su:
--   "Could not choose the best candidate function between:
--    public.finalize_top_week(p_week_id => bigint),
--    public.finalize_top_week(p_week_id => integer)"
--
-- Sprendimas: drop'iname senąją INTEGER versiją. Liks tik nauja BIGINT.

DROP FUNCTION IF EXISTS public.finalize_top_week(integer);

-- Sanity check: po šitos migracijos turi likti TIK viena finalize_top_week
-- funkcija (BIGINT signatūra). Galima patikrinti:
--   SELECT proname, pg_get_function_identity_arguments(oid)
--     FROM pg_proc WHERE proname = 'finalize_top_week';
