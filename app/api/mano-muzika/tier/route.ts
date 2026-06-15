// app/api/mano-muzika/tier/route.ts
// POST   { kind, entity_id }     → įmesti į Mėgstamus (rikiuojamą sąrašą)
// DELETE { kind, entity_id }     → grąžinti į biblioteką
// PUT    { kind, ordered_ids }   → perrikiuoti Mėgstamus (drag / šokti į vietą)
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '../_auth'
import { moveToRanked, removeFromRanked, reorderRanked, type FavKind } from '@/lib/mano-muzika'

export const dynamic = 'force-dynamic'

const KINDS: FavKind[] = ['artist', 'album', 'track']
function parseKind(v: any): FavKind | null { return KINDS.includes(v) ? v : null }

export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const kind = parseKind(body.kind); const entityId = Number(body.entity_id)
  if (!kind || !Number.isFinite(entityId)) return NextResponse.json({ error: 'Blogi duomenys' }, { status: 400 })
  try { return NextResponse.json(await moveToRanked(userId, kind, entityId)) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }) }
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const kind = parseKind(body.kind); const entityId = Number(body.entity_id)
  if (!kind || !Number.isFinite(entityId)) return NextResponse.json({ error: 'Blogi duomenys' }, { status: 400 })
  try { return NextResponse.json(await removeFromRanked(userId, kind, entityId)) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}

export async function PUT(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const kind = parseKind(body.kind)
  const ids = Array.isArray(body.ordered_ids) ? body.ordered_ids.map(Number).filter(Number.isFinite) : null
  if (!kind || !ids) return NextResponse.json({ error: 'Blogi duomenys' }, { status: 400 })
  try { return NextResponse.json(await reorderRanked(userId, kind, ids)) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}
