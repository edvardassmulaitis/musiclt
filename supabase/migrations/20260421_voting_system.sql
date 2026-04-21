-- ============================================================================
-- Voting / Elections System
-- ============================================================================
-- Hierarchy:
--   voting_channels  (pvz. "Eurovizija", "MAMA apdovanojimai")
--     └── voting_editions (per metus: "Eurovizija 2026", "MAMA 2025")
--           └── voting_events (atskiri rinkimai: "Metų daina", "Publikos balsas")
--                 └── voting_participants (dalyviai — link į artists/tracks/albums)
--                       └── voting_votes (balsai)
--
-- Voting types per event: 'single' (1 balsas), 'top_n' (išrinkti TOP N), 'rating' (1-10)
-- ============================================================================

-- Kanalai
CREATE TABLE IF NOT EXISTS voting_channels (
  id           SERIAL PRIMARY KEY,
  slug         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  logo_url     TEXT,
  cover_image_url TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voting_channels_active ON voting_channels (is_active, sort_order);

-- Leidimai
CREATE TABLE IF NOT EXISTS voting_editions (
  id               SERIAL PRIMARY KEY,
  channel_id       INTEGER NOT NULL REFERENCES voting_channels(id) ON DELETE CASCADE,
  slug             TEXT NOT NULL,
  name             TEXT NOT NULL,
  year             INTEGER,
  description      TEXT,
  cover_image_url  TEXT,
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','voting_open','voting_closed','archived')),
  vote_open        TIMESTAMPTZ,
  vote_close       TIMESTAMPTZ,
  results_visible  TEXT NOT NULL DEFAULT 'always'
                     CHECK (results_visible IN ('always','after_close','never')),
  sort_order       INTEGER NOT NULL DEFAULT 0,
  metadata         JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (channel_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_voting_editions_channel ON voting_editions (channel_id, year DESC);
CREATE INDEX IF NOT EXISTS idx_voting_editions_status ON voting_editions (status);

-- Events (atskiri rinkimai viduje leidimo)
CREATE TABLE IF NOT EXISTS voting_events (
  id                SERIAL PRIMARY KEY,
  edition_id        INTEGER NOT NULL REFERENCES voting_editions(id) ON DELETE CASCADE,
  slug              TEXT NOT NULL,
  name              TEXT NOT NULL,
  description       TEXT,
  participant_type  TEXT NOT NULL DEFAULT 'artist_song'
                      CHECK (participant_type IN ('artist','artist_song','artist_album')),
  voting_type       TEXT NOT NULL DEFAULT 'single'
                      CHECK (voting_type IN ('single','top_n','rating')),
  voting_top_n      INTEGER,                   -- tik jei top_n
  rating_max        INTEGER NOT NULL DEFAULT 10,
  requires_login    BOOLEAN NOT NULL DEFAULT false,
  anon_vote_limit   INTEGER NOT NULL DEFAULT 1,
  user_vote_limit   INTEGER NOT NULL DEFAULT 1,
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','voting_open','voting_closed','archived')),
  vote_open         TIMESTAMPTZ,
  vote_close        TIMESTAMPTZ,
  results_visible   TEXT NOT NULL DEFAULT 'always'
                      CHECK (results_visible IN ('always','after_close','never')),
  sort_order        INTEGER NOT NULL DEFAULT 0,
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (edition_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_voting_events_edition ON voting_events (edition_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_voting_events_status ON voting_events (status);

-- Dalyviai
CREATE TABLE IF NOT EXISTS voting_participants (
  id               SERIAL PRIMARY KEY,
  event_id         INTEGER NOT NULL REFERENCES voting_events(id) ON DELETE CASCADE,
  artist_id        INTEGER REFERENCES artists(id) ON DELETE SET NULL,
  track_id         INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
  album_id         INTEGER REFERENCES albums(id) ON DELETE SET NULL,
  -- Override laukai (jei neužtenka paveldėtų iš artist/track/album)
  display_name     TEXT,         -- pvz. "Lietuva — The Roop"
  display_subtitle TEXT,         -- pvz. dainos pavadinimas
  country          TEXT,         -- ISO kodas arba laisva forma
  photo_url        TEXT,
  video_url        TEXT,
  lyrics           TEXT,
  bio              TEXT,
  metadata         JSONB,        -- per-event custom laukai: songwriter, composer, flag, starting_order
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_disqualified  BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voting_participants_event ON voting_participants (event_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_voting_participants_artist ON voting_participants (artist_id);
CREATE INDEX IF NOT EXISTS idx_voting_participants_track ON voting_participants (track_id);
CREATE INDEX IF NOT EXISTS idx_voting_participants_album ON voting_participants (album_id);

-- Balsai
CREATE TABLE IF NOT EXISTS voting_votes (
  id                BIGSERIAL PRIMARY KEY,
  event_id          INTEGER NOT NULL REFERENCES voting_events(id) ON DELETE CASCADE,
  participant_id    INTEGER NOT NULL REFERENCES voting_participants(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES profiles(id) ON DELETE SET NULL,
  voter_ip          TEXT,
  voter_fingerprint TEXT,
  rating            INTEGER,       -- tik rating type
  top_n_position    INTEGER,       -- tik top_n type (1-N, 1 = best)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voting_votes_event ON voting_votes (event_id);
CREATE INDEX IF NOT EXISTS idx_voting_votes_participant ON voting_votes (participant_id);
CREATE INDEX IF NOT EXISTS idx_voting_votes_user ON voting_votes (user_id);
CREATE INDEX IF NOT EXISTS idx_voting_votes_ip ON voting_votes (voter_ip);

-- Vienu metu — vienas balsas už dalyvį (per user/ip)
-- 'single' ir 'rating' tipams — unikalus (event_id, user_id, participant_id) arba (event_id, voter_ip, participant_id)
CREATE UNIQUE INDEX IF NOT EXISTS uq_voting_votes_user_participant
  ON voting_votes (event_id, user_id, participant_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_voting_votes_ip_participant
  ON voting_votes (event_id, voter_ip, participant_id)
  WHERE user_id IS NULL AND voter_ip IS NOT NULL;

-- Agreguoti rezultatai view (realtime — SELECT'ui)
CREATE OR REPLACE VIEW voting_event_results AS
SELECT
  p.id              AS participant_id,
  p.event_id,
  p.sort_order,
  p.display_name,
  p.country,
  p.artist_id,
  p.track_id,
  p.album_id,
  COUNT(v.id)                                                    AS vote_count,
  COALESCE(AVG(v.rating)::numeric(5,2), 0)                       AS avg_rating,
  COALESCE(SUM(
    CASE
      WHEN v.top_n_position IS NOT NULL
      THEN GREATEST(0, 11 - v.top_n_position)  -- #1 = 10 pts, #2 = 9, … #10 = 1
      ELSE 0
    END
  ), 0)                                                          AS top_n_score
FROM voting_participants p
LEFT JOIN voting_votes v ON v.participant_id = p.id
GROUP BY p.id;

-- ============================================================================
-- RLS: public can read channels/editions/events/participants, only admins write
-- ============================================================================
ALTER TABLE voting_channels      ENABLE ROW LEVEL SECURITY;
ALTER TABLE voting_editions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE voting_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE voting_participants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE voting_votes         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS voting_channels_read ON voting_channels;
CREATE POLICY voting_channels_read ON voting_channels FOR SELECT USING (true);

DROP POLICY IF EXISTS voting_editions_read ON voting_editions;
CREATE POLICY voting_editions_read ON voting_editions FOR SELECT USING (true);

DROP POLICY IF EXISTS voting_events_read ON voting_events;
CREATE POLICY voting_events_read ON voting_events FOR SELECT USING (true);

DROP POLICY IF EXISTS voting_participants_read ON voting_participants;
CREATE POLICY voting_participants_read ON voting_participants FOR SELECT USING (true);

-- Votes: nobody reads raw votes from public API (we use view). Service role bypasses RLS.
DROP POLICY IF EXISTS voting_votes_no_public_read ON voting_votes;
CREATE POLICY voting_votes_no_public_read ON voting_votes FOR SELECT USING (false);

-- updated_at triggeriai
CREATE OR REPLACE FUNCTION voting_set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_voting_channels_updated      ON voting_channels;
DROP TRIGGER IF EXISTS trg_voting_editions_updated      ON voting_editions;
DROP TRIGGER IF EXISTS trg_voting_events_updated        ON voting_events;
DROP TRIGGER IF EXISTS trg_voting_participants_updated  ON voting_participants;

CREATE TRIGGER trg_voting_channels_updated     BEFORE UPDATE ON voting_channels     FOR EACH ROW EXECUTE FUNCTION voting_set_updated_at();
CREATE TRIGGER trg_voting_editions_updated     BEFORE UPDATE ON voting_editions     FOR EACH ROW EXECUTE FUNCTION voting_set_updated_at();
CREATE TRIGGER trg_voting_events_updated       BEFORE UPDATE ON voting_events       FOR EACH ROW EXECUTE FUNCTION voting_set_updated_at();
CREATE TRIGGER trg_voting_participants_updated BEFORE UPDATE ON voting_participants FOR EACH ROW EXECUTE FUNCTION voting_set_updated_at();
