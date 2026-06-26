import { NextResponse } from 'next/server'
import { getVertaKelionesData } from '@/lib/verta-keliones-db'

// Viešas „Verta kelionės" koncertų sąrašas — naudoja TĄ PATĮ šaltinį kaip
// /verta-keliones puslapis (verified + būsimi užsienio koncertai), kad homepage
// afišos „Koncertai, verti kelionės" collage sutaptų su pilnu sąrašu. 2026-06-26.
export const revalidate = 300

export async function GET() {
  try {
    const { concerts, destinations } = await getVertaKelionesData()
    return NextResponse.json({ concerts, destinations }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' },
    })
  } catch (e: any) {
    return NextResponse.json({ concerts: [], destinations: [], error: e?.message }, { status: 200 })
  }
}
