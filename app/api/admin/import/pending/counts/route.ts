// app/api/admin/import/pending/counts/route.ts
//
// Greitas count'eris admin dashboard'o badge'ams. Grąžina:
//   { albums: N, tracks: N, jobs: N }
// Naudojam HEAD count'us (`Prefer: count=exact, head=true`) — DB read'as
// atsako kelias eilutes, ne pilnus rows. Tinka rendering'ui kas N
// sekundžių jei reikės polling'o.
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const sb = createAdminClient()
  // Three parallel HEAD count'ai
  const [albumsRes, tracksRes, jobsRes] = await Promise.all([
    sb.from('albums').select('id', { count: 'exact', head: true }).eq('source', 'legacy_scrape_pending'),
    sb.from('tracks').select('id', { count: 'exact', head: true }).eq('source', 'legacy_scrape_pending'),
    sb.from('import_jobs').select('id', { count: 'exact', head: true }).in('status', ['pending', 'running']),
  ])
  return NextResponse.json({
    albums: albumsRes.count || 0,
    tracks: tracksRes.count || 0,
    jobs: jobsRes.count || 0,
  })
}
