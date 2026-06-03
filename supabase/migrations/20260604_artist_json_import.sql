-- 20260604_artist_json_import.sql
--
-- Artist JSON import flow (admin'e įklijuojamas GPT JSON → preview → apply).
-- Du nauji storage'ai:
--
--   1) artist_contacts — atlikėjo vadybos / booking / press kontaktai. Edvardas
--      nori rinkti muzikos vadybininkų bazę ir kontaktuoti dėl renginių/info,
--      todėl kontaktai = pirmaeilė nauja lentelė. Linkai (spotify/instagram/...)
--      ir toliau gyvena artists.* stulpeliuose — jų atskiros lentelės nedarom.
--
--   2) artist_imports — kiekvieno apply'o audit log su pilnu source_json
--      (rollback/debug) + summary kas buvo sukurta/atnaujinta.
--
-- API (/api/admin/artist-import) naudoja service-role klientą (createAdminClient),
-- tad RLS policy'ai daugiausia kaip safety net + projekto stiliaus suderinamumas.

-- ── 1) Kontaktai ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.artist_contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id   bigint NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  -- name = kontakto/organizacijos pavadinimas (pvz „Lucky Luke", „Sony Music").
  name        text,
  -- type enum: business|management|booking|press|label|event_organizer|
  --   potential_management|potential_label|potential_booking|general
  type        text NOT NULL DEFAULT 'general',
  email       text,
  phone       text,
  url         text,
  -- confidence: high|medium|low — kiek patikimas signalas (ypač potential_* tipams)
  confidence  text NOT NULL DEFAULT 'medium',
  -- source: 'json_import' | 'manual' | ... — iš kur atsirado įrašas
  source      text NOT NULL DEFAULT 'json_import',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Upsert kontaktams: vienas (artist_id, type, email) įrašas — pakartotinis
-- importas su tuo pačiu emailu atnaujina, o ne dublikuoja. email gali būti NULL
-- (potential lead'ai), tad partial unique tik kai email yra.
CREATE UNIQUE INDEX IF NOT EXISTS uq_artist_contacts_artist_type_email
  ON public.artist_contacts (artist_id, type, lower(email))
  WHERE email IS NOT NULL;

-- Vadybininkų bazės užklausoms (rinkti visus management/booking kontaktus).
CREATE INDEX IF NOT EXISTS idx_artist_contacts_type
  ON public.artist_contacts (type);
CREATE INDEX IF NOT EXISTS idx_artist_contacts_artist
  ON public.artist_contacts (artist_id);

ALTER TABLE public.artist_contacts ENABLE ROW LEVEL SECURITY;

-- Kontaktai NĖRA public (vadybininkų bazė) — jokio public read policy.
-- Skaitymas/rašymas vyksta tik per service-role klientą admin endpoint'uose.

-- ── 2) Import audit log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.artist_imports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Atlikėjas prie kurio pritaikytas importas (gali būti naujai sukurtas).
  artist_id     bigint REFERENCES public.artists(id) ON DELETE SET NULL,
  artist_name   text,
  -- created = ar atlikėjas buvo sukurtas šio importo metu (vs update).
  created       boolean NOT NULL DEFAULT false,
  -- Pilnas įklijuotas JSON — rollback/debug.
  source_json   jsonb NOT NULL,
  -- Apply rezultato santrauka: { albums_created, tracks_created, contacts_added, ... }
  summary       jsonb,
  -- Warnings list, kuris buvo parodytas preview'e.
  warnings      jsonb,
  imported_by   text,            -- admin email/id
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_artist_imports_artist
  ON public.artist_imports (artist_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_artist_imports_created_at
  ON public.artist_imports (created_at DESC);

ALTER TABLE public.artist_imports ENABLE ROW LEVEL SECURITY;
-- Tik service-role (admin) — jokio public policy.
