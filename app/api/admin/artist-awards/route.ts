import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/** GET /api/admin/artist-awards?artist_id=X
 *  Returns flat list of awards entries for this artist + participants_in_event count.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !['admin', 'super_admin'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = new URL(req.url)
  const artistId = parseInt(url.searchParams.get('artist_id') || '')
  if (!artistId) return NextResponse.json({ error: 'artist_id required' }, { status: 400 })

  const sb = createAdminClient()
  const { data: parts } = await sb
    .from('voting_participants')
    .select('id, event_id, album_id, track_id, display_subtitle, metadata, voting_events!inner(id, name, slug, edition_id, voting_editions!inner(id, year, channel_id, voting_channels!inner(id, name, slug)))')
    .eq('artist_id', artistId)

  const awardRows = ((parts || []) as any[]).filter(r => r.metadata?.imported_from_award)
  if (awardRows.length === 0) return NextResponse.json({ rows: [] })

  // Count participants per event
  const eventIds = [...new Set(awardRows.map(r => r.event_id))]
  const partCounts = new Map<number, number>()
  if (eventIds.length > 0) {
    const { data: countRows } = await sb
      .from('voting_participants')
      .select('event_id')
      .in('event_id', eventIds)
    for (const r of (countRows || []) as any[]) {
      partCounts.set(r.event_id, (partCounts.get(r.event_id) || 0) + 1)
    }
  }

  const rows = awardRows.map((r: any) => {
    const ev = r.voting_events
    const ed = ev?.voting_editions
    const ch = ed?.voting_channels
    return {
      id: r.id,
      result: r.metadata?.result || 'other',
      work: r.display_subtitle || null,
      event_id: r.event_id,
      event_name: ev?.name || '',
      event_slug: ev?.slug || '',
      edition_year: ed?.year ?? null,
      channel_name: ch?.name || '',
      channel_slug: ch?.slug || '',
      participants_in_event: partCounts.get(r.event_id) || 0,
    }
  })

  return NextResponse.json({ rows })
}
