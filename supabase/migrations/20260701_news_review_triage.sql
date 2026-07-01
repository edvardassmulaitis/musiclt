-- 20260701_news_review_triage.sql
--
-- News triage admin (Thread C): legacy RECENZIJA įrašų → narių įrašų (blog_posts)
-- susiejimo infrastruktūra.
--
-- KONTEKSTAS (patikrinta gyvoje DB 2026-07-01):
--   • Recenzijos gyvena `discussions` (NE `news`): is_legacy AND legacy_kind='news'
--     AND title ILIKE '%recenzij%'. Iš viso ~524; iš jų ~194 turi realų body tekstą
--     (news_has_text), likusios — tik antraštė.
--   • `discussions.author_name` recenzijoms yra NULL → autorius parsinamas iš body
--     byline'o ("vertino X", "Tekstą parašė X"; žr. lib/parse-review-author.ts).
--
-- Ši migracija NIEKO netrina ir neliečia `discussions`/`news` stulpelių — tik
-- prideda dvi pagalbines lenteles. Idempotentiška (saugu kartoti).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. AUTORIAUS → NARIO susiejimo ATMINTIS
--    Susiejus "Rūta Paitian → p_ruta" vieną kartą, visi (seni ir nauji) tos
--    autorės įrašai priskiriami automatiškai (per author_key).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.review_author_map (
  id           uuid primary key default gen_random_uuid(),
  author_key   text not null unique,        -- normalizuotas ("ruta paitian"), žr. authorKey()
  author_display text,                       -- gražus vardas ("Rūta Paitian")
  profile_id   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id) on delete set null
);
create index if not exists idx_review_author_map_profile
  on public.review_author_map(profile_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. TRIAGE būsena per recenziją. Atskira lentelė (o ne stulpeliai discussions'e),
--    kad neapkrautume 25k+ eilučių centrinės lentelės retai naudojamais laukais.
--    Eilutės kuriamos tinginiu būdu (parse endpoint upsert'ina).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.news_review_triage (
  discussion_id          bigint primary key
                           references public.discussions(id) on delete cascade,
  author_raw             text,              -- parsintas vardas (display), pvz "Rūta Paitian"
  author_key             text,              -- normalizuotas raktas (join į review_author_map)
  parse_method           text,              -- kuri taisyklė suveikė ('vertino', 'tekstas', ...)
  parse_conf             real,              -- 0..1 pasitikėjimas
  author_profile_id      uuid references public.profiles(id) on delete set null,
  status                 text not null default 'pending'
                           check (status in ('pending','linked','converted','dismissed')),
  converted_blog_post_id uuid references public.blog_posts(id) on delete set null,
  parsed_at              timestamptz,
  updated_at             timestamptz not null default now(),
  updated_by             uuid references public.profiles(id) on delete set null
);
create index if not exists idx_nrt_status      on public.news_review_triage(status);
create index if not exists idx_nrt_author_key  on public.news_review_triage(author_key);
create index if not exists idx_nrt_profile     on public.news_review_triage(author_profile_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. RLS: prieiga TIK per service-role admin API (createAdminClient). Įjungiam
--    RLS be viešų policy — anon/authenticated negauna nieko, service_role
--    aplenkia RLS. (Atitinka projekto admin-only lentelių konvenciją.)
-- ─────────────────────────────────────────────────────────────────────────
alter table public.review_author_map  enable row level security;
alter table public.news_review_triage enable row level security;
