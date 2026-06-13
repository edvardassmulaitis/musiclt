-- 20260614_collection_tracks.sql
--
-- KURUOTŲ teminių dainų kolekcijų saugykla (/dainos/meiles-dainos ir t.t.).
-- Adminas rankiniu būdu priskiria dainas kolekcijai (collection_slug iš
-- lib/collections.ts SONG_COLLECTIONS). Puslapis indeksuojamas tik kai
-- kolekcijoje >= SONG_COLLECTION_MIN_INDEX dainų — kad neturėtume plono
-- auto-generated turinio (SEO sprendimas: kuruota > title ILIKE match).

create table if not exists public.collection_tracks (
  id            bigserial primary key,
  collection_slug text   not null,
  track_id      bigint   not null references public.tracks(id) on delete cascade,
  position      int      not null default 0,
  created_at    timestamptz not null default now(),
  unique (collection_slug, track_id)
);

create index if not exists idx_collection_tracks_slug
  on public.collection_tracks (collection_slug, position);

-- RLS: skaitymas viešas (puslapiai vis tiek naudoja service-role klientą, bet
-- įjungiam RLS + select policy saugumui, jei kada naudotų anon klientą).
alter table public.collection_tracks enable row level security;

drop policy if exists collection_tracks_public_read on public.collection_tracks;
create policy collection_tracks_public_read
  on public.collection_tracks for select
  using (true);

-- Rašymas — tik service role (bypass RLS). Jokios anon insert/update policy.
