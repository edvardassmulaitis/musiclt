-- 20260701d_artist_duplicates_list.sql
--
-- Pagalbinė RPC admin dublikatų peržiūrai: grąžina VISUS atlikėjus, kurių slug
-- kartojasi (≥2), su turinio statistika (dainos, albumai, score), kad admin
-- galėtų pasirinkti keeper'į ir sujungti per merge_artists().

create or replace function public.list_artist_duplicates()
returns table (
  slug text, id bigint, name text, score int, legacy_id bigint,
  cover_image_url text, tracks bigint, albums bigint
)
language sql stable security definer set search_path = public as $$
  with dup as (
    select slug from public.artists where slug is not null group by slug having count(*) > 1
  )
  select a.slug, a.id, a.name, a.score, a.legacy_id, a.cover_image_url,
         (select count(*) from public.tracks t  where t.artist_id  = a.id) as tracks,
         (select count(*) from public.albums al where al.artist_id = a.id) as albums
  from public.artists a
  join dup on dup.slug = a.slug
  order by a.slug asc, a.score desc nulls last, a.id asc;
$$;

grant execute on function public.list_artist_duplicates() to service_role;
