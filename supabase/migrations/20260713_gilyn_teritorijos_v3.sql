-- Gilyn v3 — muzikos pasaulio žemėlapis
--
-- Taksonomija autorinta iš muzikos žinojimo (NE iš music.lt substilių/tagų).
-- Hierarchija: pasaulis → teritorija. Era ir regionas — teritorijos savybės,
-- įeinančios į tapatybę tik kai jos YRA ta muzika (Sietlo grunge, Detroito techno).
--
-- Atlikėjas keliauja per teritorijas LAIKE: Radiohead → Britpop 93–95 →
-- Alternatyva 95–99 → Elektroninis rokas 00–11. Albumas gauna teritoriją pagal
-- savo metus.
--
-- Žinomumas (fame) — AI vertinimas 1–5, NE music.lt like'ai. Lietuviams matuojamas
-- žinomumas Lietuvoje, kitiems — pasaulinis.

-- ── Pasauliai (žemėlapio kontinentai) ────────────────────────────────────
create table if not exists gilyn_worlds (
  id          text primary key,
  name        text not null,
  sort        int  not null default 0,
  color       text
);

-- ── Teritorijos (vienintelis dalykas, kurį žaidėjas atranda) ─────────────
create table if not exists gilyn_terr (
  id          text primary key,
  world_id    text not null references gilyn_worlds(id) on delete cascade,
  name        text not null,
  era_from    int,
  era_to      int,
  region      text,
  essence     text,                       -- vienas sakinys
  description text,                       -- 3–4 sakiniai (pildoma po patvirtinimo)
  n_artists   int not null default 0,     -- kiek atlikėjų bazėje
  n_known     int not null default 0,     -- iš jų žinomų (fame >= 3)
  n_missing   int not null default 0,     -- žinomų atlikėjų, kurių bazėje NĖRA
  status      text not null default 'active'
              check (status in ('active','thin','merge','drop')),
  merge_into  text references gilyn_terr(id) on delete set null,
  priority    int not null default 2,     -- pildymo prioritetas 1–3
  created_at  timestamptz not null default now()
);
create index if not exists gilyn_terr_world_idx on gilyn_terr(world_id);
create index if not exists gilyn_terr_status_idx on gilyn_terr(status);

-- ── Atlikėjas × teritorija × laikotarpis ─────────────────────────────────
create table if not exists gilyn_artist_terr (
  artist_id   bigint not null references artists(id) on delete cascade,
  terr_id     text   not null references gilyn_terr(id) on delete cascade,
  year_from   int,
  year_to     int,
  source      text not null default 'ai'
              check (source in ('rosteris','likuciai','ai','rankinis')),
  primary key (artist_id, terr_id)
);
create index if not exists gilyn_at_terr_idx on gilyn_artist_terr(terr_id);
create index if not exists gilyn_at_artist_idx on gilyn_artist_terr(artist_id);

