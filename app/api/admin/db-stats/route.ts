// app/api/admin/db-stats/route.ts
//
// DB monitoring endpoint. Wraps three SECURITY DEFINER RPCs:
//   - db_size_overview()  — total DB + top tables
//   - db_dead_indexes()   — unused indexes (idx_scan=0)
//   - db_table_bloat()    — bloat % per table
//
// Migracija: supabase/migrations/20260529_db_monitoring_rpc.sql
// Apsauga: tik admin session (next-auth role='admin').

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!role || !['admin', 'super_admin'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sb = createAdminClient()

  // Visi RPC parallel — kiekvienas grąžina pilną set'ą, suma maža (<5 KB).
  const [overviewRes, deadIdxRes, bloatRes] = await Promise.all([
    sb.rpc('db_size_overview'),
    sb.rpc('db_dead_indexes'),
    sb.rpc('db_table_bloat'),
  ])

  // Jei RPC neegzistuoja — gražus error pranešimas (migracija dar neaplikuota).
  if (overviewRes.error?.message?.includes('does not exist') ||
      overviewRes.error?.message?.includes('not found in the schema cache')) {
    return NextResponse.json({
      error: 'db_size_overview RPC neaplikuota',
      hint: 'Apply migration: supabase/migrations/20260529_db_monitoring_rpc.sql',
    }, { status: 503 })
  }

  const overview = (overviewRes.data || []) as Array<{
    scope: string
    name: string
    bytes: number
    pretty: string
    row_estimate: number | null
  }>

  const databaseTotal = overview.find(r => r.scope === 'database')
  const tables = overview.filter(r => r.scope === 'table')

  // Free plan limit'as 500 MB, Pro 8 GB. Skaičiuojam % nuo Pro limit'o
  // (nes esam Pro plan'e). Free % atskirai info'ui — kad žinotume ar
  // teoriniai downgrad'o galimi.
  const totalBytes = databaseTotal?.bytes ?? 0
  const PRO_LIMIT_BYTES = 8 * 1024 * 1024 * 1024   // 8 GB
  const FREE_LIMIT_BYTES = 500 * 1024 * 1024       // 500 MB

  return NextResponse.json({
    measured_at: new Date().toISOString(),
    database: {
      name: databaseTotal?.name ?? 'unknown',
      bytes: totalBytes,
      pretty: databaseTotal?.pretty ?? '?',
      pct_of_pro: Math.round((totalBytes / PRO_LIMIT_BYTES) * 10000) / 100,
      pct_of_free: Math.round((totalBytes / FREE_LIMIT_BYTES) * 10000) / 100,
    },
    top_tables: tables.slice(0, 20),
    dead_indexes: deadIdxRes.data || [],
    bloat: bloatRes.data || [],
  })
}
