// app/api/mano-muzika/import/lastfm/route.ts
// POST { username } → fetch Last.fm + match → staged preview
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '../../_auth'
import { fetchLastfm, stageAndReport, lastfmConfigured } from '@/lib/music-import'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
  // Sinchroninis kelias visada „best" (greitas). Pilna biblioteka eina fonu
  // per /import/job, kad neviršytų funkcijos laiko limito.
  try {
    const raw = await fetchLastfm(username, { mode: 'best' })
    const staged = await stageAndReport(userId, raw, { source: 'import', perKindLimit: 150 })
    return NextResponse.json({ ok: true, ...staged })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
