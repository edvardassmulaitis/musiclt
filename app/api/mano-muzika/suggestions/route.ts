// app/api/mano-muzika/suggestions/route.ts
// GET ?exclude=1,2,3&limit=24        → populiarūs LT atlikėjai onboarding'ui.
// GET ?kind=track&limit=24           → dainų pasiūlymai (iš mėgstamų atlikėjų).
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '../_auth'
import { getArtistSuggestions, getTrackSuggestions } from '@/lib/mano-muzika'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const limit = Math.min(60, Math.max(6, Number(searchParams.get('limit')) || 24))
  try {
    if (searchParams.get('kind') === 'track') {
      const tracks = await getTrackSuggestions(userId, limit)
      return NextResponse.json({ ok: true, tracks })
    }
    const excludeIds = (searchParams.get('exclude') || '').split(',').map(Number).filter(Number.isFinite)
    const artists = await getArtistSuggestions({ limit, excludeIds })
    return NextResponse.json({ ok: true, artists })
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}
