-- 20260615b_atlikejo_studija.sql
-- Atlikėjo studija (Music.lt for Artists) — F0 MVP pamatas.
-- Visa additive; nieko netrina. artist_id = integer (artists.id tipas).

-- ── Nuosavybės ryšys: profile ↔ artist ──────────────────────────────────
-- PASTABA: artist_members JAU egzistuoja (grupės sudėtis: group_id/member_id),
-- tad studijos komandai naudojam artist_team.
create table if not exists artist_team (
  id          uuid primary key default gen_random_uuid(),
  artist_id   integer not null references artists(id) on delete cascade,
  profile_id  uuid    not null references profiles(id) on delete cascade,
  role        text    not null default 'owner',   -- owner | manager
  status      text    not null default 'active',  -- active | revoked
  created_at  timestamptz not null default now(),
  unique (artist_id, profile_id)
);
create index if not exists idx_artist_team_profile on artist_team(profile_id);
create index if not exists idx_artist_team_artist  on artist_team(artist_id);

-- ── Claim / verifikacijos eilė ──────────────────────────────────────────
create table if not exists artist_claims (
  id          uuid primary key default gen_random_uuid(),
  artist_id   integer not null references artists(id) on delete cascade,
  profile_id  uuid    not null references profiles(id) on delete cascade,
  method      text    not null default 'manual',  -- social | email | manual
  proof_url   text,
  message     text,
  status      text    not null default 'pending', -- pending | approved | rejected
  reviewed_by uuid    references profiles(id),
  review_note text,
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists idx_artist_claims_status on artist_claims(status);
create unique index if not exists uniq_artist_claims_pending
  on artist_claims(artist_id, profile_id) where status = 'pending';

-- ── Denorm vėliava greitaveikai (claimed = turi aktyvų member) ───────────
alter table artists add column if not exists is_claimed boolean not null default false;

-- ── Fanų bazė: artist_follows JAU egzistuoja (user_id, artist_id) ────────
-- Praplečiam sutikimais (GDPR: sekti ≠ gauti laiškus) + miestu segmentavimui.
alter table artist_follows add column if not exists email_consent boolean not null default false;
alter table artist_follows add column if not exists push_consent  boolean not null default true;
alter table artist_follows add column if not exists city          text;

-- ── Atlikėjo žinios fanams (push/feed/email šaltinis) ────────────────────
create table if not exists artist_updates (
  id          uuid primary key default gen_random_uuid(),
  artist_id   integer not null references artists(id) on delete cascade,
  kind        text    not null default 'message', -- release | concert | message | milestone
  title       text    not null,
  body        text,
  entity_type text,
  entity_id   bigint,
  channels    text[]  not null default '{push,feed}',
  sent_at     timestamptz,
  recipients  integer not null default 0,
  created_by  uuid    references profiles(id),
  created_at  timestamptz not null default now()
);
create index if not exists idx_artist_updates_artist on artist_updates(artist_id, created_at desc);

-- ── Soc. postų embed (F0 rankinis; OAuth auto-traukimas vėliau) ──────────
create table if not exists artist_social_embeds (
  id          uuid primary key default gen_random_uuid(),
  artist_id   integer not null references artists(id) on delete cascade,
  platform    text    not null,        -- instagram | facebook | youtube | tiktok | x
  url         text    not null,
  embed_html  text,
  caption     text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  source      text    not null default 'manual',  -- manual | oauth
  created_at  timestamptz not null default now()
);
create index if not exists idx_artist_embeds_artist on artist_social_embeds(artist_id, sort_order);
