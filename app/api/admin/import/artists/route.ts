/**
 * GET /api/admin/import/artists
 *
 * Query params:
 *   - search: string (name or legacy_id exact match)
 *   - status: 'all' | 'pending' | 'wiki_done' | 'scrape_done' | 'both_done' | 'failed' | 'running'
 *   - sort: 'legacy_id' | 'name' | 'score' | 'last_activity'
 *   - page: number (default 1)
 *   - limit: number (default 50, max 500)
 *
 * Returns list + total + status counts aggregate.
 * Naudoja `v_artist_import_status` view sukurtą 20260424f migracijoj.
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

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const search = (url.searchParams.get('search') || '').trim()
  const status = url.searchParams.get('status') || 'all'
  const sort = url.searchParams.get('sort') || 'legacy_id'
  const page = Math.max(1, Number(url.searchParams.get('page') || 1))
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') || 50)))
  const offset = (page - 1) * limit

  let query = supabase
    .from('v_artist_import_status')
    .select('*', { count: 'exact' })

  // Search — jeigu skaičius, tai kaip legacy_id; kitaip pagal name
  if (search) {
    const asNum = Number(search)
    if (Number.isInteger(asNum) && asNum > 0) {
      query = query.eq('legacy_id', asNum)
    } else {
      query = query.ilike('name', `%${search}%`)
    }
  }

  // Status filter
  switch (status) {
    case 'pending':
      query = query.is('wiki_completed_at', null).is('scrape_completed_at', null).eq('active_jobs', 0)
      break
    case 'wiki_done':
      query = query.not('wiki_completed_at', 'is', null).is('scrape_completed_at', null)
      break
    case 'scrape_done':
      query = query.not('scrape_completed_at', 'is', null).is('wiki_completed_at', null)
      break
    case 'both_done':
      query = query.not('wiki_completed_at', 'is', null).not('scrape_completed_at', 'is', null)
      break
    case 'running':
      query = query.gt('active_jobs', 0)
      break
    case 'failed':
      // failed jeigu last_status='failed' bent viename
      query = query.or('wiki_last_status.eq.failed,scrape_last_status.eq.failed')
      break
    // 'all' → no filter
  }

  // Sort
  const sortMap: Record<string, { col: string; asc: boolean }> = {
    legacy_id: { col: 'legacy_id', asc: true },
    name: { col: 'name', asc: true },
    score: { col: 'score', asc: false },
    last_activity: { col: 'scrape_completed_at', asc: false },
  }
  const s = sortMap[sort] || sortMap.legacy_id
  query = query.order(s.col, { ascending: s.asc, nullsFirst: false })

  // Pagination
  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    artists: data || [],
    total: count || 0,
    page,
    limit,
  })
}
