-- ============================================================
-- 2026-04-24g — Admin import infrastruktūra (NE destruktyvi)
-- ============================================================
-- Tikslas: paruošti importo UI + Python worker'ių job queue prieš
-- pradedant duomenų valymą / migraciją. Ši migracija JOKIŲ duomenų
-- neištrina ir gali būti applied saugiai bet kada.
--
-- Apima:
--   1. import_jobs lentelė (queue UI ↔ worker)
--   2. v_artist_import_status view (status'as per atlikėją)
--
-- Galima testuoti UI (/admin/import) iš karto po apply — net jei
-- artists lentelėje tik admin-sukurti įrašai (legacy_id NULL),
-- view'as juos parodys (be wiki/scrape statusų).

BEGIN;

-- ── 1. Job queue lentelė ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.import_jobs (
    id BIGSERIAL PRIMARY KEY,
    artist_legacy_id INTEGER NOT NULL,
    job_type TEXT NOT NULL CHECK (job_type IN ('wiki', 'scrape', 'populate')),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),

    claimed_by TEXT,
    claimed_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    report JSONB,
    error_message TEXT,
    error_trace TEXT,

    requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    priority INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_status_active
    ON public.import_jobs (status, priority DESC, requested_at)
    WHERE status IN ('pending', 'running');

CREATE INDEX IF NOT EXISTS idx_import_jobs_artist
    ON public.import_jobs (artist_legacy_id, job_type, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_jobs_type_status
    ON public.import_jobs (job_type, status);

COMMENT ON TABLE public.import_jobs IS
  'Migration job queue. Admin UI inserts pending; Python worker (run_worker.sh) polls and executes.';

-- RLS — tik admin/super_admin (service role apeina RLS)
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin read" ON public.import_jobs;
CREATE POLICY "admin read" ON public.import_jobs FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('admin', 'super_admin'))
);

DROP POLICY IF EXISTS "admin write" ON public.import_jobs;
CREATE POLICY "admin write" ON public.import_jobs FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('admin', 'super_admin'))
);

-- ── 2. View: per-artist import status ────────────────────────────
CREATE OR REPLACE VIEW public.v_artist_import_status AS
SELECT
  a.id,
  a.legacy_id,
  a.slug,
  a.name,
  a.cover_image_url,
  a.score,

  (SELECT j.completed_at FROM public.import_jobs j
   WHERE j.artist_legacy_id = a.legacy_id AND j.job_type='wiki' AND j.status='completed'
   ORDER BY j.completed_at DESC LIMIT 1) AS wiki_completed_at,
  (SELECT j.status FROM public.import_jobs j
   WHERE j.artist_legacy_id = a.legacy_id AND j.job_type='wiki'
   ORDER BY j.requested_at DESC LIMIT 1) AS wiki_last_status,

  (SELECT j.completed_at FROM public.import_jobs j
   WHERE j.artist_legacy_id = a.legacy_id AND j.job_type='scrape' AND j.status='completed'
   ORDER BY j.completed_at DESC LIMIT 1) AS scrape_completed_at,
  (SELECT j.status FROM public.import_jobs j
   WHERE j.artist_legacy_id = a.legacy_id AND j.job_type='scrape'
   ORDER BY j.requested_at DESC LIMIT 1) AS scrape_last_status,

  (SELECT COUNT(*) FROM public.import_jobs j
   WHERE j.artist_legacy_id = a.legacy_id
     AND j.status IN ('pending','running')) AS active_jobs,

  (SELECT COUNT(*) FROM public.albums al WHERE al.artist_id = a.id) AS album_count,
  (SELECT COUNT(*) FROM public.tracks t WHERE t.artist_id = a.id) AS track_count

FROM public.artists a;

COMMENT ON VIEW public.v_artist_import_status IS
  'Per-artist import progress — wiki/scrape statusai + albums/tracks counts. Naudojamas /admin/import puslapyje.';

COMMIT;
