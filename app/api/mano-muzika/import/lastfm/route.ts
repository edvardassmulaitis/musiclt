// app/api/mano-muzika/import/lastfm/route.ts
// POST { username } → fetch Last.fm + match → staged preview
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '../../_auth'
import { fetchLastfm, matchItems, lastfmConfigured } from '@/lib/music-import'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  // konfigūracijos patikra (UI gali parodyti „nesukonfigūruota")
  return NextResponse.json({ configured: lastfmConfigured() })
}

export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const username = String(body.username || '').trim()
  if (!username) return NextResponse.json({ error: 'Įvesk Last.fm vartotojo vardą' }, { status: 400 })
  try {
    const raw = await fetchLastfm(username)
    const staged = await matchItems(raw)
    return NextResponse.json({ ok: true, ...staged })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
