-- ────────────────────────────────────────────────────────────────────────────
-- „Matyti gyvai" — nariai susideda atlikėjus, kuriuos matė koncertuose,
-- nebūtinai susiejant su konkrečiu renginiu. Jei atlikėjo ar renginio dar nėra
-- DB — įrašas tampa DRAFT (status='pending'), kurį adminai patvirtina/koreguoja.
--
-- Modeliuota pagal event_candidates (draft → promote) konvenciją.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.profile_seen_live (
  id                bigint generated always as identity primary key,
  user_id           uuid    not null references public.profiles(id) on delete cascade,

  -- Susieta esybė (užpildoma kai atlikėjas/renginys jau egzistuoja arba po approve)
  artist_id         integer references public.artists(id) on delete set null,
  event_id          uuid    references public.events(id)  on delete set null,

  -- DRAFT laukai — ką narys pasiūlė, kai esybės dar nėra DB
  raw_artist_name   text,
  raw_event_title   text,
  raw_event_country text,
  raw_event_city    text,
  raw_event_venue   text,

  -- Kada matė (nebūtina; jei renginys nesusietas)
  seen_date         date,
  seen_year         integer,

  note              text,

  -- Būsena: approved (matosi profilyje) | pending (laukia admino) | rejected
  status            text    not null default 'approved'
                            check (status in ('approved','pending','rejected')),
  reviewed_by       uuid,
  reviewed_at       timestamptz,
  reject_reason     text,

  created_at        timestamptz not null default now(),

  -- Turi būti arba esamas atlikėjas, arba pasiūlytas naujo pavadinimas
  constraint seen_live_artist_present
    check (artist_id is not null or (raw_artist_name is not null and length(btrim(raw_artist_name)) > 0))
);

create index if not exists idx_seen_live_user    on public.profile_seen_live(user_id);
create index if not exists idx_seen_live_pending on public.profile_seen_live(status) where status = 'pending';
create index if not exists idx_seen_live_artist  on public.profile_seen_live(artist_id);

-- Dedupe: tas pats narys negali du kartus pridėti to paties atlikėjo prie to
-- paties renginio (kai abu susieti).
create unique index if not exists uq_seen_live_user_artist_event
  on public.profile_seen_live(user_id, artist_id, event_id)
  where artist_id is not null and event_id is not null;

-- RLS: viešai skaitomi tik approved įrašai (anon key). Visi rašymai ir pending
-- skaitymas — tik per service-role (server API routes).
alter table public.profile_seen_live enable row level security;

drop policy if exists seen_live_public_read_approved on public.profile_seen_live;
create policy seen_live_public_read_approved
  on public.profile_seen_live for select
  using (status = 'approved');