-- ── Žinomumas (AI, ne like'ai) ───────────────────────────────────────────
create table if not exists artist_fame (
  artist_id   bigint primary key references artists(id) on delete cascade,
  fame        int not null check (fame between 1 and 5),
  scope       text not null default 'global' check (scope in ('global','lt')),
  rated_at    timestamptz not null default now()
);
create index if not exists artist_fame_idx on artist_fame(fame desc);

-- ── Kaimynystės („kur eiti toliau") ──────────────────────────────────────
-- Svoris = bendri atlikėjai (muzikinis artumas) + co-like (auditorijos artumas).
create table if not exists gilyn_terr_edges (
  a_id        text not null references gilyn_terr(id) on delete cascade,
  b_id        text not null references gilyn_terr(id) on delete cascade,
  shared      int  not null default 0,   -- bendri atlikėjai
  colike      int  not null default 0,   -- vartotojų, mėgstančių abi
  weight      real not null default 0,
  primary key (a_id, b_id)
);
create index if not exists gilyn_edges_a_idx on gilyn_terr_edges(a_id, weight desc);

-- ── Trūkstama muzika: teritorijos ↔ music_requests ───────────────────────
-- Spragos gyvena bendroje trūkstamos muzikos eilėje (source='teritorija'),
-- tad valosi ta pačia mechanika kaip topai/radaras. Ši lentelė laiko ryšį
-- su teritorija ir AI žinomumą, kad eilę būtų galima rikiuoti pagal svarbą.
create table if not exists gilyn_missing (
  id          bigserial primary key,
  terr_id     text not null references gilyn_terr(id) on delete cascade,
  artist_name text not null,
  fame        int  not null default 1,
  request_id  uuid references music_requests(id) on delete set null,
  status      text not null default 'pending'
              check (status in ('pending','added','rejected')),
  added_artist_id bigint references artists(id) on delete set null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index if not exists gilyn_missing_uq on gilyn_missing(terr_id, lower(artist_name));
create index if not exists gilyn_missing_status_idx on gilyn_missing(status, fame desc);

-- ── Auto-išsivalymas: kai atsiranda atlikėjas, spraga užsidaro ───────────
create or replace function gilyn_missing_autoresolve()
returns trigger language plpgsql as $$
begin
  update gilyn_missing m
     set status = 'added',
         added_artist_id = new.id,
         resolved_at = now()
   where m.status = 'pending'
     and lower(m.artist_name) = lower(new.name);

  -- ir iškart priskiriam atlikėją toms teritorijoms, kurių kanone jis buvo
  insert into gilyn_artist_terr (artist_id, terr_id, year_from, year_to, source)
  select new.id, m.terr_id, new.active_from, new.active_until, 'rosteris'
    from gilyn_missing m
   where m.added_artist_id = new.id
  on conflict do nothing;

  return new;
end $$;

drop trigger if exists gilyn_missing_autoresolve_trg on artists;
create trigger gilyn_missing_autoresolve_trg
  after insert on artists
  for each row execute function gilyn_missing_autoresolve();

-- ── Teritorijos statistikos perskaičiavimas ──────────────────────────────
create or replace function gilyn_refresh_terr_stats()
returns void language sql as $$
  update gilyn_terr t set
    n_artists = coalesce((select count(*) from gilyn_artist_terr a where a.terr_id = t.id), 0),
    n_known   = coalesce((select count(*) from gilyn_artist_terr a
                            join artist_fame f on f.artist_id = a.artist_id
                           where a.terr_id = t.id and f.fame >= 3), 0),
    n_missing = coalesce((select count(*) from gilyn_missing m
                           where m.terr_id = t.id and m.status = 'pending' and m.fame >= 3), 0);
$$;

-- ── Albumo teritorijos pagal metus ───────────────────────────────────────
-- Albumas paveldi atlikėjo teritoriją, kurios eros langas apima albumo metus.
-- Jei nė vienas langas nepataiko — imam artimiausią pagal metus (fallback).
create or replace function gilyn_album_territories(p_album bigint)
returns table(terr_id text, exact boolean)
language sql stable as $$
  with al as (select id, artist_id, year from albums where id = p_album),
  hit as (
    select at.terr_id, true as exact
      from gilyn_artist_terr at, al
     where at.artist_id = al.artist_id
       and al.year is not null
       and al.year >= coalesce(at.year_from, -32768) - 1
       and al.year <= coalesce(at.year_to, 32767) + 1
  ),
  near as (
    select at.terr_id, false as exact
      from gilyn_artist_terr at, al
     where at.artist_id = al.artist_id
     order by abs(coalesce(at.year_from, 0) - coalesce(al.year, 0))
     limit 1
  )
  select * from hit
  union all
  select * from near where not exists (select 1 from hit);
$$;

-- ── RLS (skaitymas viešas, rašymas service-role) ─────────────────────────
alter table gilyn_worlds       enable row level security;
alter table gilyn_terr         enable row level security;
alter table gilyn_artist_terr  enable row level security;
alter table gilyn_terr_edges   enable row level security;
alter table artist_fame        enable row level security;
alter table gilyn_missing      enable row level security;

drop policy if exists gilyn_worlds_read on gilyn_worlds;
create policy gilyn_worlds_read on gilyn_worlds for select using (true);
drop policy if exists gilyn_terr_read on gilyn_terr;
create policy gilyn_terr_read on gilyn_terr for select using (true);
drop policy if exists gilyn_at_read on gilyn_artist_terr;
create policy gilyn_at_read on gilyn_artist_terr for select using (true);
drop policy if exists gilyn_edges_read on gilyn_terr_edges;
create policy gilyn_edges_read on gilyn_terr_edges for select using (true);
drop policy if exists artist_fame_read on artist_fame;
create policy artist_fame_read on artist_fame for select using (true);
drop policy if exists gilyn_missing_read on gilyn_missing;
create policy gilyn_missing_read on gilyn_missing for select using (true);
