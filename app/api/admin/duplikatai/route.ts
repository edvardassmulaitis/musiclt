import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/duplikatai
 *   ?signal=all|spotify|youtube|same_artist|cross_artist
 *   ?page=0&pageSize=25
 *
 * Returns pending duplicate-candidate groups (from track_dup_groups) with live
 * track details for each member, plus per-signal counts for the tab bar.
 */
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const url = new URL(req.url)
  const signal = url.searchParams.get('signal') || 'all'
  const page = Math.max(0, parseInt(url.searchParams.get('page') || '0', 10) || 0)
  const pageSize = Math.min(50, Math.max(5, parseInt(url.searchParams.get('pageSize') || '25', 10) || 25))

  const sb = createAdminClient()

  // Per-signal counts (pending only) for the tabs. Use head+exact count so we
  // are not capped by PostgREST's 1000-row default.
  const counts: Record<string, number> = { all: 0, spotify: 0, youtube: 0, same_artist: 0, cross_artist: 0 }
  await Promise.all(
    (['all', 'spotify', 'youtube', 'same_artist', 'cross_artist'] as const).map(async key => {
      let cq = sb.from('track_dup_groups').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      if (key !== 'all') cq = cq.eq('signal', key)
      const { count } = await cq
      counts[key] = count || 0
    })
  )

  // Page of groups.
  let gq = sb
    .from('track_dup_groups')
    .select('id, signal, confidence, track_ids, member_count, suggested_keeper_id, sample_title, sample_artist')
    .eq('status', 'pending')
  if (signal !== 'all') gq = gq.eq('signal', signal)
  const { data: groups, error } = await gq
    .order('member_count', { ascending: false })
    .order('id', { ascending: true })
    .range(page * pageSize, page * pageSize + pageSize - 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const allIds = Array.from(new Set((groups || []).flatMap(g => g.track_ids as number[])))
  const trackMap = new Map<number, any>()
  if (allIds.length) {
    const { data: tracks } = await sb
      .from('tracks')
      .select('id, slug, title, type, release_year, video_url, spotify_id, lyrics, cover_url, video_views, page_view_count, created_at, artist_id, artists!tracks_artist_id_fkey(id, name, slug)')
      .in('id', allIds)
    for (const t of (tracks || []) as any[]) {
      const a = Array.isArray(t.artists) ? t.artists[0] : t.artists
      trackMap.set(t.id, {
        id: t.id,
        slug: t.slug,
        title: t.title,
        type: t.type,
        release_year: t.release_year,
        artist_id: t.artist_id,
        artist_name: a?.name ?? null,
        artist_slug: a?.slug ?? null,
        has_video: !!(t.video_url && t.video_url !== ''),
        video_url: t.video_url,
        has_spotify: !!(t.spotify_id && t.spotify_id !== ''),
        has_lyrics: !!(t.lyrics && t.lyrics !== ''),
        has_cover: !!(t.cover_url && t.cover_url !== ''),
        cover_url: t.cover_url,
        video_views: t.video_views,
        page_view_count: t.page_view_count,
        created_at: t.created_at,
      })
    }
  }

  const out = (groups || []).map(g => ({
    id: g.id,
    signal: g.signal,
    confidence: g.confidence,
    suggested_keeper_id: g.suggested_keeper_id,
    sample_title: g.sample_title,
    sample_artist: g.sample_artist,
    members: (g.track_ids as number[])
      .map(id => trackMap.get(id))
      .filter(Boolean),
  })).filter(g => g.members.length > 1)  // skip groups whose members got merged away

  return NextResponse.json({
    counts,
    page,
    pageSize,
    hasMore: (groups?.length || 0) === pageSize,
    groups: out,
  })
}
