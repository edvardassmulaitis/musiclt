// app/api/muzikos-atradimai/route.ts
//
// GET /api/muzikos-atradimai?limit=12
// Naujausi muzikos atradimai (forumo gija → discoveries). Naudojama /feed
// juostai. Pilnas, filtruojamas sąrašas — /muzikos-atradimai puslapyje.

import { NextRequest, NextResponse } from 'next/server'
import { getDiscoveries } from '@/lib/discoveries'

export const revalidate = 600

export async function GET(req: NextRequest) {
  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('limit') || '12'), 1), 50)
  try {
    const items = await getDiscoveries()
    return NextResponse.json({ items: items.slice(0, limit) })
  } catch (e: any) {
    return NextResponse.json({ items: [], error: e?.message }, { status: 200 })
  }
}
