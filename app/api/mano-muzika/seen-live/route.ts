// app/api/mano-muzika/seen-live/route.ts
// GET    → nario „matyti gyvai" sąrašas (visi statusai)
// POST   → pridėti (approved jei esamas atlikėjas+renginys; pending jei naujas)
// DELETE { id } → pašalinti savo įrašą
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '../_auth'
import { getUserSeenLive, addSeenLive, removeSeenLive } from '@/lib/seen-live'

export const dynamic = 'force-dynamic'

export async function GET() {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  try {
    return NextResponse.json({ items: await getUserSeenLive(userId) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  try {
    const row = await addSeenLive(userId, body)
    return NextResponse.json({ item: row })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Klaida' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const id = Number(body.id)
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Blogi duomenys' }, { status: 400 })
  try {
    await removeSeenLive(userId, id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
