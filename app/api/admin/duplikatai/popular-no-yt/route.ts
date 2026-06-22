import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/admin/duplikatai/popular-no-yt?maxViews=1000&minLikes=5&page=0
 *
 * Tracks that are popular by legacy music.lt likes but have few/no YouTube
 * views — likely missing or broken YT data worth investigating / enriching.
 */
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const url = new URL(req.url)
  const maxViews = Math.max(0, parseInt(url.searchParams.get('maxViews') || '1000', 10) || 0)
  const minLikes = Math.max(1, parseInt(url.searchParams.get('minLikes') || '5', 10) || 5)
  const page = Math.max(0, parseInt(url.searchParams.get('page') || '0', 10) || 0)
  const pageSize = 50

  const sb = createAdminClient()
  const { data: top, error: rErr } = await sb.rpc('top_liked_low_views', {
    p_max_views: maxViews, p_min_likes: minLikes, p_limit: pageSize, p_offset: page * pageSize,
  })
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })

  const rows = (top || []) as Array<{ track_id: number; likes: number }>
  const likeMap = new Map<number, number>(rows.map(r => [Number(r.track_id), Number(r.likes)]))
  const ids = rows.map(r => Number(r.track_id))

  const trackMap = new Map<number, any>()
  if (ids.length) {
    const { data: tracks } = await sb
      .from('tracks')
      .select('id, slug, title, video_views, video_url, video_embeddable, spotify_id, artist_id, artists!tracks_artist_id_fkey(name, slug)')
      .in('id', ids)
    for (const t of (tracks || []) as any[]) {
      const a = Array.isArray(t.artists) ? t.artists[0] : t.artists
      trackMap.set(t.id, {
        id: t.id, slug: t.slug, title: t.title,
        video_views: t.video_views, video_url: t.video_url, video_embeddable: t.video_embeddable,
        spotify_id: t.spotify_id || null,
        has_video: !!(t.video_url && t.video_url !== ''),
        artist_name: a?.name ?? null, artist_slug: a?.slug ?? null,
        likes: likeMap.get(t.id) || 0,
      })
    }
  }

  const tracks = ids.map(id => trackMap.get(id)).filter(Boolean)
  return NextResponse.json({ page, pageSize, hasMore: rows.length === pageSize, tracks })
}
