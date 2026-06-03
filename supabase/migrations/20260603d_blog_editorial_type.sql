-- 20260603d_blog_editorial_type.sql
--
-- Narių įrašų (dienoraščių) REDAKCINIS tipas. Migracija beveik visą UGC sumetė į
-- post_type='article' (legacy_source='diary', ~20k) — vienas nediferencijuotas
-- kibiras. Klasifikuojam juos į smulkesnius tipus (recenzija / koncertai /
-- nuomone / dienorastis), kad /atradimai turėtų tipų įvairovę. Analogiškai
-- naujienų news_category klasifikacijai (žr. 20260603b_news_to_classify.sql).
--
-- editorial_type:
--   recenzija    — albumo / dainos apžvalga ar vertinimas
--   koncertai    — koncerto / festivalio įspūdžiai, reportažas
--   nuomone      — nuomonė / aptarimas / diskusija apie muziką ar sceną
--   dienorastis  — asmeninis dienoraščio įrašas (numatytasis residual)
--
-- NULL = dar neklasifikuota. editorial_classified_at — kad neperdirbtume.

alter table public.blog_posts
  add column if not exists editorial_type        text,
  add column if not exists editorial_classified_at timestamptz;

create index if not exists idx_blog_posts_editorial_type
  on public.blog_posts (editorial_type, published_at desc)
  where editorial_type is not null and status = 'published';

-- ── RPC: neklasifikuoti article/diary įrašai, NAUJAUSI pirma, tik RECENT langas.
--    Grąžina ir prisegtų entity flag'us (heuristikai endpoint'e). ──
create or replace function blog_to_classify(p_limit int default 20, p_recent_days int default 540)
returns table (id bigint, title text, body text, has_album boolean, has_track boolean)
language sql stable as $$
  select b.id::bigint,
         coalesce(b.title, '') as title,
         left(coalesce(b.content, ''), 500) as body,
         (b.target_album_id is not null) as has_album,
         (b.target_track_id is not null) as has_track
  from public.blog_posts b
  where b.post_type = 'article'
    and b.status = 'published'
    and b.editorial_type is null
    and coalesce(b.published_at, b.created_at) >= now() - (p_recent_days || ' days')::interval
  order by coalesce(b.published_at, b.created_at) desc
  limit greatest(p_limit, 1);
$$;

grant execute on function blog_to_classify(int, int) to anon, authenticated, service_role;
