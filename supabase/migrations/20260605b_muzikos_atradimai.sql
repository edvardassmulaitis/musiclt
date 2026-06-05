-- 20260605b_muzikos_atradimai.sql
-- „Muzikos atradimai" — forumo gija „Šviežiausi jūsų muzikiniai atradimai"
-- (tema 128402) paversta struktūrizuotu, filtruojamu feed'u.
--
-- Kiekvienas tinkamas komentaras → discoveries eilutė su atlikėju, daina/albumu,
-- stiliaus tagais, embed'u (YouTube/Spotify) ir resolve būsena. Neegzistuojantys
-- DB atlikėjai → discovery_pending_artist eilė (admin importui; Spotify ID jau yra).
--
-- Skaitymas: server-side per createAdminClient (service role) → RLS reads atviri.

create table if not exists public.discoveries (
  id              bigint generated always as identity primary key,
  legacy_msg_id   bigint unique,                 -- favorite_a(53, X) dedup raktas
  thread_id       int,                           -- iš kur (128402)
  author_username text,
  author_id       uuid,                          -- profiles.id jei rastas
  artist_name     text,                          -- raw, kaip narys parašė
  artist_id       bigint references public.artists(id) on delete set null,
  track_name      text,
  album_name      text,
  narrative       text,
  embed_type      text,                          -- youtube|spotify_track|spotify_album|spotify_artist
  embed_id        text,
  spotify_id      text,
  resolve_state   text not null default 'pending', -- resolved|needs_import|unresolved|lt
  is_lt           boolean not null default false,
  created_at      timestamptz,                   -- ORIGINALI posto data
  imported_at     timestamptz not null default now()
);
create index if not exists discoveries_created_idx on public.discoveries (created_at desc);
create index if not exists discoveries_artist_idx  on public.discoveries (artist_id);
create index if not exists discoveries_state_idx   on public.discoveries (resolve_state);

create table if not exists public.discovery_tags (
  discovery_id bigint references public.discoveries(id) on delete cascade,
  tag          text not null,
  primary key (discovery_id, tag)
);
create index if not exists discovery_tags_tag_idx on public.discovery_tags (tag);

create table if not exists public.discovery_pending_artist (
  id           bigint generated always as identity primary key,
  raw_name     text,
  spotify_id   text,
  youtube_id   text,
  discovery_id bigint references public.discoveries(id) on delete cascade,
  status       text not null default 'new',      -- new|importing|done|skip
  created_at   timestamptz not null default now()
);

-- ── RLS: vieši reads, rašymas tik service role ──
alter table public.discoveries              enable row level security;
alter table public.discovery_tags           enable row level security;
alter table public.discovery_pending_artist enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='discoveries' and policyname='discoveries_public_read') then
    create policy discoveries_public_read on public.discoveries for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='discovery_tags' and policyname='discovery_tags_public_read') then
    create policy discovery_tags_public_read on public.discovery_tags for select using (true);
  end if;
end $$;
