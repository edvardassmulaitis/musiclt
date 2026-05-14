/**
 * GET /api/admin/event-candidates?status=pending — list pending event candidates
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user.role as string) || '')) return null
  return session
}

export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || 'pending'
  const limit = parseInt(searchParams.get('limit') || '50', 10)

  const supabase = createAdminClient()
  const { data, error, count } = await supabase
    .from('event_candidates')
    .select(`
      id, source_type, source_portal, source_url,
      title, event_date, event_date_text, venue_name_raw, city,
      description, ticket_url, price_text, image_url,
      suggested_artist_ids, primary_artist_id,
      status, fingerprint, ai_confidence, created_at,
      primary_artist:artists!event_candidates_primary_artist_id_fkey(id, name, slug, cover_image_url, legacy_likes)
    `, { count: 'exact' })
    .eq('status', status)
    .order('event_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Decorate su suggested_artists (image + likes)
  const allArtistIds = new Set<number>()
  for (const c of (data || [])) {
    for (const id of (c.suggested_artist_ids || [])) allArtistIds.add(id)
  }
  let artistMap: Record<number, any> = {}
  if (allArtistIds.size > 0) {
    const { data: artists } = await supabase
      .from('artists')
      .select('id, name, slug, cover_image_url, legacy_likes')
      .in('id', Array.from(allArtistIds))
    for (const a of (artists || [])) artistMap[a.id] = a
  }

  const decorated = (data || []).map((c: any) => ({
    ...c,
    suggested_artists: (c.suggested_artist_ids || []).map((id: number) => artistMap[id]).filter(Boolean),
  }))

  return NextResponse.json({ candidates: decorated, total: count || 0 })
}
