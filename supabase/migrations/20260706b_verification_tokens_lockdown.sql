-- 2026-07-06 — SAUGUMAS (CRITICAL): verification_tokens buvo pasiekiami anon raktu.
--
-- Problema: `service_role_all` politika buvo roles={public}, qual=true, with_check=true
-- → bet kas viešu anon raktu galėjo (a) NUSKAITYTI magic-link login token'us
-- (identifier=email + token + expires) ir prisijungti kaip bet kuris vartotojas,
-- IR (b) ĮTERPTI suklastotą token'ą bet kokiam el. paštui → tiesioginis account
-- takeover. Patvirtinta gyvai (nuskaitytas realus token'as).
--
-- Sprendimas: neutralizuoti public politiką + atšaukti anon/authenticated grant'us.
-- Lieka „Service role only" politika; serveris (service_role) apeina RLS.

alter policy "service_role_all" on public.verification_tokens using (false) with check (false);
revoke all on public.verification_tokens from anon, authenticated;
