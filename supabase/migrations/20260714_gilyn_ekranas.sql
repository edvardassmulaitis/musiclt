-- Gilyn v3 — pasaulis „Ekranas" ir albumų lygio narystė
--
-- Problema: filmų muzika žmones domina (pseudo-atlikėjas „Garso takeliai" turi
-- 62 like'us), bet ji dažnai yra VARIOUS ARTISTS — rinkinys, o ne atlikėjas.
-- Teritorija, kurios gyventojai yra atlikėjai, tokiai muzikai netinka.
--
-- Sprendimas: ekrano muzika gauna savo pasaulį, o garso takelių rinkinių
-- teritorija apgyvendinama ALBUMAIS, ne atlikėjais. Kompozitoriai (Zimmer,
-- Morricone, Sakamoto) lieka atlikėjų teritorijose — jie yra atlikėjai.

-- ── Albumas × teritorija ─────────────────────────────────────────────────
-- Naudojama ten, kur teritoriją apibrėžia albumas, ne atlikėjas (garso takelių
-- rinkiniai, kompiliacijos). Taip pat leidžia rankiniu būdu pritvirtinti
-- konkretų albumą prie teritorijos, kai atlikėjo era nepataiko.
create table if not exists gilyn_album_terr (
  album_id  bigint not null references albums(id) on delete cascade,
  terr_id   text   not null references gilyn_terr(id) on delete cascade,
  source    text   not null default 'auto' check (source in ('auto','rankinis')),
  primary key (album_id, terr_id)
);
create index if not exists gilyn_album_terr_terr_idx on gilyn_album_terr(terr_id);

alter table gilyn_album_terr enable row level security;
drop policy if exists gilyn_album_terr_read on gilyn_album_terr;
create policy gilyn_album_terr_read on gilyn_album_terr for select using (true);

-- ── Teritorijos statistika: skaičiuojam ir albumus ───────────────────────
create or replace function gilyn_refresh_terr_stats()
returns void language sql as $$
  update gilyn_terr t set
    n_artists = coalesce((select count(*) from gilyn_artist_terr a where a.terr_id = t.id), 0)
              + coalesce((select count(*) from gilyn_album_terr b where b.terr_id = t.id), 0),
    n_known   = coalesce((select count(*) from gilyn_artist_terr a
                            join artist_fame f on f.artist_id = a.artist_id
                           where a.terr_id = t.id and f.fame >= 3), 0)
              -- albumais apgyvendintoje teritorijoje „žinomumas" = albumų kiekis:
              -- garso takelių rinkinį atpažįsti iš filmo, ne iš atlikėjo vardo
              + coalesce((select count(*) from gilyn_album_terr b where b.terr_id = t.id), 0),
    n_missing = coalesce((select count(*) from gilyn_missing m
                           where m.terr_id = t.id and m.status = 'pending' and m.fame >= 3), 0);
$$;
