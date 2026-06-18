// app/api/koncertu-irasai/route.ts
//
// GET /api/koncertu-irasai?limit=6
// Naujausi koncertų įrašai (gyvai). Naudojama homepage reader'io feed'e
// (reader v3 „gyvai" tipas). Duomenys iš lib/concert-recordings.ts.

import { NextRequest, NextResponse } from 'next/server'
import { getLatestRecordings } from '@/lib/concert-recordings'

export const revalidate = 600

export async function GET(req: NextRequest) {
  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('limit') || '6'), 1), 50)
  try {
    const recordings = await getLatestRecordings(limit)
    return NextResponse.json({ recordings }, {
      headers: {
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800',
        'CDN-Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ recordings: [], error: e?.message }, { status: 200 })
  }
}
