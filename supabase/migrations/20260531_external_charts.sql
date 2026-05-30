-- ────────────────────────────────────────────────────────────────────────────
-- External charts (AGATA, Apple, Official UK, Billboard, TikTok, Spotify, ...)
--
-- TIKSLAS: oficialūs / trečiųjų šalių topai laikomi ATSKIRAI nuo voting
-- sistemos (top_weeks/top_entries). Voting tops yra interaktyvūs (registered/
-- anon balsai, finalize_top_week RPC), o čia — read-only snapshot'ai iš išorės.
--
-- HYBRID resolve modelis:
--   • LT šaltiniai (agata_*, mama, radio_*) → entry resolver'is bando match'inti
--     į esamą katalogą; jei nepavyksta IR atlikėjas LT → AUTO-CREATE per
--     quick-create flow (track_id užpildomas). Žr. EXTERNAL_CHARTS_PLAN.md.
--   • Užsienio (apple_*, official_uk, billboard_*, spotify_*) → tik LIGHT match
--     į jau esančius atlikėjus; jei nėra — lieka tekstinis įrašas (artist_name/
--     title + source cover_url). Katalogo NETERŠIA.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists external_charts (
  id           bigserial primary key,
  source       text not null,        -- 'agata' | 'apple' | 'official_uk' | 'billboard' | 'spotify' | 'mama' | 'radio_m1' ...
  chart_key    text not null,        -- sub-chart: 'singles' | 'albums' | 'songs' | 'hot100' | 'global200' | 'tiktok50' | 'viral50' ...
  title        text not null,        -- display: "AGATA Singlų TOP 100"
  subtitle     text,                 -- "Oficialus LT klausymo platformų topas"
  country      text,                 -- ISO ('LT','GB','US') arba NULL = global
  scope        text not null default 'lt'  check (scope in ('lt','world','social')),
  size         int  not null default 100,  -- 40 / 50 / 100 / 200
  accent       text not null default '#6366f1',
  source_url   text,                 -- canonical šaltinio nuoroda (attribution)
  attribution  text,                 -- "Šaltinis: AGATA"

  period_label text not null,        -- "2026 6 sav." | "2026-05-31" — unikalumui
  period_start date,
  period_end   date,
  fetched_at   timestamptz not null default now(),
  is_current   boolean not null default true,

  created_at   timestamptz not null default now(),
  unique (source, chart_key, period_label)
);

create table if not exists external_chart_entries (
  id            bigserial primary key,
  chart_id      bigint not null references external_charts(id) on delete cascade,
  position      int  not null,
  prev_position int,                 -- NULL = naujas / re-entry
  weeks_on_chart int,
  is_new        boolean not null default false,

  -- RAW iš šaltinio (visada užpildyta)
  artist_name   text not null,
  title         text not null,
  cover_url     text,                -- source artwork (Apple) arba matched track cover
  youtube_url   text,

  -- RESOLVED į mūsų katalogą (nullable — light/hybrid match)
  track_id      bigint references tracks(id)  on delete set null,
  artist_id     bigint references artists(id) on delete set null,
  resolve_state text not null default 'pending'
                check (resolve_state in ('pending','matched','created','text_only','ambiguous')),

  unique (chart_id, position)
);

create index if not exists idx_ext_charts_current
  on external_charts (source, chart_key) where is_current;
create index if not exists idx_ext_charts_scope
  on external_charts (scope, is_current);
create index if not exists idx_ext_entries_chart
  on external_chart_entries (chart_id, position);
create index if not exists idx_ext_entries_resolve
  on external_chart_entries (resolve_state) where resolve_state in ('pending','ambiguous');

-- Tik VIENAS is_current=true edition per (source, chart_key).
-- Ingestion pipeline naują edition'ą įrašo su is_current=true, o seną
-- po to atžymi šiuo trigger'iu (archyvas lieka is_current=false).
create or replace function _ext_chart_single_current()
returns trigger language plpgsql as $$
begin
  if new.is_current then
    update external_charts
       set is_current = false
     where source = new.source
       and chart_key = new.chart_key
       and id <> new.id
       and is_current;
  end if;
  return new;
end $$;

drop trigger if exists trg_ext_chart_single_current on external_charts;
create trigger trg_ext_chart_single_current
  after insert or update of is_current on external_charts
  for each row when (new.is_current)
  execute function _ext_chart_single_current();

-- RLS: public read (charts yra vieši), write tik service role.
alter table external_charts        enable row level security;
alter table external_chart_entries enable row level security;

drop policy if exists ext_charts_read on external_charts;
create policy ext_charts_read on external_charts
  for select using (true);

drop policy if exists ext_entries_read on external_chart_entries;
create policy ext_entries_read on external_chart_entries
  for select using (true);
