/**
 * GET  /api/admin/import/forum         — stats + list
 * POST /api/admin/import/forum         — bulk schedule (action: 'discover' | 'scrape_empty' | 'scrape_all' | 'scrape_ids')
 *
 * Šitas endpoint'as queue'ina forum_thread / forum_discover job'us, kuriuos paims
 * scraper/forum_worker.py.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

const supabase = createAdminClient()

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return null
  }
  return session
}

async function resolveRequestedBy(session: any): Promise<string | null> {
  const sessId = session?.user?.id as string | undefined
  const sessEmail = session?.user?.email as string | undefined
  if (sessId) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', sessId)
      .maybeSingle()
    if (data) return (data as any).id
  }
  if (sessEmail) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', sessEmail)
      .maybeSingle()
    if (data) return (data as any).id
  }
  return null
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') || 100)))
  const filter = url.searchParams.get('filter') || 'all' // all | empty | scraped | active_job

  // Stats — atskiri counts
  const stats: Record<string, number> = {}
  for (const [k, q] of [
    ['total', supabase.from('forum_threads').select('legacy_id', { count: 'exact', head: true })],
    ['empty', supabase.from('forum_threads').select('legacy_id', { count: 'exact', head: true }).eq('post_count', 0)],
    ['scraped', supabase.from('forum_threads').select('legacy_id', { count: 'exact', head: true }).gt('post_count', 0)],
    ['active_jobs', supabase.from('import_jobs').select('id', { count: 'exact', head: true })
                          .eq('job_type', 'forum_thread').in('status', ['pending', 'running'])],
    ['failed_jobs', supabase.from('import_jobs').select('id', { count: 'exact', head: true })
                          .eq('job_type', 'forum_thread').eq('status', 'failed')],
  ] as const) {
    const { count } = await q
    stats[k] = count ?? 0
  }

  // List per filter — naudoja v_forum_thread_import_status view'ą.
  let listQ = supabase
    .from('v_forum_thread_import_status')
    .select('*')
    .order('post_count', { ascending: false })
    .limit(limit)
  if (filter === 'empty') listQ = listQ.eq('post_count', 0)
  else if (filter === 'scraped') listQ = listQ.gt('post_count', 0)
  else if (filter === 'active_job') listQ = listQ.eq('has_active_job', true)
  const { data: threads, error } = await listQ
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ stats, threads: threads || [] })
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any = {}
  try { body = await req.json() } catch {}
  const action = body?.action as string
  const requestedBy = await resolveRequestedBy(session)

  if (action === 'discover') {
    // Vienas forum_discover job'as — worker paleis forum_discover.py.
    const { error } = await supabase.from('import_jobs').insert({
      job_type: 'forum_discover',
      status: 'pending',
      target_kind: 'forum_discover',
      target_id: null,
      artist_legacy_id: null,
      requested_by: requestedBy,
      priority: 5,
    } as any)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, queued: 1, action })
  }

  if (action === 'scrape_empty' || action === 'scrape_all' || action === 'scrape_ids') {
    let ids: number[] = []

    if (action === 'scrape_ids') {
      const arr = body?.legacyIds
      if (!Array.isArray(arr) || arr.length === 0) {
        return NextResponse.json({ error: 'legacyIds required' }, { status: 400 })
      }
      ids = arr.map(Number).filter(Number.isFinite)
    } else {
      // Surenkam thread legacy_id'us pagal filtrą
      let q = supabase.from('forum_threads').select('legacy_id').limit(50000)
      if (action === 'scrape_empty') q = q.eq('post_count', 0)
      const { data, error } = await q
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      ids = (data || []).map((r: any) => r.legacy_id).filter(Boolean)
    }

    if (ids.length === 0) {
      return NextResponse.json({ ok: true, queued: 0, message: 'Nėra thread\'ų pagal filtrą' })
    }

    // Praleidžiam tuos, kurie jau turi pending/running forum_thread job'ą
    const { data: active } = await supabase
      .from('import_jobs')
      .select('target_id')
      .eq('job_type', 'forum_thread')
      .in('status', ['pending', 'running'])
      .in('target_id', ids)
    const activeSet = new Set((active || []).map((r: any) => r.target_id))
    const toQueue = ids.filter(id => !activeSet.has(id))

    if (toQueue.length === 0) {
      return NextResponse.json({ ok: true, queued: 0, skipped: ids.length, message: 'Visi pasirinkti jau turi aktyvų job\'ą' })
    }

    const rows = toQueue.map(id => ({
      job_type: 'forum_thread',
      status: 'pending',
      target_kind: 'forum_thread',
      target_id: id,
      artist_legacy_id: null,
      requested_by: requestedBy,
      priority: 0,
    }))

    // Batch insert (Supabase rib'as ~1000 per call)
    const BATCH = 1000
    let inserted = 0
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH)
      const { error } = await supabase.from('import_jobs').insert(slice as any)
      if (error) {
        return NextResponse.json({
          error: error.message,
          inserted_so_far: inserted,
        }, { status: 500 })
      }
      inserted += slice.length
    }

    return NextResponse.json({
      ok: true,
      queued: inserted,
      skipped: ids.length - toQueue.length,
      action,
    })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
