-- 20260605c_muzikos_atradimai_v2.sql
-- Re-architektūra: ATRADIMAS = KOMENTARAS. Vietoj kopijuoto teksto, discoveries
-- jungiasi prie public.comments (legacy migruoti forumo komentarai) — iš ten
-- pilnas body, like_count, autorius, data, atsakymai (parent_id). Embed'as
-- paimamas iš forum_posts.content_html (raw HTML; comments.body Spotify embed'us
-- buvo iškirpęs). Šaltinis: gija 128402 = discussion id 47 (1362 top-level kom.).

drop table if exists public.discovery_pending_artist cascade;
drop table if exists public.discovery_tags cascade;
drop table if exists public.discoveries cascade;

create table public.discoveries (
  id            bigint generated always as identity primary key,
  comment_id    bigint unique references public.comments(id) on delete cascade,
  legacy_msg_id bigint,
  discussion_id bigint,
  thread_id     int,
  author_id     uuid,
  artist_name   text,
  artist_id     bigint references public.artists(id) on delete set null,
  track_name    text,
  track_id      bigint references public.tracks(id) on delete set null,
  album_name    text,
  album_id      bigint references public.albums(id) on delete set null,
  embed_type    text,               -- youtube | spotify_track | spotify_album | spotify_artist | spotify_playlist
  embed_id      text,
  resolve_state text not null default 'pending',  -- pending | resolved | needs_import
  is_lt         boolean not null default false,
  created_at    timestamptz,
  imported_at   timestamptz not null default now()
);
create index discoveries_created_idx on public.discoveries (created_at desc);
create index discoveries_artist_idx  on public.discoveries (artist_id);
create index discoveries_state_idx   on public.discoveries (resolve_state);

create table public.discovery_tags (
  discovery_id bigint references public.discoveries(id) on delete cascade,
  tag          text not null,
  primary key (discovery_id, tag)
);
create index discovery_tags_tag_idx on public.discovery_tags (tag);

create table public.discovery_pending_artist (
  id           bigint generated always as identity primary key,
  raw_name     text,
  spotify_id   text,
  youtube_id   text,
  discovery_id bigint references public.discoveries(id) on delete cascade,
  status       text not null default 'new',
  created_at   timestamptz not null default now()
);

alter table public.discoveries              enable row level security;
alter table public.discovery_tags           enable row level security;
alter table public.discovery_pending_artist enable row level security;
create policy discoveries_public_read    on public.discoveries    for select using (true);
create policy discovery_tags_public_read on public.discovery_tags for select using (true);

-- ── Populiacija: visi top-level komentarai gijoje 47 su embed'u raw HTML'e ──
with raw as (
  select f.legacy_id,
    (regexp_match(f.content_html, 'open\.spotify\.com/embed/(track|album|artist|playlist)/([A-Za-z0-9]+)')) sp,
    (regexp_match(f.content_html, '(?:youtube\.com/embed/|youtu\.be/|youtube\.com/watch\?v=)([A-Za-z0-9_-]{11})')) yt
  from public.forum_posts f
  where f.thread_legacy_id = 128402
    and f.content_html ~* 'youtube|youtu\.be|spotify'
),
emb as (
  select legacy_id,
    case when sp is not null then 'spotify_'||sp[1] when yt is not null then 'youtube' end as etype,
    case when sp is not null then sp[2] when yt is not null then yt[1] end as eid
  from raw
)
insert into public.discoveries
  (comment_id, legacy_msg_id, discussion_id, thread_id, author_id, embed_type, embed_id, created_at)
select c.id, c.legacy_id, c.discussion_id, 128402, c.author_id, e.etype, e.eid, c.created_at
from public.comments c
join emb e on e.legacy_id = c.legacy_id
where c.discussion_id = 47
  and c.parent_id is null
  and c.is_deleted is not true
  and e.etype is not null
on conflict (comment_id) do update set
  embed_type = excluded.embed_type,
  embed_id   = excluded.embed_id,
  created_at = excluded.created_at;
