-- 20260603_news_categorization.sql
--
-- /naujienos perdarymas: filtrai pagal kategoriją + stilių, featured hero,
-- naršymas pagal stilių, dedikuoti SEO landing'ai.
--
-- Naujienų šaltiniai (du):
--   1. news (modern editorial)
--   2. discussions (legacy_kind='news', is_legacy) — ~19.8k scraped iš music.lt
--
-- Kategorija (release/tour/performance/career_step/other) priskiriama AI
-- (Haiku) per /api/admin/news/classify. Stilius išvedamas iš atlikėjo
-- top-level žanro (artist_genres → genres.parent_id IS NULL). Scope (LT/world)
-- iš atlikėjo šalies.

-- ── 1) Kategorijos stulpelis ────────────────────────────────────────────────
alter table news        add column if not exists news_category text;
alter table discussions add column if not exists news_category text;

-- ── 2) Indeksai ─────────────────────────────────────────────────────────────
-- Feed sort: naujausios naujienos (legacy = first_post_at)
create index if not exists idx_discussions_news_feed
  on discussions (first_post_at desc nulls last)
  where legacy_kind = 'news' and is_legacy and not is_deleted;

-- Kategorijos filtras
create index if not exists idx_discussions_news_category
  on discussions (news_category)
  where legacy_kind = 'news' and is_legacy and not is_deleted;
create index if not exists idx_news_news_category on news (news_category);

-- Reverse artist_genres (genre_id → artist_id) by-style join'ui.
-- (PK yra (artist_id, genre_id) — reikia atvirkščio leading column'o.)
create index if not exists idx_artist_genres_genre on artist_genres (genre_id, artist_id);

-- ── 3) news_feed RPC ────────────────────────────────────────────────────────
-- Unifikuotas modern + legacy feed'as su filtrais, sort'u, paginacija ir
-- total count'u (window). Grąžina display field'us vienu round-trip'u.
--
-- p_style   — genres.id (top-level), NULL = visi stiliai
-- p_category— release|tour|performance|career_step|other, NULL = visos
-- p_scope   — 'lt' | 'world' | NULL
-- p_search  — title ilike, NULL = be paieškos
-- p_sort    — 'newest' (default) | 'popular'
create or replace function news_feed(
  p_style    int  default null,
  p_category text default null,
  p_scope    text default null,
  p_search   text default null,
  p_sort     text default 'newest',
  p_limit    int  default 24,
  p_offset   int  default 0
)
returns table (
  uid           text,
  id            int,
  slug          text,
  title         text,
  published     timestamptz,
  image_url     text,
  category      text,
  source        text,
  like_count    int,
  comment_count int,
  view_count    int,
  artist_id     int,
  artist_name   text,
  artist_slug   text,
  artist_cover  text,
  country       text,
  excerpt       text,
  total         bigint
)
language sql stable as $$
  with base as (
    select
      ('m' || n.id)            as uid,
      n.id                     as id,
      n.slug                   as slug,
      n.title                  as title,
      n.published_at           as published,
      n.image_small_url        as image_url,
      n.news_category          as category,
      'modern'::text           as source,
      0                        as like_count,
      0                        as comment_count,
      0                        as view_count,
      n.artist_id              as artist_id,
      left(regexp_replace(coalesce(n.body,''), '<[^>]*>', ' ', 'g'), 240) as excerpt
    from news n
    union all
    select
      ('l' || d.id),
      d.id,
      d.slug,
      d.title,
      coalesce(d.first_post_at, d.created_at),
      null::text,
      d.news_category,
      'legacy',
      coalesce(d.like_count, 0),
      coalesce(d.comment_count, 0),
      coalesce(d.view_count, 0),
      d.artist_id,
      left(regexp_replace(coalesce(d.body,''), '<[^>]*>', ' ', 'g'), 240)
    from discussions d
    where d.legacy_kind = 'news' and d.is_legacy and not d.is_deleted
  ),
  joined as (
    select b.*,
           a.name             as artist_name,
           a.slug             as artist_slug,
           a.cover_image_url  as artist_cover,
           a.country          as country
    from base b
    left join artists a on a.id = b.artist_id
  ),
  filtered as (
    select * from joined j
    where (p_category is null or j.category = p_category)
      and (p_search   is null or j.title ilike '%' || p_search || '%')
      and (p_scope    is null
           or (p_scope = 'lt'    and coalesce(j.country, 'Lietuva') in ('Lietuva','LT','Lithuania'))
           or (p_scope = 'world' and coalesce(j.country, 'Lietuva') not in ('Lietuva','LT','Lithuania')))
      and (p_style is null or exists (
             select 1 from artist_genres ag
             where ag.artist_id = j.artist_id and ag.genre_id = p_style))
  ),
  counted as (
    select *, count(*) over() as total from filtered
  )
  select uid, id, slug, title, published, image_url, category, source,
         like_count, comment_count, view_count, artist_id, artist_name,
         artist_slug, artist_cover, country, excerpt, total
  from counted
  order by
    (case when p_sort = 'popular' then (like_count + comment_count + view_count) else 0 end) desc,
    published desc nulls last
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

