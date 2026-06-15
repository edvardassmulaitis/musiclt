-- 20260615e_music_request_followers.sql
-- Ryšys tarp „trūkstamos muzikos" requesto (music_requests) ir nario, kuris jį
-- užregistravo (pvz. per Last.fm importą, neatpažintos dainos). Kai adminas
-- requestą išsprendžia (sukuria/sieja atlikėją/albumą/dainą), entity automatiškai
-- pridedamas į VISŲ followerių „Mano muziką" — taip narys mato, kad jo importuota
-- muzika galiausiai atsirado profilyje.

create table if not exists public.music_request_followers (
  request_id  uuid not null references public.music_requests(id) on delete cascade,
  user_id     uuid not null,
  created_at  timestamptz not null default now(),
  primary key (request_id, user_id)
);

create index if not exists idx_mrf_user on public.music_request_followers(user_id);
create index if not exists idx_mrf_request on public.music_request_followers(request_id);
