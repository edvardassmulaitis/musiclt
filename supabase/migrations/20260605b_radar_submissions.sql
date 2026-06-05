-- 20260605b_radar_submissions.sql
-- „Naujos muzikos radaro" pateikimo forma (/nauji-atlikejai/pateikti).
-- Anonimiškai teikiama → moderacijos eilė (status='pending'); NIEKAS nerodoma
-- viešai. Admin tvirtina/atmeta per /admin/radaras. Apsaugos nuo spamo:
-- honeypot + time-trap + IP/email rate-limit (API lygyje, žr. /api/radar/submit).
-- Idempotentiška.

create table if not exists radar_submissions (
  id                bigint generated always as identity primary key,
  artist_name       text not null,
  contact_email     text not null,
  links             text,          -- URL'ai (spotify/youtube/instagram…), po vieną eilutėje
  genre             text,
  city              text,
  bio               text,
  message           text,
  submitter_user_id text,          -- jei pateikė prisijungęs (nullable)
  ip                text,
  user_agent        text,
  status            text not null default 'pending',  -- pending | approved | rejected
  admin_note        text,
  artist_id         bigint,        -- jei admin susiejo su DB atlikėju
  reviewed_at       timestamptz,
  reviewed_by       text,
  created_at        timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'radar_submissions_status_chk') then
    alter table radar_submissions add constraint radar_submissions_status_chk
      check (status in ('pending','approved','rejected'));
  end if;
end $$;

create index if not exists idx_radar_submissions_status on radar_submissions (status, created_at desc);
create index if not exists idx_radar_submissions_ip     on radar_submissions (ip, created_at desc);
create index if not exists idx_radar_submissions_email  on radar_submissions (contact_email, created_at desc);

comment on table radar_submissions is 'Radaro atlikėjų pateikimai (moderacijos eilė). Žr. /api/radar/submit + /admin/radaras';
