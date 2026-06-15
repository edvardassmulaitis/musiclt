-- 20260615f_music_import_jobs.sql
-- Fone vykdomas „power user" muzikos importas. Naudotojas patvirtina pilną
-- importą, o cron worker'is (api/cron/import-jobs) batch'ais paima visą Last.fm
-- biblioteką, atpažintus iškart deda į „Mano muziką", neatpažintus registruoja į
-- music_requests (su followerių ryšiu). Baigus — system pranešimas naudotojui.

create table if not exists public.music_import_jobs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  source        text not null default 'lastfm',     -- lastfm|spotify|youtube
  params        jsonb not null default '{}'::jsonb,  -- { username, mode }
  status        text not null default 'queued',      -- queued|running|done|error
  phase         text not null default 'fetch',       -- fetch|match|done
  fetch_cursor  jsonb not null default '{}'::jsonb,  -- { si, page, got }
  total         int not null default 0,
  processed     int not null default 0,
  matched       int not null default 0,
  reported      int not null default 0,
  error         text,
  locked_at     timestamptz,
  notified      boolean not null default false,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz
);
create index if not exists idx_mij_status on public.music_import_jobs(status, created_at);
create index if not exists idx_mij_user on public.music_import_jobs(user_id, created_at desc);

-- Staging: žali importo įrašai, kuriuos worker'is apdoroja batch'ais.
create table if not exists public.music_import_job_items (
  id          bigserial primary key,
  job_id      uuid not null references public.music_import_jobs(id) on delete cascade,
  kind        text not null,                         -- artist|album|track
  raw_artist  text,
  raw_title   text,
  norm        text not null,
  status      text not null default 'pending',       -- pending|done
  created_at  timestamptz not null default now()
);
create unique index if not exists uq_mji_job_norm on public.music_import_job_items(job_id, norm);
create index if not exists idx_mji_pending on public.music_import_job_items(job_id, status);
