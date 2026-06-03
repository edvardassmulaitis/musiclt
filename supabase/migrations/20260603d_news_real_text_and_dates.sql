-- 20260603d_news_real_text_and_dates.sql
--
-- Edvardo feedback 2026-06-03:
--  (8) datos visoms naujienoms rodė „šiandien" — nes šviežiai scrape'inti įrašai
--      yra TIK antraštės (body == title) su created_at=scrape data. Realios
--      datos (first_post_at) turi tik turiningi įrašai.
--  (9) excludinti naujienas be teksto viduje (~14k yra body==title stub'ai).
--
-- Sprendimas: VISUR rodom tik naujienas su REALIU tekstu (body gerokai ilgesnis
-- už antraštę), o display data = first_post_at/published_at (NULL jei nėra).
-- Tai palieka ~6k turiningų straipsnių su realiomis datomis (2003–2026).

-- ── Helper: ar naujiena turi realų tekstą (ne vien antraštę) ──────────────────
create or replace function has_news_text(p_body text, p_title text)
returns boolean
immutable language sql as $$
  select char_length(btrim(regexp_replace(coalesce(p_body, ''), '<[^>]*>', '', 'g')))
       > char_length(btrim(coalesce(p_title, ''))) + 40;
$$;

-- ── news_feed: + tekstas, realios datos ──────────────────────────────────────
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
  uid text, id int, slug text, title text, published timestamptz, image_url text,
  category text, source text, like_count int, comment_count int, view_count int,
  artist_id int, artist_name text, artist_slug text, artist_cover text,
  country text, excerpt text, total bigint
)
language sql stable as $$
  with base as (
    select
      ('m' || n.id) as uid, n.id, n.slug, n.title,
      n.published_at as published,                       -- reali data (gali būti null)
      coalesce(n.published_at, n.created_at) as ord_date,
      n.image_small_url as image_url, n.news_category as category, 'modern'::text as source,
      0 as like_count, 0 as comment_count, 0 as view_count, n.artist_id,
      left(regexp_replace(coalesce(n.body,''), '<[^>]*>', ' ', 'g'), 240) as excerpt
    from news n
    where has_news_text(n.body, n.title)
    union all
    select
      ('l' || d.id), d.id, d.slug, d.title,
      d.first_post_at,                                   -- reali data (gali būti null)
      coalesce(d.first_post_at, d.created_at),
      null::text, d.news_category, 'legacy',
      coalesce(d.like_count,0), coalesce(d.comment_count,0), coalesce(d.view_count,0),
      d.artist_id,
      left(regexp_replace(coalesce(d.body,''), '<[^>]*>', ' ', 'g'), 240)
    from discussions d
    where d.legacy_kind='news' and d.is_legacy and not d.is_deleted
      and has_news_text(d.body, d.title)
  ),
  joined as (
    select b.*, a.name artist_name, a.slug artist_slug, a.cover_image_url artist_cover, a.country
    from base b left join artists a on a.id = b.artist_id
  ),
  filtered as (
    select * from joined j
    where (p_category is null or j.category = p_category)
      and (p_search is null or j.title ilike '%' || p_search || '%')
      and (p_scope is null
           or (p_scope='lt'    and coalesce(j.country,'Lietuva') in ('Lietuva','LT','Lithuania'))
           or (p_scope='world' and coalesce(j.country,'Lietuva') not in ('Lietuva','LT','Lithuania')))
      and (p_style is null or exists (select 1 from artist_genres ag where ag.artist_id=j.artist_id and ag.genre_id=p_style))
  ),
  counted as (select *, count(*) over() as total from filtered)
  select uid, id, slug, title, published, image_url, category, source,
         like_count, comment_count, view_count, artist_id, artist_name,
         artist_slug, artist_cover, country, excerpt, total
  from counted
  order by
    (case when p_sort='popular' then (like_count+comment_count+view_count) else 0 end) desc,
    published desc nulls last
  limit greatest(p_limit,0) offset greatest(p_offset,0);
$$;

-- ── news_facets: tik turiningos naujienos ────────────────────────────────────
create or replace function news_facets()
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'total',
      (select count(*) from discussions where legacy_kind='news' and is_legacy and not is_deleted and has_news_text(body,title))
      + (select count(*) from news where has_news_text(body,title)),
    'styles', coalesce((
      select jsonb_object_agg(gid::text, n) from (
        select g.id gid, count(distinct d.id) n
        from genres g
        join artist_genres ag on ag.genre_id=g.id
        join discussions d on d.artist_id=ag.artist_id
          and d.legacy_kind='news' and d.is_legacy and not d.is_deleted and has_news_text(d.body,d.title)
        where g.parent_id is null group by g.id) s), '{}'::jsonb),
    'categories', coalesce((
      select jsonb_object_agg(coalesce(news_category,'_none'), n) from (
        select news_category, count(*) n from discussions
        where legacy_kind='news' and is_legacy and not is_deleted and has_news_text(body,title)
        group by news_category) c), '{}'::jsonb),
    'scope', jsonb_build_object(
      'lt', (select count(*) from discussions d join artists a on a.id=d.artist_id
             where d.legacy_kind='news' and d.is_legacy and not d.is_deleted and has_news_text(d.body,d.title)
               and coalesce(a.country,'Lietuva') in ('Lietuva','LT','Lithuania')),
      'world', (select count(*) from discussions d join artists a on a.id=d.artist_id
             where d.legacy_kind='news' and d.is_legacy and not d.is_deleted and has_news_text(d.body,d.title)
               and coalesce(a.country,'Lietuva') not in ('Lietuva','LT','Lithuania'))
    )
  );
$$;

-- ── news_to_classify: tik turiningos, naujausios (reali data) pirma ───────────
create or replace function news_to_classify(p_limit int default 20)
returns table (id int, source text, title text, body text)
language sql stable as $$
  select x.id, x.source, x.title, x.body
  from (
    select d.id, 'legacy'::text source, d.title, left(coalesce(d.body,''),400) body,
           coalesce(d.first_post_at, d.created_at) ord
    from discussions d
    where d.legacy_kind='news' and d.is_legacy and not d.is_deleted
      and d.news_category is null and has_news_text(d.body, d.title)
    union all
    select n.id, 'modern', n.title, left(coalesce(n.body,''),400), n.published_at
    from news n where n.news_category is null and has_news_text(n.body, n.title)
  ) x
  order by x.ord desc nulls last
  limit greatest(p_limit, 1);
$$;

grant execute on function has_news_text(text,text) to anon, authenticated, service_role;
grant execute on function news_feed(int,text,text,text,text,int,int) to anon, authenticated, service_role;
grant execute on function news_facets() to anon, authenticated, service_role;
grant execute on function news_to_classify(int) to anon, authenticated, service_role;
