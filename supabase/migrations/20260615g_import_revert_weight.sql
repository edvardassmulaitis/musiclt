-- 20260615g_import_revert_weight.sql
-- (1) Importo atšaukimas: registruojam, ką kiekvienas importas ĮDĖJO (tik
--     naujus įrašus), kad būtų galima vienu mygtuku atšaukti.
-- (2) Populiarumo eiliškumas: likes.weight = nario Last.fm playcount, pagal kurį
--     „Mano muzikos" biblioteka rikiuojama (kad nereikėtų rankiniu stumdyti).

alter table public.likes add column if not exists weight int;

create table if not exists public.music_import_batches (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  source      text not null default 'lastfm',
  job_id      uuid,
  added       int not null default 0,
  status      text not null default 'active',   -- active|reverted
  created_at  timestamptz not null default now(),
  reverted_at timestamptz
);
create index if not exists idx_mib_user on public.music_import_batches(user_id, created_at desc);
create index if not exists idx_mib_job on public.music_import_batches(job_id);

create table if not exists public.music_import_added (
  batch_id   uuid not null references public.music_import_batches(id) on delete cascade,
  kind       text not null,          -- artist|album|track
  entity_id  bigint not null,
  primary key (batch_id, kind, entity_id)
);
