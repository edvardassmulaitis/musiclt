// app/api/mano-muzika/styles/route.ts
// GET    ?catalog=1                                    → stilių katalogas (pasirinkimui)
// POST   { legacy_style_id, style_slug, style_name }   → pridėti stilių
// DELETE { legacy_style_id }                           → pašalinti
// PUT    { ordered_ids: number[] (legacy_style_id) }   → perrikiuoti
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '../_auth'
import { getStyleCatalog, addStyle, removeStyle, reorderStyles } from '@/lib/mano-muzika'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Katalogas viešas (naudojamas pasirinkimui), bet vis tiek reikalaujam auth.
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  try { return NextResponse.json({ ok: true, catalog: await getStyleCatalog() }) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const legacyId = Number(body.legacy_style_id)
  if (!Number.isFinite(legacyId) || !body.style_slug || !body.style_name) {
    return NextResponse.json({ error: 'Blogi duomenys' }, { status: 400 })
  }
  try {
    return NextResponse.json(await addStyle(userId, {
      legacy_style_id: legacyId, style_slug: String(body.style_slug), style_name: String(body.style_name),
    }))
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const legacyId = Number(body.legacy_style_id)
  if (!Number.isFinite(legacyId)) return NextResponse.json({ error: 'Blogi duomenys' }, { status: 400 })
  try { return NextResponse.json(await removeStyle(userId, legacyId)) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}

export async function PUT(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const ids = Array.isArray(body.ordered_ids) ? body.ordered_ids.map(Number).filter(Number.isFinite) : null
  if (!ids) return NextResponse.json({ error: 'Blogi duomenys' }, { status: 400 })
  try { return NextResponse.json(await reorderStyles(userId, ids)) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}
