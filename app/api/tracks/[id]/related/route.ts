// app/api/tracks/[id]/related/route.ts
//
// „Susijusi muzika" — cross-artist rekomendacijos (co-like + YT populiarumas +
// substyle peers). Naudoja TrackInfoModal'as, kad rodytų tuos pačius pasiūlymus
// kaip standalone dainos puslapis. Žr. lib/related-tracks.ts.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getRelatedTracks } from '@/lib/related-tracks'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const trackId = parseInt(id, 10)
  if (!Number.isFinite(trackId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const sb = createAdminClient()
  const { data: track } = await sb.from('tracks').select('id, artist_id').eq('id', trackId).single()
  if (!track) return NextResponse.json({ related: [] })

  try {
    const related = await getRelatedTracks(sb, { trackId, artistId: (track as any).artist_id, limit: 12 })
    return NextResponse.json({ related })
  } catch (e: any) {
    console.error('[track-related] failed:', e?.message)
    return NextResponse.json({ related: [] })
  }
}
