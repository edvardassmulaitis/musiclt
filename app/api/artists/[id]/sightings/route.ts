// app/api/artists/[id]/sightings/route.ts
// GET — narių „koncertų akimirkos" (Matyti gyvai su media) tam atlikėjui.
import { NextRequest, NextResponse } from 'next/server'
import { getArtistSightingMedia } from '@/lib/seen-live'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const artistId = Number(id)
  if (!Number.isFinite(artistId)) return NextResponse.json({ items: [] })
  try {
    const items = await getArtistSightingMedia(artistId, 24)
    return NextResponse.json({ items }, {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, items: [] }, { status: 500 })
  }
}
