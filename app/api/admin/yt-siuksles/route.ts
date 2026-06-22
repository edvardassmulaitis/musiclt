import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/yt-siuksles?min=0&page=0
 *
 * Tracks that have YouTube view counts but NO usable embed — i.e. views left
 * over from a video that is gone / non-embeddable. Junk metrics to clean up.
 * Filter: video_views > min AND (no video_url OR video_embeddable = false).
 */
const FILTER = 'video_url.is.null,video_url.eq.,video_embeddable.is.false'

export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const url = new URL(req.url)
  const min = Math.max(0, parseInt(url.searchParams.get('min') || '0', 10) || 0)
  const page = Math.max(0, parseInt(url.searchParams.get('page') || '0', 10) || 0)
  const pageSize = 50

  const sb = createAdminClient()

  const { count } = await sb
    .from('tracks')
    .select('id', { count: 'exact', head: true })
    .gt('video_views', min)
    .or(FILTER)

  const { data, error } = await sb
    .from('tracks')
    .select('id, slug, title, video_views, video_url, video_embeddable, artist_id, artists!tracks_artist_id_fkey(name, slug)')
    .gt('video_views', min)
    .or(FILTER)
    .order('video_views', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const tracks = (data || []).map((t: any) => {
    const a = Array.isArray(t.artists) ? t.artists[0] : t.artists
    return {
      id: t.id,
      slug: t.slug,
      title: t.title,
      video_views: t.video_views,
      video_url: t.video_url,
      video_embeddable: t.video_embeddable,
      reason: (!t.video_url || t.video_url === '') ? 'no_url' : 'not_embeddable',
      artist_name: a?.name ?? null,
      artist_slug: a?.slug ?? null,
    }
  })

  return NextResponse.json({ total: count || 0, page, pageSize, hasMore: tracks.length === pageSize, tracks })
}
