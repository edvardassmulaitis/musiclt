// app/api/mano-muzika/import/lastfm/scan/route.ts
// POST { username } → greitas „kiek ko yra" Last.fm (apimties pasirinkimui).
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '../../../_auth'
import { scanLastfm } from '@/lib/import-jobs'
import { lastfmConfigured } from '@/lib/music-import'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  if (!lastfmConfigured()) return NextResponse.json({ error: 'Last.fm importas nesukonfigūruotas' }, { status: 400 })
  const body = await req.json().catch(() => ({}))
  const username = String(body.username || '').trim()
  if (!username) return NextResponse.json({ error: 'Įvesk Last.fm vartotojo vardą' }, { status: 400 })
  try {
    const counts = await scanLastfm(username)
    return NextResponse.json({ ok: true, counts })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
