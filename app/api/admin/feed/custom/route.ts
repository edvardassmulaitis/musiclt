// app/api/admin/feed/custom/route.ts
//
// POST   — sukuria / atnaujina laisvą (admin pridėtą) feed įrašą.
//   body: { id?, title, subtitle?, image_url?, href, chip?, chip_bg?, video_url?, sort_order?, hidden? }
// DELETE — /api/admin/feed/custom?id=123

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  if (!b.title || !b.href) return NextResponse.json({ error: 'title ir href privalomi' }, { status: 400 })

  const sb = createAdminClient()
  const row: any = {
    kind: 'custom',
    title: b.title, subtitle: b.subtitle || null,
    image_url: b.image_url || null, href: b.href,
    chip: b.chip || 'Įrašas', chip_bg: b.chip_bg || '#6366f1',
    video_url: b.video_url || null,
    sort_order: typeof b.sort_order === 'number' ? b.sort_order : null,
    hidden: !!b.hidden,
    updated_at: new Date().toISOString(),
  }
  if (b.id) {
    const { error } = await sb.from('home_feed').update(row).eq('id', b.id).eq('kind', 'custom')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: b.id })
  }
  const { data, error } = await sb.from('home_feed').insert(row).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: (data as any)?.id })
}

export async function DELETE(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const sb = createAdminClient()
  const { error } = await sb.from('home_feed').delete().eq('id', id).eq('kind', 'custom')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
