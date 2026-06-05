-- 20260605d_missing_reports.sql
-- Narių pranešimai apie trūkstamus atlikėjus/dainas/albumus ("matau, kad kažko nėra").
-- Vienas iš trūkstamų DB įrašų šaltinių (kitas — neišspręsti atradimai). Admin
-- peržiūri /admin/atradimai. Rašymas tik per service role (API).

create table if not exists public.missing_reports (
  id          bigint generated always as identity primary key,
  kind        text not null default 'artist',  -- artist | track | album | kita
  name        text not null,
  artist_hint text,
  note        text,
  source_url  text,
  context     text,                            -- iš kur (pvz. 'muzikos-atradimai')
  reporter_id uuid,
  reporter_ip text,
  status      text not null default 'new',     -- new | handled | rejected
  created_at  timestamptz not null default now()
);
create index if not exists missing_reports_status_idx on public.missing_reports (status, created_at desc);
alter table public.missing_reports enable row level security;
