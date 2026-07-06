-- 2026-07-06 — SAUGUMAS: anon/authenticated rolių teisių sutvirtinimas.
--
-- Kontekstas: visi kliento rašymai eina per NextAuth-autentikuotus /api/* route'us
-- (service_role). Viešas anon raktas kliente naudojamas TIK realtime subscribe'ams
-- (chat — užrakinta; notifications — deny-by-default). Todėl anon/authenticated
-- rolėms rašymo teisių apskritai NEREIKIA.
--
-- Auditas rado, kad daug lentelių turėjo `with_check=true` INSERT politikas
-- {public} rolei (pvz. top_votes/top_suggestions — ballot stuffing, boombox_completions
-- — game-score inflation, shoutbox_messages — spam, activity_events, artist_members),
-- ir dalis lentelių buvo skaitomos anon raktu (track_plays — privatumas, ir kt.).
--
-- Sprendimas: atšaukti VISUS rašymus iš anon+authenticated (uždaro visą tampering
-- klasę vienu ėjimu, nes klientas per anon nerašo) + atšaukti SELECT nuo jautrių/
-- vidinių server-only lentelių. Vieši skaitymai (artists/tracks/news/...) nepaliesti.

revoke insert, update, delete on all tables in schema public from anon, authenticated;

revoke select on
  public.track_plays,
  public.music_import_jobs,
  public.music_import_job_items,
  public.music_import_batches,
  public.home_snapshot,
  public.nav_settings,
  public.discovery_parse_log
from anon, authenticated;

-- PASTABA (follow-up, DAR NEPADARYTA — reikia peržiūros):
--  • 61 lentelė turi RLS IŠJUNGTĄ (žr. auditą) — įjungti RLS + dedikuotos politikos,
--    kad būtų DB-lygio gynyba (dabar apsauga = grant'ų atšaukimas + app-lygis).
--  • profiles SELECT/UPDATE politikoje yra `42P17 infinite recursion` bug'as
--    (šiuo metu netyčia BLOKUOJA anon eskalaciją, bet reikia tvarkingos politikos).
--  • ALTER DEFAULT PRIVILEGES — kad naujos lentelės automatiškai negrąžintų anon rašymo.
--  • Peržiūrėti likusius `qual=true` SELECT policy'us jautrioms lentelėms.
