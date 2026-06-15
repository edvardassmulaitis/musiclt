// app/api/mano-muzika/tier/route.ts
// POST   { kind, entity_id, tier(1|2) }     → įmesti į Topą / Mėgstamus (su limitu)
// DELETE { kind, entity_id }                → grąžinti į biblioteką (lieka patiktuku)
// PUT    { kind, tier(1|2), ordered_ids }   → perrikiuoti pakopą (drag / šokti į vietą)
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '../_auth'
import { moveToTier, removeFromTier, reorderTier, type FavKind } from '@/lib/mano-muzika'

export const dynamic = 'force-dynamic'

const KINDS: FavKind[] = ['artist', 'album', 'track']
function parseKind(v: any): FavKind | null { return KINDS.includes(v) ? v : null }
function parseTier(v: any): 1 | 2 | null { return v === 1 || v === 2 ? v : null }

export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const kind = parseKind(body.kind); const tier = parseTier(body.tier); const entityId = Number(body.entity_id)
  if (!kind || !tier || !Number.isFinite(entityId)) return NextResponse.json({ error: 'Blogi duomenys' }, { status: 400 })
  try { return NextResponse.json(await moveToTier(userId, kind, entityId, tier)) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }) }
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const kind = parseKind(body.kind); const entityId = Number(body.entity_id)
  if (!kind || !Number.isFinite(entityId)) return NextResponse.json({ error: 'Blogi duomenys' }, { status: 400 })
  try { return NextResponse.json(await removeFromTier(userId, kind, entityId)) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}

export async function PUT(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const kind = parseKind(body.kind); const tier = parseTier(body.tier)
  const ids = Array.isArray(body.ordered_ids) ? body.ordered_ids.map(Number).filter(Number.isFinite) : null
  if (!kind || !tier || !ids) return NextResponse.json({ error: 'Blogi duomenys' }, { status: 400 })
  try { return NextResponse.json(await reorderTier(userId, kind, tier, ids)) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}
