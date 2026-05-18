-- Role translations (Sritys) — admin can add LT labels for canonical Wiki
-- values (English) like "singer" -> "dainininkas", "guitar" -> "gitara",
-- and hide irrelevant values from public display.
--
-- canonical is stored lowercase for case-insensitive matching against the
-- text[] values in artists.roles. UI renders the LT label if present,
-- otherwise falls back to the canonical form.

CREATE TABLE IF NOT EXISTS role_translations (
  canonical TEXT PRIMARY KEY,
  lt TEXT,
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE role_translations IS
  'LT translations + hide flags for canonical Wiki role/occupation values (artists.roles array elements).';
COMMENT ON COLUMN role_translations.canonical IS
  'Lowercased canonical form of the role (e.g. singer, guitar, record producer). Primary key for fast lookup.';
COMMENT ON COLUMN role_translations.lt IS
  'Lithuanian display label. NULL means no translation yet (canonical shown verbatim).';
COMMENT ON COLUMN role_translations.hidden IS
  'When TRUE, public artist profile skips this role even if present in artists.roles.';
