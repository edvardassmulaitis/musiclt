-- Wiki Discography Import iterative cleanup support (2026-05-15).
--
-- Admin'ui reikalinga galimybė:
--   1. Pažymėti DB album'ą kaip 'reviewed/cleared' — kad future Wiki importai
--      jo nerodytų kaip needing-attention. Pvz Queen 1973 — admin patvirtina,
--      kad current state OK, nereikia papildomai tvarkyti.
--   2. Ignor'inti Wiki suggestion'ą, kuris dar nepatekęs į DB — pvz Wiki sako
--      "Pre Ordained 1971", bet admin nusprendžia, kad tai junk demo, nereikia.
--      Future importai praleidžia šį Wiki title'ą.

-- 1. albums.wiki_review_status — soft "I dealt with this" flag
ALTER TABLE albums
  ADD COLUMN IF NOT EXISTS wiki_review_status TEXT;
-- Valid values: NULL (default — needs review), 'cleared' (admin patvirtino).
-- Could extend later: 'flagged', 'wrong_data', etc.

-- 2. wiki_ignored_albums — per-artist ignore list for Wiki-only suggestions
CREATE TABLE IF NOT EXISTS wiki_ignored_albums (
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  wiki_title TEXT NOT NULL,
  ignored_by TEXT,  -- admin username (text, ne FK kad išvengtume RLS overhead)
  ignored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT,
  PRIMARY KEY (artist_id, wiki_title)
);

COMMENT ON TABLE wiki_ignored_albums IS
  'Per-artist Wiki album titles to skip in future Discography Import suggestions';
COMMENT ON COLUMN albums.wiki_review_status IS
  'Soft flag — null=needs review, cleared=admin marked OK (excluded from Wiki import nudges)';
