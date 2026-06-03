-- 20260603b_news_to_classify.sql
--
-- Helper RPC AI tipo klasifikacijai — grąžina dar neklasifikuotas naujienas
-- (news_category IS NULL) NAUJAUSIAS pirma pagal display datą
-- coalesce(first_post_at, created_at). Taip klasifikuojam tik aktualias/šviežias
-- naujienas (senos legacy dažnai neaktualios — Edvardo feedback 2026-06-03).

create or replace function news_to_classify(p_limit int default 20)
returns table (id int, source text, title text, body text)
language sql stable as $$
  select x.id, x.source, x.title, x.body
  from (
    select d.id,
           'legacy'::text as source,
           d.title,
           left(coalesce(d.body, ''), 400) as body,
           coalesce(d.first_post_at, d.created_at) as ord
    from discussions d
    where d.legacy_kind = 'news' and d.is_legacy and not d.is_deleted
      and d.news_category is null
    union all
    select n.id, 'modern', n.title, left(coalesce(n.body, ''), 400), n.published_at
    from news n
    where n.news_category is null
  ) x
  order by x.ord desc nulls last
  limit greatest(p_limit, 1);
$$;

grant execute on function news_to_classify(int) to anon, authenticated, service_role;
