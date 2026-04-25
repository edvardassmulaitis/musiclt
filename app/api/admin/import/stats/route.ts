/**
 * GET /api/admin/import/stats
 *
 * Grąžina aggregate counts import'o dashboard'ui:
 *   - total_artists (iš public.artists)
 *   - wiki_done, scrape_done, both_done, pending, running
 *   - jobs_today: { pending, running, completed, failed }
 *   - albums_total, tracks_total
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

export async function GET(_req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Šie query'iai paraleliai per Promise.all — jei view egzistuoja, count'as greitas
  const [
    artistsRes,
    wikiDoneRes,
    scrapeDoneRes,
    bothDoneRes,
    pendingJobsRes,
    runningJobsRes,
    failedJobsRes,
    albumsRes,
    tracksRes,
    completedTodayRes,
  ] = await Promise.all([
    supabase.from('artists').select('id', { count: 'exact', head: true }),
    supabase.from('v_artist_import_status').select('id', { count: 'exact', head: true })
      .not('wiki_completed_at', 'is', null),
    supabase.from('v_artist_import_status').select('id', { count: 'exact', head: true })
      .not('scrape_completed_at', 'is', null),
    supabase.from('v_artist_import_status').select('id', { count: 'exact', head: true })
      .not('wiki_completed_at', 'is', null).not('scrape_completed_at', 'is', null),
    supabase.from('import_jobs').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('import_jobs').select('id', { count: 'exact', head: true }).eq('status', 'running'),
    supabase.from('import_jobs').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    supabase.from('albums').select('id', { count: 'exact', head: true }),
    supabase.from('tracks').select('id', { count: 'exact', head: true }),
    supabase.from('import_jobs').select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('completed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  ])

  return NextResponse.json({
    total_artists: artistsRes.count || 0,
    wiki_done: wikiDoneRes.count || 0,
    scrape_done: scrapeDoneRes.count || 0,
    both_done: bothDoneRes.count || 0,
    pending_jobs: pendingJobsRes.count || 0,
    running_jobs: runningJobsRes.count || 0,
    failed_jobs: failedJobsRes.count || 0,
    albums_total: albumsRes.count || 0,
    tracks_total: tracksRes.count || 0,
    completed_last_24h: completedTodayRes.count || 0,
  })
}
