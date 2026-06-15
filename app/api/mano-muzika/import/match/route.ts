// app/api/mano-muzika/import/match/route.ts
// POST { artists?, tracks?, albums? } → match RawItems → staged preview
// Naudojama Spotify „Download your data" failui (parse'inamas kliente).
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '../../_auth'
import { stageAndReport, type RawItems } from '@/lib/music-import'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const raw: RawItems = {
    artists: Array.isArray(body.artists) ? body.artists.filter((x: any) => x?.name).slice(0, 500) : [],
    tracks: Array.isArray(body.tracks) ? body.tracks.filter((x: any) => x?.artist && x?.title).slice(0, 800) : [],
    albums: Array.isArray(body.albums) ? body.albums.filter((x: any) => x?.artist && x?.title).slice(0, 500) : [],
  }
  if (!raw.artists!.length && !raw.tracks!.length && !raw.albums!.length) {
    return NextResponse.json({ error: 'Faile nerasta atpažįstamų įrašų' }, { status: 400 })
  }
  try {
    const staged = await stageAndReport(userId, raw, { source: 'import', perKindLimit: 800 })
    return NextResponse.json({ ok: true, ...staged })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
