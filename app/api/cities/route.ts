import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/cities — fiksuotas LT miestų sąrašas (iš music.lt ?places).
// Naudojamas admin renginio formoje (miesto dropdown) + filtruose.
export const revalidate = 3600

export async function GET() {
  const sb = createAdminClient()
  const { data } = await sb
    .from('cities')
    .select('id, legacy_id, name, slug, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  return NextResponse.json({ cities: data || [] }, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  })
}
