-- 20260615d_studio_dashboard.sql
-- Atlikėjo studijos dashboard redizainas: išvaizdos nustatymai + prisegtos dainos.

-- Viešos anketos customizacija (taikoma vėliau viešame profilyje)
alter table artists add column if not exists profile_theme   text not null default 'dark';   -- dark | light
alter table artists add column if not exists accent_color    text;                            -- hex, null = default oranžinė
alter table artists add column if not exists hidden_sections text[] not null default '{}';    -- pvz {similar}

-- Prisegtos (pinned) dainos — rodomos viršuje atlikėjo playeryje
alter table tracks  add column if not exists is_pinned       boolean not null default false;
alter table tracks  add column if not exists pinned_at       timestamptz;
create index if not exists idx_tracks_pinned on tracks(artist_id) where is_pinned;
