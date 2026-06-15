-- 20260615c_social_connections.sql
-- Socialinių tinklų auto-feed pamatas (YouTube pirmas; Spotify/IG/FB vėliau).
-- Žr. SOCIAL_AUTOFEED_PLAN.md.

create table if not exists artist_social_connections (
  id            uuid primary key default gen_random_uuid(),
  artist_id     integer not null references artists(id) on delete cascade,
  platform      text not null,                 -- youtube | spotify | instagram | facebook
  mode          text not null default 'auto',  -- auto | manual
  external_id   text,                          -- channelId / spotify artist id / ig_user_id / page_id
  access_token  text,
  refresh_token text,
  token_expires_at timestamptz,
  username      text,
  status        text not null default 'active', -- active | needs_reauth | revoked
  last_synced_at timestamptz,
  last_error    text,
  connected_by  uuid references profiles(id),
  created_at    timestamptz not null default now(),
  unique (artist_id, platform)
);
create index if not exists idx_social_conn_artist on artist_social_connections(artist_id);
create index if not exists idx_social_conn_status on artist_social_connections(status);

create table if not exists artist_social_items (
  id           uuid primary key default gen_random_uuid(),
  artist_id    integer not null references artists(id) on delete cascade,
  platform     text not null,
  external_id  text not null,                  -- videoId / album id / post id
  kind         text,                           -- video | image | carousel | release | track
  url          text,
  media_url    text,
  thumb_url    text,
  caption      text,
  published_at timestamptz,
  raw          jsonb,
  created_at   timestamptz not null default now(),
  unique (platform, external_id)
);
create index if not exists idx_social_items_artist on artist_social_items(artist_id, published_at desc);
create index if not exists idx_social_items_platform on artist_social_items(artist_id, platform, published_at desc);
