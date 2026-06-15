// app/api/mano-muzika/import/youtube/route.ts
// POST { url } → fetch viešo playlisto įrašus + match → staged preview
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '../../_auth'
import { fetchYoutubePlaylist, matchItems } from '@/lib/music-import'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const url = String(body.url || '').trim()
  if (!url) return NextResponse.json({ error: 'Įklijuok playlisto nuorodą' }, { status: 400 })
  try {
    const raw = await fetchYoutubePlaylist(url)
    const staged = await matchItems(raw)
    return NextResponse.json({ ok: true, ...staged })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
