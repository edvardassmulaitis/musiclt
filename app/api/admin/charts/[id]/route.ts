import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/** PATCH /api/admin/charts/[id] — chart-level nustatymai „Kiti topai" plytelei:
 *   { featured?: boolean, featured_order?: number|null, cover_image_url?: string|null }
 *  Naudoja /admin/charts (vizualų + featured valdymas nav dropdown'ui). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const chartId = parseInt(id, 10)
  if (!chartId) return NextResponse.json({ error: 'bad id' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const patch: Record<string, any> = {}
  if (typeof body.featured === 'boolean') patch.featured = body.featured
  if ('featured_order' in body) patch.featured_order = body.featured_order === null ? null : parseInt(body.featured_order, 10)
  if ('cover_image_url' in body) patch.cover_image_url = body.cover_image_url || null
  if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim()
  if ('country' in body) patch.country = body.country ? String(body.country).trim().toUpperCase() : null
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

  const sb = createAdminClient()
  const { error } = await sb.from('external_charts').update(patch).eq('id', chartId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, patch })
}
