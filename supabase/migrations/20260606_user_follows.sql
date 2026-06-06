-- 20260606_user_follows.sql
--
-- „Sekti" (follow) sistema profiliams. Substack-stiliaus mobile profilio
-- header'is turi „Sekti" mygtuką. Vienkryptis ryšys follower → following.
--
--   follower_id  — kas seka (profiles.id, signed-in user'is)
--   following_id — kas sekamas (profiles.id, profilio savininkas)
--
-- Negalima sekti savęs (CHECK). UNIQUE(follower_id, following_id) — toggle
-- semantika per DELETE/INSERT. RLS: skaityti gali visi (public counts),
-- rašyti — tik per service role (API per createAdminClient).

create table if not exists public.user_follows (
  id           uuid primary key default gen_random_uuid(),
  follower_id  uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  constraint user_follows_no_self check (follower_id <> following_id),
  constraint user_follows_unique unique (follower_id, following_id)
);

create index if not exists user_follows_following_idx on public.user_follows (following_id);
create index if not exists user_follows_follower_idx  on public.user_follows (follower_id);

alter table public.user_follows enable row level security;

-- Public read (sekėjų skaičiui rodyti); rašymas tik service role per API.
drop policy if exists user_follows_read on public.user_follows;
create policy user_follows_read on public.user_follows
  for select using (true);
