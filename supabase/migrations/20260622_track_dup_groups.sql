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
create or replace function top_liked_low_views(
  p_max_views bigint default 1000,
  p_min_likes int default 5,
  p_limit int default 50,
  p_offset int default 0
) returns table(track_id bigint, likes bigint)
language plpgsql volatile as $$
begin
  set local statement_timeout = '60s';
  return query
    select l.entity_id, count(*)::bigint
    from likes l
    join tracks t on t.id = l.entity_id
    where l.entity_type = 'track' and coalesce(t.video_views,0) <= p_max_views
    group by l.entity_id
    having count(*) >= p_min_likes
    order by count(*) desc, l.entity_id
    limit p_limit offset p_offset;
end $$;
-- Release-year mismatches: track's release_year is newer than the earliest
-- album it appears on (usually a YouTube upload year wrongly overwriting the
-- real release). The earliest album year is the reliable original-release year.

create or replace function release_year_mismatches(
  p_min_diff int default 2,
  p_limit int default 50,
  p_offset int default 0
) returns table(
  track_id bigint, title text, artist_name text, artist_slug text,
  release_year int, album_year int, album_title text, diff int
)
language plpgsql volatile as $$
begin
  set local statement_timeout = '60s';
  return query
  with ta as (
    select at.track_id, min(al.year) y
    from album_tracks at
    join albums al on al.id = at.album_id
    where al.year between 1900 and 2100
    group by at.track_id
  )
  select t.id::bigint, t.title, a.name, a.slug,
         t.release_year::int, ta.y::int,
         (select al2.title from album_tracks at2 join albums al2 on al2.id = at2.album_id
          where at2.track_id = t.id and al2.year = ta.y order by al2.id limit 1),
         (t.release_year - ta.y)::int
  from tracks t
  join ta on ta.track_id = t.id
  left join artists a on a.id = t.artist_id
  where t.release_year is not null and t.release_year > ta.y + p_min_diff
  order by (t.release_year - ta.y) desc, t.id
  limit p_limit offset p_offset;
end $$;

-- Fix one track: snap release_year to earliest album year, drop the (wrong)
-- precise date, clear the "new" flags.
create or replace function fix_track_release_year(p_id int)
returns int
language plpgsql security definer as $$
declare v_year int;
begin
  select min(al.year) into v_year
  from album_tracks at join albums al on al.id = at.album_id
  where at.track_id = p_id and al.year between 1900 and 2100;
  if v_year is null then return null; end if;
  update tracks set
    release_year = v_year,
    release_date = null, release_month = null, release_day = null,
    is_new = false, is_new_date = null
  where id = p_id;
  return v_year;
end $$;

-- Bulk auto-fix all tracks whose release_year exceeds the earliest album year
-- by more than p_min_diff.
create or replace function fix_all_release_years(p_min_diff int default 2)
returns int
language plpgsql security definer as $$
declare n int;
begin
  set local statement_timeout = '170s';
  with ta as (
    select at.track_id, min(al.year) y
    from album_tracks at join albums al on al.id = at.album_id
    where al.year between 1900 and 2100
    group by at.track_id
  )
  update tracks t set
    release_year = ta.y,
    release_date = null, release_month = null, release_day = null,
    is_new = false, is_new_date = null
  from ta
  where t.id = ta.track_id
    and t.release_year is not null
    and t.release_year > ta.y + p_min_diff;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function release_year_mismatch_count(p_min_diff int default 2)
returns bigint
language plpgsql volatile as $$
declare n bigint;
begin
  set local statement_timeout = '60s';
  with ta as (
    select at.track_id, min(al.year) y
    from album_tracks at join albums al on al.id = at.album_id
    where al.year between 1900 and 2100
    group by at.track_id
  )
  select count(*) into n
  from tracks t join ta on ta.track_id = t.id
  where t.release_year is not null and t.release_year > ta.y + p_min_diff;
  return n;
end $$;
-- Tracks whose title names a featuring artist (ft./feat./su/with X) that
-- resolves to a real DB artist but is NOT linked in track_artists.
create or replace function featuring_suggestions(p_limit int default 50, p_offset int default 0)
returns table(
  track_id bigint, title text, main_artist text, main_artist_slug text,
  feat_id int, feat_name text, feat_slug text, video_views bigint
)
language plpgsql volatile as $$
begin
  set local statement_timeout = '90s';
  return query
  with cand as (
    select t.id, t.title, t.artist_id, t.video_views,
           lower(unaccent(trim((regexp_match(t.title,
             '\((?:feat|ft|featuring|su|with)\.?\s+([^)]+)\)', 'i'))[1]))) as feat_norm
    from tracks t
    where t.title ~* '\((feat|ft|featuring|su|with)\.?\s'
      and not exists (select 1 from track_artists ta where ta.track_id=t.id and ta.is_primary=false)
  )
  select c.id::bigint, c.title, ma.name, ma.slug,
         fa.id, fa.name, fa.slug, c.video_views
  from cand c
  join artists fa on fa.name_norm = c.feat_norm and fa.id <> c.artist_id
  left join artists ma on ma.id = c.artist_id
  where c.feat_norm is not null and length(c.feat_norm) >= 2
  order by coalesce(c.video_views,0) desc, c.id
  limit p_limit offset p_offset;
end $$;
create or replace function featuring_suggestions_count()
returns bigint language plpgsql volatile as $$
declare n bigint;
begin
  set local statement_timeout = '90s';
  with cand as (
    select t.id, t.artist_id,
           lower(unaccent(trim((regexp_match(t.title,
             '\((?:feat|ft|featuring|su|with)\.?\s+([^)]+)\)', 'i'))[1]))) as feat_norm
    from tracks t
    where t.title ~* '\((feat|ft|featuring|su|with)\.?\s'
      and not exists (select 1 from track_artists ta where ta.track_id=t.id and ta.is_primary=false)
  )
  select count(*) into n
  from cand c join artists fa on fa.name_norm = c.feat_norm and fa.id <> c.artist_id
  where c.feat_norm is not null and length(c.feat_norm) >= 2;
  return n;
end $$;
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
