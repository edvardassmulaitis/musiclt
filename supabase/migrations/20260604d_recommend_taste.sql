-- 20260604d_recommend_taste.sql
-- „Tau" rekomendacijų variklis: blenduoja tris signalus į vieną ranked atlikėjų
-- sąrašą, kuriuos narys DAR nepamėgo:
--   1) collaborative — kiti nariai, mėgstantys >=2 tų pačių atlikėjų (co-like)
--   2) content (genres) — atlikėjai, dalijantys mano mėgstamų žanrų
--   3) content (substyles) — tas pats su substiliais (tikslesnis signalas → didesnis svoris)
-- + rising boost iš artists.recent_score. Kiekvienas signalas normalizuojamas 0..1
-- pagal savo maksimumą, kad būtų palyginami. Grąžina reason label kortelėms.
--
-- Idempotentiška (create or replace). STABLE — saugu cache'inti per request.

create or replace function recommend_taste(p_user uuid, p_limit int default 30)
returns table (
  artist_id      int,
  name           text,
  slug           text,
  cover_image_url text,
  country        text,
  recent_score   numeric,
  score          numeric,
  reason         text
)
language sql
stable
as $$
with me as (
  select distinct entity_id::int as artist_id
  from likes
  where user_id = p_user and entity_type = 'artist' and entity_id is not null
),
my_genres as (
  select ag.genre_id, count(*)::numeric as w
  from artist_genres ag join me on me.artist_id = ag.artist_id
  group by ag.genre_id
),
my_substyles as (
  select asu.substyle_id, count(*)::numeric as w
  from artist_substyles asu join me on me.artist_id = asu.artist_id
  group by asu.substyle_id
),
-- co-like „kaimynai": nariai, mėgstantys >=2 mano atlikėjų
neighbors as (
  select l.user_id, count(*)::numeric as shared
  from likes l join me on me.artist_id = l.entity_id::int
  where l.entity_type = 'artist' and l.user_id is not null and l.user_id <> p_user
  group by l.user_id
  having count(*) >= 2
  order by shared desc
  limit 300
),
collab as (
  select l.entity_id::int as artist_id, sum(n.shared) as raw
  from likes l join neighbors n on n.user_id = l.user_id
  where l.entity_type = 'artist' and l.entity_id is not null
  group by l.entity_id::int
),
content_g as (
  select ag.artist_id, sum(g.w) as raw
  from artist_genres ag join my_genres g on g.genre_id = ag.genre_id
  group by ag.artist_id
),
content_s as (
  select asu.artist_id, sum(s.w) as raw
  from artist_substyles asu join my_substyles s on s.substyle_id = asu.substyle_id
  group by asu.artist_id
),
collab_n   as (select artist_id, raw / nullif((select max(raw) from collab),0)     as s from collab),
content_gn as (select artist_id, raw / nullif((select max(raw) from content_g),0)  as s from content_g),
content_sn as (select artist_id, raw / nullif((select max(raw) from content_s),0)  as s from content_s),
blended as (
  select artist_id,
    coalesce(max(s) filter (where src = 'collab'), 0) as c,
    coalesce(max(s) filter (where src = 'gen'),    0) as g,
    coalesce(max(s) filter (where src = 'sub'),    0) as su
  from (
    select artist_id, s, 'collab' as src from collab_n
    union all select artist_id, s, 'gen' from content_gn
    union all select artist_id, s, 'sub' from content_sn
  ) u
  group by artist_id
)
select
  a.id, a.name, a.slug, a.cover_image_url, a.country, a.recent_score,
  ( b.c * 1.0
  + b.g * 0.6
  + b.su * 0.8
  + (coalesce(a.recent_score, 0) / 842.0) * 0.5 )::numeric as score,
  case
    when (coalesce(a.recent_score, 0) / 842.0) > 0.12 then 'rising'
    when b.c > 0.40                                   then 'fans'
    else 'similar'
  end as reason
from blended b
join artists a on a.id = b.artist_id
where b.artist_id not in (select artist_id from me)
  and a.cover_image_url is not null
  and (a.is_active is distinct from false)
order by score desc
limit p_limit;
$$;
