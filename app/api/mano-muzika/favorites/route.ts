// app/api/mano-muzika/favorites/route.ts
// POST   { kind, entity_id }  → pridėti į biblioteką (patiktukas)
// DELETE { kind, entity_id }  → visiškai pašalinti (unlike + iš pakopų)
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '../_auth'
import { addFavorite, removeFavorite, type FavKind } from '@/lib/mano-muzika'

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
