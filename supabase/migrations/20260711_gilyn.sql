-- Gilyn — dienos dėžės muzikos atradimo žaidimas (/zaidimai/gilyn)
--
-- Koncepcija: visi gauna tą pačią 20 albumų dienos dėžę, laiko VIENĄ vinilą,
-- dėžės gale jis tampa durimis į 3 kasimosi žingsnius (3 durys kiekviename),
-- kelias atidengia asmeninį muzikos žemėlapį (žanrai → substiliai, fog-of-war,
-- like'ai = švyturiai).

-- ── Dienos dėžė (snapshot, visiems vienoda) ──────────────────────────────
create table if not exists gilyn_days (
  day date primary key,
  albums jsonb not null,            -- [20 x {albumId, artistId, title, artist, artistSlug, albumSlug, year, cover, ytId, genreIds, substyleIds, country, tier}]
  created_at timestamptz not null default now()
);

-- ── Vartotojo dienos run'as ──────────────────────────────────────────────
create table if not exists gilyn_runs (
  id bigserial primary key,
  day date not null references gilyn_days(day) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  anon_id uuid,
  status text not null default 'box' check (status in ('box','dig','done')),
  box_pos int not null default 0,          -- kiek kortelių jau atversta
  held jsonb,                              -- laikomas vinilas {albumId, artistId, ...}
  swaps int not null default 0,
  shelf jsonb not null default '[]'::jsonb,   -- „į lentyną" [{albumId,...}]
  history jsonb not null default '[]'::jsonb, -- [{pos, action, albumId}] undo + statistikai
  heard jsonb not null default '[]'::jsonb,   -- albumIds, kurių preview paleistas
  doors jsonb,                             -- serverio sugeneruotos aktyvios durys [{doorType, artistId, albumId, reason, ...}]
  path jsonb not null default '[]'::jsonb, -- [{step, doorType, artistId, artist, albumId, title, cover, reason}]
  dig_step int not null default 0,         -- 0..3
  final_pick jsonb,                        -- vartotojo pasirinktas dienos radinys (bet kuris kelio taškas)
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index if not exists gilyn_runs_day_user_uq on gilyn_runs(day, user_id) where user_id is not null;
create unique index if not exists gilyn_runs_day_anon_uq on gilyn_runs(day, anon_id) where anon_id is not null;
create index if not exists gilyn_runs_day_idx on gilyn_runs(day, status);

-- ── Asmeninis žemėlapis: aplankyti/išgirsti/išsaugoti mazgai ─────────────
-- Viena eilutė per viewer+artist. Būsenos NE pakeičia viena kitos — flag'ai.
create table if not exists gilyn_map_nodes (
  id bigserial primary key,
  user_id uuid references profiles(id) on delete cascade,
  anon_id uuid,
  artist_id bigint not null,
  visited boolean not null default false,  -- pasirinktas kaip kelio dalis
  heard boolean not null default false,    -- paleistas preview
  saved boolean not null default false,    -- sąmoningai išsaugotas radinys
  via text,                                -- durų tipas, kuriuo pirmą kartą pasiektas
  substyle_ids bigint[] not null default '{}',
  genre_ids bigint[] not null default '{}',
  first_day date,
  updated_at timestamptz not null default now()
);
create unique index if not exists gilyn_map_user_artist_uq on gilyn_map_nodes(user_id, artist_id) where user_id is not null;
create unique index if not exists gilyn_map_anon_artist_uq on gilyn_map_nodes(anon_id, artist_id) where anon_id is not null;

-- ── Co-like tiltai (auditorijos ryšys durims C) ──────────────────────────
create or replace function gilyn_colike_artists(p_artist bigint, p_limit int default 14)
returns table(artist_id bigint, cnt bigint)
language sql stable
set statement_timeout = '8s'
as $$
  with fans as (
    select user_username from likes
    where entity_type = 'artist' and entity_id = p_artist and user_username is not null
    limit 400
  )
  select l.entity_id as artist_id, count(*) as cnt
  from likes l
  join fans f on f.user_username = l.user_username
  where l.entity_type = 'artist' and l.entity_id <> p_artist
  group by 1
  order by 2 desc
  limit p_limit;
$$;

-- ── game_scores CHECK praplėtimas ────────────────────────────────────────
-- (DB jau turėjo koncertas/gaudykle įrašų be CHECK atnaujinimo — sąrašas pilnas)
alter table game_scores drop constraint if exists game_scores_game_check;
alter table game_scores add constraint game_scores_game_check
  check (game in ('dvikovos','gaudykle','gilyn','koncertas','kvizas','metai','sekundes','vadybininkas','vaizdas'));

-- ── RLS (kaip kitų žaidimų: skaitymas viešas, rašymas tik service-role) ──
alter table gilyn_days enable row level security;
alter table gilyn_runs enable row level security;
alter table gilyn_map_nodes enable row level security;
drop policy if exists gilyn_days_read on gilyn_days;
create policy gilyn_days_read on gilyn_days for select using (true);
drop policy if exists gilyn_runs_read on gilyn_runs;
create policy gilyn_runs_read on gilyn_runs for select using (true);
drop policy if exists gilyn_map_read on gilyn_map_nodes;
create policy gilyn_map_read on gilyn_map_nodes for select using (true);
