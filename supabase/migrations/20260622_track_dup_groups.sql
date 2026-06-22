create or replace function dup_norm(t text) returns text
language sql stable as $$
  select trim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(unaccent(coalesce(t,''))),
          '\([^)]*\)|\[[^\]]*\]', ' ', 'g'      -- strip (..) and [..]
        ),
        '[^a-z0-9& ]+', ' ', 'g'                 -- keep letters, digits, &, space
      ),
      '\s+', ' ', 'g'
    )
  )
$$;
create table if not exists track_dup_groups (
  id                  bigserial primary key,
  group_key           text unique not null,        -- stable identity across rescans
  signal              text not null,               -- spotify | youtube | same_artist | cross_artist
  confidence          text not null,               -- high | medium | low
  track_ids           int[] not null,
  member_count        int  not null,
  suggested_keeper_id int,
  sample_title        text,
  sample_artist       text,
  status              text not null default 'pending', -- pending | merged | dismissed
  resolved_at         timestamptz,
  resolved_by         uuid,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);
create index if not exists idx_tdg_status_conf on track_dup_groups (status, confidence);
create index if not exists idx_tdg_signal on track_dup_groups (signal);
-- fast per-track like counts
create index if not exists idx_likes_track_entity on likes (entity_id) where entity_type = 'track';

-- safe single-track delete: clears the 6 NO-ACTION FK references + polymorphic
-- likes, then deletes the track (CASCADE / SET NULL FKs handle the rest).
create or replace function delete_track(p_id int)
returns void
language plpgsql
security definer
as $$
begin
  delete from top_entries        where track_id = p_id;
  delete from top_votes          where track_id = p_id;
  delete from manual_top_entries where track_id = p_id;
  delete from top_suggestions    where track_id = p_id;
  delete from daily_song_votes   where track_id = p_id;
  delete from daily_song_winners where track_id = p_id;
  delete from likes where entity_type = 'track' and entity_id = p_id;
  delete from tracks where id = p_id;
end $$;

-- popularity for ordering dup groups (max youtube views among members)
alter table track_dup_groups add column if not exists popularity bigint not null default 0;
create index if not exists idx_tdg_popularity on track_dup_groups (status, popularity desc);
-- Per-signal scan functions. Each raises its own statement_timeout and stays
-- well under the API gateway limit, so they can be called one at a time from
-- the admin UI (service-role RPC) to repeat the duplicate scan.

create or replace function dup_scan_reset() returns int
language plpgsql security definer as $$
declare n int;
begin
  delete from track_dup_groups where status = 'pending';
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function dup_scan_spotify() returns int
language plpgsql security definer as $$
declare n int;
begin
  set local statement_timeout = '110s';
  insert into track_dup_groups
    (group_key, signal, confidence, track_ids, member_count, popularity, suggested_keeper_id, sample_title, sample_artist, status)
  select 'sp:'||g.spotify_id||':'||g.nt, 'spotify', 'high', g.ids, array_length(g.ids,1),
    ( select coalesce(max(coalesce(t2.video_views,0)),0) from tracks t2 where t2.id = any(g.ids) ),
    ( select k.id from tracks k where k.id = any(g.ids)
      order by (k.video_url is not null and k.video_url<>'') desc, coalesce(k.video_views,0) desc,
               (k.lyrics is not null and k.lyrics<>'') desc, (k.cover_url is not null and k.cover_url<>'') desc,
               coalesce(k.score,0) desc, coalesce(k.page_view_count,0) desc, k.created_at asc nulls last, k.id asc limit 1 ),
    ( select title from tracks where id = g.ids[1] ),
    ( select a.name from tracks t left join artists a on a.id=t.artist_id where t.id = g.ids[1] ),
    'pending'
  from ( select spotify_id, dup_norm(title) nt, array_agg(id order by id) ids
         from tracks where spotify_id is not null and spotify_id <> '' and dup_norm(title) <> '' and dup_norm(title) not in ('music lt','system error')
         group by spotify_id, dup_norm(title) having count(*) > 1 ) g
  on conflict (group_key) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function dup_scan_youtube() returns int
