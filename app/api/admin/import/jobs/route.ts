/**
 * POST /api/admin/import/jobs
 *   body: { legacy_ids: number[], job_type: 'wiki'|'scrape', priority?: number }
 *   → Batch create pending jobs. Deduplicates — jei yra pending/running tam pačiam
 *     (legacy_id, job_type), praleidžia.
 *
 * GET  /api/admin/import/jobs?legacy_id=...&job_type=...&status=...&limit=...
 *   → List jobs with filters.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return null
  }
  return session
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const legacyIds: number[] = (Array.isArray(body.legacy_ids) ? body.legacy_ids : [])
    .map((x: any) => Number(x))
    .filter((x: number) => Number.isInteger(x) && x > 0)
  const jobType: string = String(body.job_type || '')
  const priority: number = Number.isFinite(body.priority) ? Number(body.priority) : 0

  if (!['wiki', 'scrape'].includes(jobType)) {
    return NextResponse.json({ error: 'job_type must be wiki or scrape' }, { status: 400 })
  }
  if (legacyIds.length === 0) {
    return NextResponse.json({ error: 'legacy_ids required' }, { status: 400 })
  }

  // Patikrinam jau egzistuojančius pending/running jobs — nekuriam duplikato
  const { data: existing } = await supabase
    .from('import_jobs')
    .select('artist_legacy_id')
    .eq('job_type', jobType)
    .in('status', ['pending', 'running'])
    .in('artist_legacy_id', legacyIds)

  const existingSet = new Set((existing || []).map((r: any) => r.artist_legacy_id))
  const toInsert = legacyIds.filter(id => !existingSet.has(id))

  if (toInsert.length === 0) {
    return NextResponse.json({
      created: 0,
      skipped: legacyIds.length,
      message: 'Visi legacy_id jau turi aktyvų job\'ą'
    })
  }

  // Resolve requested_by į esamą profile'ę. Session.user.id gali būti stale po
  // full-wipe migracijos (profiles ištrinti, JWT'as senas) — tokiais atvejais
  // FK constraint'as fail'intų. Imam canonical profile pagal email; jei nerandam,
  // dėdam NULL (FK leidžia ON DELETE SET NULL).
  let requestedBy: string | null = null
  const sessId = (session.user as any).id as string | undefined
  const sessEmail = session.user?.email as string | undefined
  if (sessId) {
    const { data: byId } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', sessId)
      .maybeSingle()
    if (byId) requestedBy = (byId as any).id
  }
  if (!requestedBy && sessEmail) {
    const { data: byEmail } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', sessEmail)
      .maybeSingle()
    if (byEmail) requestedBy = (byEmail as any).id
  }

  const rows = toInsert.map(id => ({
    artist_legacy_id: id,
    job_type: jobType,
    status: 'pending',
    priority,
    requested_by: requestedBy,
  }))

  const { error } = await supabase.from('import_jobs').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    created: toInsert.length,
    skipped: legacyIds.length - toInsert.length,
  })
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const legacyId = url.searchParams.get('legacy_id')
  const jobType = url.searchParams.get('job_type')
  const status = url.searchParams.get('status')
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') || 50)))

  let query = supabase
    .from('import_jobs')
    .select('*')
    .order('requested_at', { ascending: false })
    .limit(limit)

  if (legacyId) query = query.eq('artist_legacy_id', Number(legacyId))
  if (jobType) query = query.eq('job_type', jobType)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ jobs: data || [] })
}
