// app/api/countries/route.ts
// GET  — aktyvių šalių sąrašas (select'ams)
// POST — sukurti naują šalį (admin), find-or-create
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { listCountries, findOrCreateCountry } from '@/lib/geo'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json({ countries: await listCountries() }, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, countries: [] }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  try {
    const country = await findOrCreateCountry(body.name)
    return NextResponse.json({ country })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Klaida' }, { status: 400 })
  }
}
