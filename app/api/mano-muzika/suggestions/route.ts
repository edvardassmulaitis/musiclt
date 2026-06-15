// app/api/mano-muzika/suggestions/route.ts
// GET ?exclude=1,2,3&limit=24              → populiarūs LT atlikėjai onboarding'ui.
// GET ?kind=artist|album|track&limit=24    → pasiūlymai panelėms (uniform items).
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '../_auth'
import { getArtistSuggestions, getSuggestions } from '@/lib/mano-muzika'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const limit = Math.min(60, Math.max(6, Number(searchParams.get('limit')) || 24))
  const kind = searchParams.get('kind')
  try {
    if (kind === 'artist' || kind === 'album' || kind === 'track') {
      const items = await getSuggestions(userId, kind, limit)
      return NextResponse.json({ ok: true, items, tracks: items })
    }
    const excludeIds = (searchParams.get('exclude') || '').split(',').map(Number).filter(Number.isFinite)
    const artists = await getArtistSuggestions({ limit, excludeIds })
    return NextResponse.json({ ok: true, artists })
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}
