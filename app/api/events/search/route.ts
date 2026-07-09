// app/api/events/search/route.ts
// Renginių typeahead paieška — nariams susiejant „matyti gyvai" įrašą su
// konkrečiu renginiu. Reikalauja prisijungimo (kad nebūtų viešo scrape'o).
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '../../mano-muzika/_auth'
import { searchEvents } from '@/lib/supabase-events'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })

  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  if (q.length < 2) return NextResponse.json({ results: [] })

  try {
    const rows = await searchEvents(q, 12)
    const results = rows.map((e: any) => ({
      id: e.id,
      title: e.title,
      slug: e.slug,
      start_date: e.start_date ?? null,
      city: e.city ?? null,
    }))
    return NextResponse.json({ results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, results: [] }, { status: 500 })
  }
}
