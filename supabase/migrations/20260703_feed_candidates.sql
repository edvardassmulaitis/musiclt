-- 20260703_feed_candidates.sql
--
-- Homepage feed KANDIDATŲ sistema (manual approval + auto-approve):
-- nauji auto-įrašai (naujienos/renginiai/įrašai/verta) į mobilų „istorijų"
-- feed'ą patenka tik PATVIRTINTI. Registruoja cron (/api/cron/feed-candidates),
-- admin tvirtina /admin/feed; jei neperžiūrėta per AUTO_APPROVE_H (8h) —
-- auto-pasitvirtina. Populiarumo taisyklė: susieto atlikėjo score >= 30 →
-- patvirtinama IŠKART (žinomi atlikėjai nelaukia).
--
-- Naudojam esamą home_feed lentelę su nauju kind='candidate'. Idempotentiška.

alter table public.home_feed drop constraint if exists home_feed_kind_check;
alter table public.home_feed
  add constraint home_feed_kind_check check (kind in ('override','custom','candidate'));

alter table public.home_feed
  add column if not exists status        text check (status in ('pending','approved','rejected')),
  add column if not exists item_type     text,
  add column if not exists first_seen_at timestamptz default now(),
  add column if not exists decided_at    timestamptz,
  add column if not exists decided_by    uuid references public.profiles(id) on delete set null,
  add column if not exists auto_approved boolean not null default false;

create index if not exists home_feed_cand_idx on public.home_feed(kind, status);
