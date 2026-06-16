// app/api/mano-muzika/import/job/route.ts
// POST { source:'lastfm', username, mode } → įmeta foninį importo job'ą.
// GET → paskutinio šito nario job'o būsena (UI gali parodyti „vyksta / baigta").
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '../../_auth'
import { enqueueImportJob, getLatestJob } from '@/lib/import-jobs'
import { lastfmConfigured } from '@/lib/music-import'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const job = await getLatestJob(userId)
  return NextResponse.json({ ok: true, job })
}

export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const source = String(body.source || 'lastfm')
  if (source === 'lastfm' && !lastfmConfigured()) {
    return NextResponse.json({ error: 'Last.fm importas nesukonfigūruotas' }, { status: 400 })
  }
  const username = String(body.username || '').trim()
  if (source === 'lastfm' && !username) {
    return NextResponse.json({ error: 'Įvesk Last.fm vartotojo vardą' }, { status: 400 })
  }
  // Apimtis (scope) — ką ir kiek kelti. Numatytai viskas + tik mėgstami/dažni.
  const KINDS = ['artist', 'album', 'track']
  const s = body.scope && typeof body.scope === 'object' ? body.scope : {}
  const kinds = Array.isArray(s.kinds) ? s.kinds.filter((k: any) => KINDS.includes(k)) : KINDS
  const scope = {
    kinds: kinds.length ? kinds : KINDS,
    historyMode: s.historyMode === 'all' ? 'all' : 'best',
    minPlaycount: Math.max(0, Number(s.minPlaycount) || 0),
  }
  try {
    const res = await enqueueImportJob(userId, source, { username, mode: 'full', scope })
    return NextResponse.json({ ok: true, jobId: res.id, existing: res.existing })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