-- ── 4) news_facets RPC — chip skaičiai (cache'inama TS pusėje) ───────────────
create or replace function news_facets()
returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'total',
      (select count(*) from discussions where legacy_kind='news' and is_legacy and not is_deleted)
      + (select count(*) from news),
    'styles', coalesce((
      select jsonb_object_agg(gid::text, n) from (
        select g.id as gid, count(distinct d.id) as n
        from genres g
        join artist_genres ag on ag.genre_id = g.id
        join discussions d on d.artist_id = ag.artist_id
          and d.legacy_kind='news' and d.is_legacy and not d.is_deleted
        where g.parent_id is null
        group by g.id
      ) s
    ), '{}'::jsonb),
    'categories', coalesce((
      select jsonb_object_agg(coalesce(news_category,'_none'), n) from (
        select news_category, count(*) as n
        from discussions
        where legacy_kind='news' and is_legacy and not is_deleted
        group by news_category
      ) c
    ), '{}'::jsonb),
    'scope', jsonb_build_object(
      'lt', (select count(*) from discussions d join artists a on a.id=d.artist_id
             where d.legacy_kind='news' and d.is_legacy and not d.is_deleted
               and coalesce(a.country,'Lietuva') in ('Lietuva','LT','Lithuania')),
      'world', (select count(*) from discussions d join artists a on a.id=d.artist_id
             where d.legacy_kind='news' and d.is_legacy and not d.is_deleted
               and coalesce(a.country,'Lietuva') not in ('Lietuva','LT','Lithuania'))
    )
  );
$$;

-- ── 5) news_style_sections RPC — naujausios naujienos per top-level stilių ───
-- Vienas round-trip'as visoms 8 stiliaus juostoms (LATERAL per žanrą).
create or replace function news_style_sections(p_per int default 6)
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
    select ('l' || d.id) as uid, d.id, d.slug, d.title,
           coalesce(d.first_post_at, d.created_at) as published,
           d.artist_id, a.name as artist_name, a.cover_image_url as artist_cover
    from discussions d
    join artist_genres ag on ag.artist_id = d.artist_id and ag.genre_id = g.id
    join artists a on a.id = d.artist_id
    where d.legacy_kind='news' and d.is_legacy and not d.is_deleted
    order by coalesce(d.first_post_at, d.created_at) desc
    limit greatest(p_per, 1)
  ) x
  where g.parent_id is null
  order by g.name, x.published desc;
$$;

-- ── 6) Grants (anon/auth naudoja service role server-side, bet dėl saugumo) ──
grant execute on function news_feed(int,text,text,text,text,int,int) to anon, authenticated, service_role;
grant execute on function news_facets() to anon, authenticated, service_role;
grant execute on function news_style_sections(int) to anon, authenticated, service_role;
