-- ============================================================
-- 2026-04-30b — Forum import jobs (papildo import_jobs queue)
-- ============================================================
-- Tikslas: leisti import_jobs lentelei priimti forum thread'ų darbus
-- (forum_discover surenka legacy_id'us iš music.lt index'ų;
--  forum_thread paleidžia thread_content_scrape vienam thread'ui).
--
-- Pakeitimai:
--   1. job_type CHECK pridėti 'forum_thread' ir 'forum_discover'
--   2. artist_legacy_id NULL OK (forum jobs dirba ne per artist'ą)
--   3. target_kind + target_id — generic'iniai laukai. artist jobs paliekam
--      kaip yra (artist_legacy_id užpildytas, target_kind/id tušti); forum
--      jobs naudoja target_id=thread_legacy_id, target_kind='forum_thread'.
--   4. Status'ų view forum daliai: v_forum_import_status (pagal forum_threads
--      + naujausias job per thread).
--
-- Existing artist queue rows nepaliesti; nauja forum kelia atskira.
-- Idempotent — IF NOT EXISTS / DROP+CREATE.

BEGIN;

-- 1. CHECK constraint update — drop + recreate (PostgreSQL nesileidžia ALTER CHECK in place)
ALTER TABLE public.import_jobs
  DROP CONSTRAINT IF EXISTS import_jobs_job_type_check;

ALTER TABLE public.import_jobs
  ADD CONSTRAINT import_jobs_job_type_check
    CHECK (job_type IN ('wiki', 'scrape', 'populate', 'forum_thread', 'forum_discover'));

-- 2. artist_legacy_id NULLable (forum jobs neturi artist'o)
ALTER TABLE public.import_jobs
  ALTER COLUMN artist_legacy_id DROP NOT NULL;

-- 3. target_id + target_kind — generic'iniai laukai forum + ateities entity'oms.
ALTER TABLE public.import_jobs
  ADD COLUMN IF NOT EXISTS target_kind TEXT,
  ADD COLUMN IF NOT EXISTS target_id   BIGINT;

-- target_kind values: 'artist' | 'forum_thread' (ir reikia ateities ir kitiems)
-- Backfill — esamiems artist jobs target_kind='artist', target_id=artist_legacy_id
UPDATE public.import_jobs
   SET target_kind = 'artist',
       target_id   = artist_legacy_id
 WHERE target_kind IS NULL AND artist_legacy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_import_jobs_target
  ON public.import_jobs (target_kind, target_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_jobs_forum_status
  ON public.import_jobs (job_type, status, target_id)
  WHERE job_type IN ('forum_thread', 'forum_discover');

-- 4. View per-thread import status'ui (panaši logika į v_artist_import_status)
DROP VIEW IF EXISTS public.v_forum_thread_import_status;
CREATE VIEW public.v_forum_thread_import_status AS
SELECT
  ft.legacy_id,
  ft.slug,
  ft.title,
  ft.kind,
  ft.post_count,
  ft.pagination_count,
  ft.last_post_at,

  -- naujausias forum_thread job
  (SELECT j.status FROM public.import_jobs j
    WHERE j.job_type = 'forum_thread' AND j.target_id = ft.legacy_id
    ORDER BY j.requested_at DESC LIMIT 1)                  AS last_job_status,
  (SELECT j.completed_at FROM public.import_jobs j
    WHERE j.job_type = 'forum_thread' AND j.target_id = ft.legacy_id
    ORDER BY j.requested_at DESC LIMIT 1)                  AS last_job_completed_at,
  (SELECT j.error_message FROM public.import_jobs j
    WHERE j.job_type = 'forum_thread' AND j.target_id = ft.legacy_id
    ORDER BY j.requested_at DESC LIMIT 1)                  AS last_job_error,

  -- ar yra aktyvus job (pending/running)
  EXISTS (SELECT 1 FROM public.import_jobs j
           WHERE j.job_type = 'forum_thread' AND j.target_id = ft.legacy_id
             AND j.status IN ('pending', 'running'))       AS has_active_job

FROM public.forum_threads ft;

COMMENT ON VIEW public.v_forum_thread_import_status IS
  'Forum thread migration status with the latest forum_thread job per thread.';

COMMIT;
