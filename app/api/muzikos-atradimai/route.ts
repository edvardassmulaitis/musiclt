// app/api/muzikos-atradimai/route.ts
//
// GET /api/muzikos-atradimai?limit=12
// Naujausi muzikos atradimai (forumo gija → discoveries). Naudojama /atrasti
// Pulsas grid'ui. Pilnas, filtruojamas sąrašas — /muzikos-atradimai puslapyje.
//
// ?featured=1 — tik „Dėmesio centre" (featured_until > now), /atrasti slideriui.

import { NextRequest, NextResponse } from 'next/server'
import { getDiscoveries } from '@/lib/discoveries'

export const revalidate = 600

export async function GET(req: NextRequest) {
  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('limit') || '12'), 1), 50)
  const featuredOnly = req.nextUrl.searchParams.get('featured') === '1'
  try {
    let items = await getDiscoveries()
    if (featuredOnly) {
      const now = Date.now()
      items = items
        .filter(d => d.featured_until && new Date(d.featured_until).getTime() > now)
        .sort((a, b) => new Date(b.featured_until!).getTime() - new Date(a.featured_until!).getTime())
    }
    return NextResponse.json({ items: items.slice(0, limit) })
  } catch (e: any) {
    return NextResponse.json({ items: [], error: e?.message }, { status: 200 })
  }
}
