// app/api/mano-muzika/import/commit/route.ts
// POST { artists:number[], albums:number[], tracks:number[] } → bulk įdėjimas
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '../../_auth'
import { commitInto } from '@/lib/music-import'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const ids = (v: any) => Array.isArray(v) ? v.map(Number).filter(Number.isFinite).slice(0, 300) : []

export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  try {
    const res = await commitInto(userId, { artists: ids(body.artists), albums: ids(body.albums), tracks: ids(body.tracks) })
    return NextResponse.json(res)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
