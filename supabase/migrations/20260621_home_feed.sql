-- 20260621_home_feed.sql
-- Homepage reader feed override'ai (paslėpti/prisegti/eiliškumas pagal item_key)
-- + admin pridėti laisvi įrašai (kind='custom'). Valdoma per /admin/feed.
create table if not exists public.home_feed (
  id bigserial primary key,
  kind text not null default 'override' check (kind in ('override','custom')),
  item_key text,
  hidden boolean not null default false,
  pinned boolean not null default false,
  sort_order integer,
  title text, subtitle text, image_url text, href text, chip text, chip_bg text, video_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists home_feed_item_key_uidx on public.home_feed(item_key) where item_key is not null;
create index if not exists home_feed_kind_idx on public.home_feed(kind);
