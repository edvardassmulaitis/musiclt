-- Shoutbox messages
CREATE TABLE IF NOT EXISTS shoutbox_messages (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  author_avatar text,
  body text NOT NULL CHECK (char_length(body) <= 255),
  is_deleted boolean DEFAULT false,
  deleted_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- Shoutbox mutes
CREATE TABLE IF NOT EXISTS shoutbox_mutes (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  muted_by uuid REFERENCES profiles(id),
  muted_until timestamptz NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Activity events
CREATE TABLE IF NOT EXISTS activity_events (
  id bigserial PRIMARY KEY,
  event_type text NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  actor_name text NOT NULL,
  actor_avatar text,
  entity_type text,
  entity_id bigint,
  entity_title text,
  entity_url text,
  metadata jsonb DEFAULT '{}',
  is_public boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE shoutbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE shoutbox_mutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visi skaito shoutbox" ON shoutbox_messages FOR SELECT USING (true);
CREATE POLICY "auth raso shoutbox" ON shoutbox_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admin trino shoutbox" ON shoutbox_messages FOR UPDATE USING (true);

CREATE POLICY "visi skaito mutes" ON shoutbox_mutes FOR SELECT USING (true);
CREATE POLICY "admin valdo mutes" ON shoutbox_mutes FOR ALL USING (true);

CREATE POLICY "visi skaito activity" ON activity_events FOR SELECT USING (is_public = true);
CREATE POLICY "system raso activity" ON activity_events FOR INSERT WITH CHECK (true);

-- Indeksai
CREATE INDEX IF NOT EXISTS idx_shoutbox_created ON shoutbox_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_events(event_type);
