-- 20260614b_koncertu_irasai.sql
-- „Koncertų įrašai" (/koncertu-irasai) — live pasirodymų vaizdo įrašų archyvas.
--
-- Modelis (žr. lib/concert-recordings.ts):
--   • Kiekvienas įrašas SIEJAMAS su atlikėju (artist_id). Stilius filtrui imamas
--     iš atlikėjo žanrų ir denormalizuojamas į `styles[]` (greitas filtravimas
--     be join'ų; perskaičiuojamas išsaugant per admin).
--   • Įrašas pridedamas iš VIENOS YouTube nuorodos — admin „greitas pridėjimas":
--     trukmė + įkėlimo data iš YT Data API, vieta/miestas/koncerto data per
--     AI parse (redaguojama prieš išsaugant).
--   • recording_type — auto pagal trukmę (žr. lib), admin gali perrašyti:
--       'full'    → Pilnas koncertas (≥45 min)
--       'special' → Gyvas pasirodymas (12–45 min)
--       'session' → Live sesija / atskira daina (<12 min)
--
-- Idempotentiška (saugu paleisti kelis kartus).

create table if not exists concert_recordings (
  id                  bigserial primary key,
  slug                text not null,
  youtube_id          text not null,
  youtube_url         text not null,
  title               text not null,
  artist_id           bigint references artists(id) on delete set null,
  artist_name_cached  text,                       -- denorm. (festivaliai / greitas listing)
  duration_seconds    integer,                    -- iš YT contentDetails.duration
  recording_type      text not null default 'full',
  venue               text,                       -- įrašo vieta (pvz. „Žalgirio arena")
  city                text,
  country             text,
  recorded_on         date,                       -- kada vyko koncertas
  recorded_year       integer,
  uploaded_at         timestamptz,                -- YT įkėlimo data
  channel             text,
  description         text,
  thumbnail_url       text,
  view_count          bigint,
  styles              text[] not null default '{}',  -- denorm. iš atlikėjo žanrų (filtrui)
  is_published        boolean not null default true,
  is_featured         boolean not null default false,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Leistinos recording_type vertės
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'concert_recordings_type_chk') then
    alter table concert_recordings
      add constraint concert_recordings_type_chk
      check (recording_type in ('full','special','session'));
  end if;
end $$;

-- Vienas įrašas vienam YT video (idempotentiškas re-import per youtube_id)
create unique index if not exists idx_concert_recordings_youtube_id
  on concert_recordings (youtube_id);

-- Unikalus slug (URL /koncertu-irasai/[slug])
create unique index if not exists idx_concert_recordings_slug
  on concert_recordings (slug);

-- Atlikėjo įrašai (atlikėjo puslapio sekcija)
create index if not exists idx_concert_recordings_artist
  on concert_recordings (artist_id);

-- Public listing — naujausi pirmi
create index if not exists idx_concert_recordings_published
  on concert_recordings (is_published, uploaded_at desc);

-- Stilių filtras
create index if not exists idx_concert_recordings_styles
  on concert_recordings using gin (styles);

comment on table  concert_recordings              is 'Live pasirodymų vaizdo įrašai (/koncertu-irasai). Žr. lib/concert-recordings.ts';
comment on column concert_recordings.recording_type is 'full|special|session — auto pagal trukmę, admin gali perrašyti';
comment on column concert_recordings.styles        is 'Denormalizuoti atlikėjo žanrai (stilių filtrui be join''ų)';
comment on column concert_recordings.recorded_on   is 'Kada VYKO koncertas (skiriasi nuo uploaded_at — YT įkėlimo)';
