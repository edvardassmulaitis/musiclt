// app/api/verta-keliones/route.ts
//
// GET /api/verta-keliones
// Verti kelionės koncertai užsienyje + kryptys. Naudojama homepage reader'io
// feed'e (reader v3) ir /verta-keliones puslapyje. Duomenys iš DB su seed
// fallback'u (lib/verta-keliones-db.ts).

import { NextResponse } from 'next/server'
import { getVertaKelionesData } from '@/lib/verta-keliones-db'

export const revalidate = 600

export async function GET() {
  try {
    const data = await getVertaKelionesData()
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800',
        'CDN-Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ concerts: [], destinations: [], error: e?.message }, { status: 200 })
  }
}
