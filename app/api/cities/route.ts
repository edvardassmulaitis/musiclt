import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'
import { findOrCreateCity } from '@/lib/geo'

// GET /api/cities — miestų sąrašas (admin formos, filtrai).
// POST /api/cities — sukurti naują miestą (admin), find-or-create + country_id.
export const dynamic = 'force-dynamic'

export async function GET() {
  const sb = createAdminClient()
  const { data } = await sb
    .from('cities')
    .select('id, legacy_id, name, slug, sort_order, country_id')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  return NextResponse.json({ cities: data || [] }, {
    headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=86400' },
  })
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  try {
    const city = await findOrCreateCity(body.name, body.country_id ? Number(body.country_id) : null)
    return NextResponse.json({ city })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Klaida' }, { status: 400 })
  }
}
