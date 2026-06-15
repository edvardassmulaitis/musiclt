// app/api/mano-muzika/style-rank/route.ts
// PUT { kind, style_key, ordered_ids } → perrikiuoti vieno stiliaus/substiliaus topą
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '../_auth'
import { setStyleRank, type FavKind } from '@/lib/mano-muzika'

export const dynamic = 'force-dynamic'
const KINDS: FavKind[] = ['artist', 'album', 'track']

export async function PUT(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const kind = KINDS.includes(body.kind) ? body.kind as FavKind : null
  const styleKey = typeof body.style_key === 'string' ? body.style_key : ''
  const ids = Array.isArray(body.ordered_ids) ? body.ordered_ids.map(Number).filter(Number.isFinite) : null
  if (!kind || !styleKey || !ids) return NextResponse.json({ error: 'Blogi duomenys' }, { status: 400 })
  try { return NextResponse.json(await setStyleRank(userId, kind, styleKey, ids)) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}
