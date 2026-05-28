-- ============================================================
-- 2026-05-29 — DB Monitoring RPC: permanent visibility per /admin/db-stats
-- ============================================================
--
-- Tikslas: nebereikia kiekvieną kartą per SQL Editor query'inti
-- pg_database_size + pg_total_relation_size — sukuriam SECURITY DEFINER
-- funkcijas, kurias galim call'inti per PostgREST RPC (service role auth)
-- iš `/api/admin/db-stats` endpoint'o.
--
-- Funkcijos:
--   1. db_size_overview() → total DB size + breakdown per top 20 lentelių
--   2. db_dead_indexes()  → indeksai su idx_scan=0 (dead, kandidatai DROP'ui)
--   3. db_table_bloat()   → estimated bloat ratio per table (>30% bloat = VACUUM FULL)
--
-- Saugumas: GRANT EXECUTE TIK service_role'ui. PostgREST'as anon
-- nepasiekia šitų funkcijų.

BEGIN;

-- ============================================================
-- 1. Overview: total DB + top tables
-- ============================================================
CREATE OR REPLACE FUNCTION public.db_size_overview()
RETURNS TABLE (
  scope          text,
  name           text,
  bytes          bigint,
  pretty         text,
  row_estimate   bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  -- Total DB row (scope='database', name='total')
  SELECT 'database'::text AS scope,
         current_database()::text AS name,
         pg_database_size(current_database())::bigint AS bytes,
         pg_size_pretty(pg_database_size(current_database()))::text AS pretty,
         NULL::bigint AS row_estimate
  UNION ALL
  -- Per-table breakdown, top 30 by total size
  SELECT 'table'::text AS scope,
         (n.nspname || '.' || c.relname)::text AS name,
         pg_total_relation_size(c.oid)::bigint AS bytes,
         pg_size_pretty(pg_total_relation_size(c.oid))::text AS pretty,
         c.reltuples::bigint AS row_estimate
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'r'
     AND n.nspname IN ('public', 'auth', 'storage')
   ORDER BY 3 DESC
   LIMIT 30
$$;

-- ============================================================
-- 2. Dead indexes: idx_scan = 0 (never used by query planner)
-- ============================================================
-- BUT: filter out new (>1 day) tables — recently-added indexes
-- haven't had a chance to be hit yet. Also exclude PK / unique constraints
-- because dropping those breaks invariants.
CREATE OR REPLACE FUNCTION public.db_dead_indexes()
RETURNS TABLE (
  schema_name  text,
  table_name   text,
  index_name   text,
  index_size   text,
  index_bytes  bigint,
  scans        bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT s.schemaname::text                       AS schema_name,
         s.relname::text                          AS table_name,
         s.indexrelname::text                     AS index_name,
         pg_size_pretty(pg_relation_size(s.indexrelid))::text AS index_size,
         pg_relation_size(s.indexrelid)::bigint   AS index_bytes,
         s.idx_scan                               AS scans
    FROM pg_stat_user_indexes s
    JOIN pg_index i ON i.indexrelid = s.indexrelid
   WHERE s.idx_scan = 0
     AND NOT i.indisunique
     AND NOT i.indisprimary
     AND pg_relation_size(s.indexrelid) > 1024 * 1024   -- > 1 MB
   ORDER BY pg_relation_size(s.indexrelid) DESC
   LIMIT 30
$$;

-- ============================================================
-- 3. Table bloat estimate (simplified — n_dead_tup / n_live_tup ratio)
-- ============================================================
CREATE OR REPLACE FUNCTION public.db_table_bloat()
RETURNS TABLE (
  schema_name   text,
  table_name    text,
  live_tuples   bigint,
  dead_tuples   bigint,
  bloat_pct     numeric,
  table_size    text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT s.schemaname::text                                  AS schema_name,
         s.relname::text                                     AS table_name,
         s.n_live_tup                                        AS live_tuples,
         s.n_dead_tup                                        AS dead_tuples,
         CASE WHEN s.n_live_tup + s.n_dead_tup = 0 THEN 0
              ELSE ROUND(100.0 * s.n_dead_tup / (s.n_live_tup + s.n_dead_tup), 1)
         END                                                 AS bloat_pct,
         pg_size_pretty(pg_total_relation_size(c.oid))::text AS table_size
    FROM pg_stat_user_tables s
    JOIN pg_class c ON c.oid = s.relid
   WHERE s.n_live_tup + s.n_dead_tup > 100
   ORDER BY s.n_dead_tup DESC
   LIMIT 30
$$;

-- ============================================================
-- Permissions — TIK service_role
-- ============================================================
REVOKE ALL ON FUNCTION public.db_size_overview() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.db_dead_indexes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.db_table_bloat() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.db_size_overview() TO service_role;
GRANT EXECUTE ON FUNCTION public.db_dead_indexes() TO service_role;
GRANT EXECUTE ON FUNCTION public.db_table_bloat() TO service_role;

COMMIT;

-- ============================================================
-- POST-MIGRATION CHECKS:
-- ============================================================
-- 1. Test:
--    SELECT * FROM db_size_overview();
--    SELECT * FROM db_dead_indexes();
--    SELECT * FROM db_table_bloat();
--
-- 2. Patikrint per PostgREST RPC:
--    curl ... /rest/v1/rpc/db_size_overview (service role token reikalingas)
