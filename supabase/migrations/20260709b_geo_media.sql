-- ────────────────────────────────────────────────────────────────────────────
-- Geo DB (countries → cities → venues, connected) + media/festival laukai
-- „Matyti gyvai" funkcijai.
-- ────────────────────────────────────────────────────────────────────────────

-- 1) COUNTRIES lookup lentelė
create table if not exists public.countries (
  id         integer generated always as identity primary key,
  name       text not null unique,
  code       text unique,               -- ISO alpha-2 (LT, LV, …)
  slug       text unique,
  sort_order integer not null default 100,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.countries (name, code, slug, sort_order) values
  ('Lietuva','LT','lietuva',1),
  ('Latvija','LV','latvija',2),
  ('Estija','EE','estija',3),
  ('Lenkija','PL','lenkija',4),
  ('Jungtinė Karalystė','GB','jungtine-karalyste',5),
  ('Vokietija','DE','vokietija',6),
  ('Nyderlandai','NL','nyderlandai',7),
  ('Prancūzija','FR','prancuzija',8),
  ('Ispanija','ES','ispanija',9),
  ('Italija','IT','italija',10),
  ('Švedija','SE','svedija',11),
  ('Suomija','FI','suomija',12),
  ('Danija','DK','danija',13),
  ('Norvegija','NO','norvegija',14),
  ('Čekija','CZ','cekija',15),
  ('Austrija','AT','austrija',16),
  ('Belgija','BE','belgija',17),
  ('Šveicarija','CH','sveicarija',18),
  ('Airija','IE','airija',19),
  ('JAV','US','jav',20)
on conflict (name) do nothing;

-- 2) CITIES → country_id (esamus 17 LT miestų priskiriam Lietuvai)
alter table public.cities add column if not exists country_id integer references public.countries(id);
update public.cities set country_id = (select id from public.countries where code = 'LT')
  where country_id is null;

-- 3) VENUES → country_id (backfill iš teksto, kur sutampa; likę → Lietuva)
alter table public.venues add column if not exists country_id integer references public.countries(id);
update public.venues v set country_id = c.id
  from public.countries c
  where v.country_id is null
    and (lower(btrim(v.country)) = lower(c.name)
         or (v.country in ('Lithuania','Lietuva') and c.code = 'LT'));
update public.venues set country_id = (select id from public.countries where code = 'LT')
  where country_id is null;

-- 4) profile_seen_live — media + festivalis/lineup
alter table public.profile_seen_live add column if not exists media jsonb not null default '[]'::jsonb;
alter table public.profile_seen_live add column if not exists raw_event_is_festival boolean not null default false;
alter table public.profile_seen_live add column if not exists raw_event_lineup text;

create index if not exists idx_cities_country on public.cities(country_id);
create index if not exists idx_venues_country on public.venues(country_id);
