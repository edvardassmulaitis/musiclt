-- 20260605f_discovery_parse_log.sql
-- Žurnalas, kurie embed-less komentarai jau peržiūrėti Haiku klasifikatoriaus
-- (kad nepersikartotų). is_discovery=true → buvo sukurtas discoveries įrašas.

create table if not exists public.discovery_parse_log (
  comment_id   bigint primary key,
  is_discovery boolean not null,
  created_at   timestamptz not null default now()
);
