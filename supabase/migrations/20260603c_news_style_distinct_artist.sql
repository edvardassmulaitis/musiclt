-- 20260603c_news_style_distinct_artist.sql
--
-- news_style_sections — rodyti SKIRTINGUS atlikėjus žanro juostoje (ne 4×
-- tas pats Joss Stone). distinct on (artist_id) → vienas (naujausias) įrašas
-- per atlikėją, paskui top N pagal datą.

create or replace function news_style_sections(p_per int default 4)
returns table (
  genre_id     int,
  genre_name   text,
  uid          text,
  id           int,
  slug         text,
  title        text,
  published    timestamptz,
  artist_id    int,
  artist_name  text,
  artist_cover text
)
language sql stable as $$
  select g.id, g.name, x.uid, x.id, x.slug, x.title, x.published,
         x.artist_id, x.artist_name, x.artist_cover
  from genres g
  cross join lateral (
    select per_artist.*
    from (
      select distinct on (d.artist_id)
        ('l' || d.id) as uid, d.id, d.slug, d.title,
        coalesce(d.first_post_at, d.created_at) as published,
        d.artist_id, a.name as artist_name, a.cover_image_url as artist_cover
      from discussions d
      join artist_genres ag on ag.artist_id = d.artist_id and ag.genre_id = g.id
      join artists a on a.id = d.artist_id
      where d.legacy_kind = 'news' and d.is_legacy and not d.is_deleted
      order by d.artist_id, coalesce(d.first_post_at, d.created_at) desc
    ) per_artist
    order by per_artist.published desc
    limit greatest(p_per, 1)
  ) x
  where g.parent_id is null
  order by g.name, x.published desc;
$$;

grant execute on function news_style_sections(int) to anon, authenticated, service_role;
