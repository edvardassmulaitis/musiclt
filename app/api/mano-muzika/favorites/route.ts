// app/api/mano-muzika/favorites/route.ts
// POST   { kind, entity_id }                       → pridėti
// DELETE { kind, entity_id }                       → pašalinti
// PATCH  { kind, entity_id, is_featured?, weight?, note? } → keisti
// PUT    { kind, ordered_ids: number[] }           → perrikiuoti (drag)
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '../_auth'
import { addFavorite, removeFavorite, patchFavorite, reorderFavorites, type FavKind } from '@/lib/mano-muzika'

export const dynamic = 'force-dynamic'

const KINDS: FavKind[] = ['artist', 'album', 'track']
function parseKind(v: any): FavKind | null { return KINDS.includes(v) ? v : null }

export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const kind = parseKind(body.kind)
  const entityId = Number(body.entity_id)
  if (!kind || !Number.isFinite(entityId)) return NextResponse.json({ error: 'Blogi duomenys' }, { status: 400 })
  try { return NextResponse.json(await addFavorite(userId, kind, entityId)) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const kind = parseKind(body.kind)
  const entityId = Number(body.entity_id)
  if (!kind || !Number.isFinite(entityId)) return NextResponse.json({ error: 'Blogi duomenys' }, { status: 400 })
  try { return NextResponse.json(await removeFavorite(userId, kind, entityId)) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}

export async function PATCH(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const kind = parseKind(body.kind)
  const entityId = Number(body.entity_id)
  if (!kind || !Number.isFinite(entityId)) return NextResponse.json({ error: 'Blogi duomenys' }, { status: 400 })
  try {
    return NextResponse.json(await patchFavorite(userId, kind, entityId, {
      is_featured: body.is_featured, weight: body.weight, note: body.note,
    }))
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}

export async function PUT(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const kind = parseKind(body.kind)
  const ids = Array.isArray(body.ordered_ids) ? body.ordered_ids.map(Number).filter(Number.isFinite) : null
  if (!kind || !ids) return NextResponse.json({ error: 'Blogi duomenys' }, { status: 400 })
  try { return NextResponse.json(await reorderFavorites(userId, kind, ids)) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}
