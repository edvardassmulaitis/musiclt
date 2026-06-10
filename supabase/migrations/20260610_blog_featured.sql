-- 2026-06-10: /atrasti redesign — kuruotas „Verta dėmesio" blokas.
-- Admin pažymi įrašą featured → kabo /atrasti viršuje iki featured_until
-- (default +48h nuo pažymėjimo). PRITAIKYTA per Supabase Mgmt API 2026-06-10.

alter table blog_posts add column if not exists featured_until timestamptz;
create index if not exists idx_blog_posts_featured
  on blog_posts (featured_until) where featured_until is not null;
