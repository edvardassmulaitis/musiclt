-- 20260614c_galerija.sql
-- Foto galerija (/galerija) — koncertų / festivalių foto reportažai + fotografų
-- direktorija. Žr. lib/galerija.ts.
--
-- Modelis:
--   • reportages       — vienas foto reportažas (renginys). Editorial intro +
--                        siejimas su atlikėju ir fotografu. URL /galerija/[slug].
--   • reportage_photos — reportažo nuotraukos (po Flickr importo / upload'o
--                        re-host'inamos į mūsų `covers` bucket'ą → durable URL).
--   • photographers    — JAU EGZISTUOJANTI lentelė (20260424c_photographers.sql).
--                        Praplečiam su curated direktorijos laukais: rodome tik
--                        is_curated=true fotografus (likę 515 — Wikimedia auto
--                        atribucijos šiukšlės — slepiame nuo public sąrašo).
--
-- Idempotentiška (saugu paleisti kelis kartus).

/* ───────────────────── photographers praplėtimas ───────────────────── */

alter table photographers add column if not exists is_curated    boolean not null default false;
alter table photographers add column if not exists role_title    text;     -- pvz. „Koncertų fotografas"
alter table photographers add column if not exists instagram_url text;
alter table photographers add column if not exists flickr_url    text;
alter table photographers add column if not exists facebook_url  text;
alter table photographers add column if not exists display_order integer not null default 0;

-- Curated direktorijos rikiavimas / filtras
create index if not exists idx_photographers_curated
  on photographers (is_curated, display_order);

/* ─────────────────────────── reportages ─────────────────────────── */

create table if not exists reportages (
  id                    bigserial primary key,
  slug                  text not null,
  title                 text not null,
  intro                 text,                       -- editorial įžanga (HTML leidžiama)
  artist_id             bigint references artists(id)       on delete set null,
  photographer_id       bigint references photographers(id) on delete set null,
  event_name            text,                       -- renginio pavadinimas (jei be atlikėjo)
  venue                 text,                       -- vieta („Compensa")
  city                  text,
  event_date            date,                       -- kada vyko koncertas
  cover_url             text,                       -- viršelis (pirma nuotrauka jei tuščia)
  flickr_album_url      text,                       -- šaltinio Flickr albumas (jei importuota)
  source_url            text,                       -- legacy music.lt nuoroda
  legacy_discussion_id  bigint,                     -- ryšys į seną discussions įrašą (jei konvertuota)
  photo_count           integer not null default 0, -- denorm. (greitas listing)
  is_published          boolean not null default true,
  is_featured           boolean not null default false,
  published_at          timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists idx_reportages_slug      on reportages (slug);
create index        if not exists idx_reportages_published on reportages (is_published, published_at desc);
create index        if not exists idx_reportages_artist    on reportages (artist_id);
create index        if not exists idx_reportages_photographer on reportages (photographer_id);
create index        if not exists idx_reportages_legacy    on reportages (legacy_discussion_id);

/* ────────────────────────── reportage_photos ────────────────────────── */

create table if not exists reportage_photos (
  id             bigserial primary key,
  reportage_id   bigint not null references reportages(id) on delete cascade,
  url            text not null,            -- pilno dydžio (mūsų covers bucket arba flickr)
  thumb_url      text,                     -- mažesnis (jei yra; kitaip proxy resize iš url)
  caption        text,
  width          integer,
  height         integer,
  flickr_id      text,                     -- šaltinio Flickr photo id (dedup)
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

create index        if not exists idx_reportage_photos_reportage on reportage_photos (reportage_id, sort_order);
create unique index if not exists idx_reportage_photos_flickr
  on reportage_photos (reportage_id, flickr_id) where flickr_id is not null;

comment on table  reportages       is 'Foto reportažai (/galerija). Žr. lib/galerija.ts';
comment on table  reportage_photos is 'Reportažo nuotraukos (re-host''intos iš Flickr / upload).';
comment on column photographers.is_curated is 'Rodyti public fotografų direktorijoje (likę = Wikimedia auto šiukšlės).';
