-- 20260614d_galerija_lineup.sql
-- Foto galerija: keli atlikėjai viename reportaže (line-up: headlineriai,
-- apšildantys, svečiai) + nuotraukų grupavimas viename albume pagal atlikėją
-- ARBA laisvą tagą (pvz. „Žiūrovai", „Atmosfera", „Scena").
--
-- Žr. lib/galerija.ts. Idempotentiška.

/* ───────────────── reportažo line-up (M:N atlikėjai) ───────────────── */

create table if not exists reportage_artists (
  id            bigserial primary key,
  reportage_id  bigint not null references reportages(id) on delete cascade,
  artist_id     bigint not null references artists(id)    on delete cascade,
  role          text,                       -- 'headlineris' | 'apšildantis' | 'svečias' | NULL
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

create unique index if not exists idx_reportage_artists_uniq on reportage_artists (reportage_id, artist_id);
create index        if not exists idx_reportage_artists_artist on reportage_artists (artist_id);

/* ───────────── nuotraukų grupavimas (pagal atlikėją arba tagą) ───────────── */

-- Kiekviena nuotrauka gali būti priskirta KONKREČIAM atlikėjui (artist_id) ARBA
-- laisvam tagui (tag). Jei abu NULL — nuotrauka „bendra" (visa galerija).
alter table reportage_photos add column if not exists artist_id bigint references artists(id) on delete set null;
alter table reportage_photos add column if not exists tag       text;

create index if not exists idx_reportage_photos_artist on reportage_photos (artist_id);
create index if not exists idx_reportage_photos_tag    on reportage_photos (tag);

/* ───────────── backfill: esamą reportages.artist_id → line-up ───────────── */

insert into reportage_artists (reportage_id, artist_id, role, sort_order)
select r.id, r.artist_id, 'headlineris', 0
from reportages r
where r.artist_id is not null
on conflict (reportage_id, artist_id) do nothing;

comment on table  reportage_artists        is 'Reportažo line-up (keli atlikėjai). Žr. lib/galerija.ts';
comment on column reportage_photos.artist_id is 'Nuotraukos grupė pagal atlikėją (line-up). NULL = bendra.';
comment on column reportage_photos.tag       is 'Nuotraukos grupė pagal laisvą tagą (pvz. „Žiūrovai"). NULL = bendra.';
