-- 20260605e_discoveries_user_submit.sql
-- Nariai gali patys pridėti atradimą (ne tik iš forumo gijos). Toks atradimas
-- neturi comment_id — body saugomas tiesiai discoveries.body; source='user'.

alter table public.discoveries add column if not exists source text not null default 'forum';
alter table public.discoveries add column if not exists body text;
create index if not exists discoveries_source_idx on public.discoveries (source);
