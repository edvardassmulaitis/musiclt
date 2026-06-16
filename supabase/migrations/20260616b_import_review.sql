-- 20260616b_import_review.sql
-- Full importas → „peržiūra po importo": fone fetch'inam + matchinam, bet NIEKO
-- nepridedam. Rezultatus saugom job_items (matched_*), o statusas 'ready' reiškia
-- „laukia naudotojo patvirtinimo". Patvirtinus — keliam į biblioteką.
alter table public.music_import_job_items add column if not exists matched_type text; -- artist|album|track|null
alter table public.music_import_job_items add column if not exists matched_id   bigint;
alter table public.music_import_job_items add column if not exists pop          int;

create index if not exists idx_mji_matched on public.music_import_job_items(job_id, matched_id) where matched_id is not null;
