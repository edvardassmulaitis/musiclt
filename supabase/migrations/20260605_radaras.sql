-- 20260605_radaras.sql
-- „Naujos muzikos radaras" (/nauji-atlikejai) — naujų ir mažai žinomų atlikėjų showcase.
--
-- Hibridinis modelis (žr. lib/radaras.ts):
--   • AUTO — kandidatai aptinkami pagal signalus: nesenas dainos įkėlimas
--            (tracks.video_uploaded_at) + mažas legacy footprint (legacy_likes)
--            + realus profilis (cover). Nieko nereikia rankom pildyti.
--   • ADMIN override — keturi statusai per artists.radar_status:
--       'featured' → herojus (spotlight viršuje, su redakcijos prierašu)
--       'included' → priverstinai įtraukti į tinklelį (nors signalai silpni)
--       'excluded' → paslėpti (pvz. klaidingai Lietuvai priskirti užsienio
--                    atlikėjai iš chartų scaffold'o — Ice Spice ir pan.)
--       NULL       → palikti auto logikai spręsti
--
-- Idempotentiška (saugu paleisti kelis kartus).

alter table artists add column if not exists radar_status text;
alter table artists add column if not exists radar_blurb  text;
alter table artists add column if not exists radar_sort   integer not null default 0;
alter table artists add column if not exists radar_set_at timestamptz;

-- Leistinos radar_status vertės
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'artists_radar_status_chk') then
    alter table artists
      add constraint artists_radar_status_chk
      check (radar_status is null or radar_status in ('featured','included','excluded'));
  end if;
end $$;

-- Greitas featured/included/excluded fetch (mažas partial index)
create index if not exists idx_artists_radar_status
  on artists (radar_status)
  where radar_status is not null;

comment on column artists.radar_status is 'Radaro override: featured|included|excluded|NULL (žr. lib/radaras.ts)';
comment on column artists.radar_blurb  is 'Trumpas redakcijos prierašas radaro featured kortelei';
comment on column artists.radar_sort   is 'Featured eiliškumas radare (didesnis = aukščiau)';
comment on column artists.radar_set_at is 'Kada paskutinį kartą nustatytas radar_status';