language plpgsql security definer as $$
declare n int;
begin
  set local statement_timeout = '110s';
  insert into track_dup_groups
    (group_key, signal, confidence, track_ids, member_count, popularity, suggested_keeper_id, sample_title, sample_artist, status)
  select 'yt:'||g.video_url||':'||g.nt, 'youtube', 'high', g.ids, array_length(g.ids,1),
    ( select coalesce(max(coalesce(t2.video_views,0)),0) from tracks t2 where t2.id = any(g.ids) ),
    ( select k.id from tracks k where k.id = any(g.ids)
      order by (k.spotify_id is not null and k.spotify_id<>'') desc, coalesce(k.video_views,0) desc,
               (k.lyrics is not null and k.lyrics<>'') desc, (k.cover_url is not null and k.cover_url<>'') desc,
               coalesce(k.score,0) desc, coalesce(k.page_view_count,0) desc, k.created_at asc nulls last, k.id asc limit 1 ),
    ( select title from tracks where id = g.ids[1] ),
    ( select a.name from tracks t left join artists a on a.id=t.artist_id where t.id = g.ids[1] ),
    'pending'
  from ( select video_url, dup_norm(title) nt, array_agg(id order by id) ids
         from tracks where video_url is not null and video_url <> '' and dup_norm(title) <> '' and dup_norm(title) not in ('music lt','system error')
         group by video_url, dup_norm(title) having count(*) > 1 ) g
  on conflict (group_key) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function dup_scan_same_artist() returns int
language plpgsql security definer as $$
declare n int;
begin
  set local statement_timeout = '170s';
  insert into track_dup_groups
    (group_key, signal, confidence, track_ids, member_count, popularity, suggested_keeper_id, sample_title, sample_artist, status)
  select 'sa:'||g.artist_id||':'||g.nt, 'same_artist', 'medium', g.ids, array_length(g.ids,1),
    ( select coalesce(max(coalesce(t2.video_views,0)),0) from tracks t2 where t2.id = any(g.ids) ),
    ( select k.id from tracks k where k.id = any(g.ids)
      order by (k.spotify_id is not null and k.spotify_id<>'') desc, (k.video_url is not null and k.video_url<>'') desc,
               coalesce(k.video_views,0) desc, (k.lyrics is not null and k.lyrics<>'') desc,
               (k.cover_url is not null and k.cover_url<>'') desc, coalesce(k.score,0) desc,
               coalesce(k.page_view_count,0) desc, k.created_at asc nulls last, k.id asc limit 1 ),
    ( select title from tracks where id = g.ids[1] ),
    ( select a.name from tracks t left join artists a on a.id=t.artist_id where t.id = g.ids[1] ),
    'pending'
  from ( select artist_id, dup_norm(title) nt, array_agg(id order by id) ids
         from tracks where dup_norm(title) <> '' and dup_norm(title) not in ('music lt','system error') and artist_id is not null
         group by artist_id, dup_norm(title) having count(*) > 1 ) g
  on conflict (group_key) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function dup_scan_cross() returns int
language plpgsql security definer as $$
declare n int;
begin
  set local statement_timeout = '110s';
  insert into track_dup_groups
    (group_key, signal, confidence, track_ids, member_count, popularity, suggested_keeper_id, sample_title, sample_artist, status)
  with base as (
    select t.id, t.artist_id, dup_norm(t.title) nt, lower(unaccent(t.title)) rt,
           lower(unaccent(coalesce(a.name,''))) an
    from tracks t left join artists a on a.id = t.artist_id
  ),
  nt_sized as (
    select nt from base where nt <> '' and nt not in ('music lt','system error') and length(nt) >= 4
    group by nt having count(*) between 2 and 30 and count(distinct artist_id) > 1
  ),
  ca_pairs as (
    select a.id ida, b.id idb, a.nt
    from base a join base b on a.nt = b.nt and a.id < b.id and a.artist_id <> b.artist_id
    where a.nt in (select nt from nt_sized)
      and a.an <> '' and b.an <> '' and length(a.an) >= 3 and length(b.an) >= 3
      and a.an <> a.nt and b.an <> b.nt
      and ( (position(a.an in b.rt) > 0 and position(a.an in b.nt) = 0)
         or (position(b.an in a.rt) > 0 and position(b.an in a.nt) = 0) )
  ),
  ca_members as ( select nt, ida uid from ca_pairs union select nt, idb from ca_pairs ),
  grp as ( select nt, array_agg(distinct uid) ids from ca_members group by nt )
  select 'ca:'||g.nt, 'cross_artist', 'low',
    (select array_agg(x order by x) from unnest(g.ids) x), array_length(g.ids,1),
    ( select coalesce(max(coalesce(t2.video_views,0)),0) from tracks t2 where t2.id = any(g.ids) ),
    ( select k.id from tracks k where k.id = any(g.ids)
      order by (k.spotify_id is not null and k.spotify_id<>'') desc, (k.video_url is not null and k.video_url<>'') desc,
               coalesce(k.video_views,0) desc, (k.lyrics is not null and k.lyrics<>'') desc,
               (k.cover_url is not null and k.cover_url<>'') desc, coalesce(k.score,0) desc,
               k.created_at asc nulls last, k.id asc limit 1 ),
    ( select title from tracks where id = g.ids[1] ),
    ( select a.name from tracks t left join artists a on a.id=t.artist_id where t.id = g.ids[1] ),
    'pending'
  from grp g where coalesce(array_length(g.ids,1),0) > 1
  on conflict (group_key) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
