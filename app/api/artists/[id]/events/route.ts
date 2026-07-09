// app/api/artists/[id]/events/route.ts
// GET — atlikėjo renginiai iš DB, naujausi pirmi. Naudojama „Matyti gyvai"
// wizard'e: pasirinkus atlikėją, parodom jo koncertus greitam pasirinkimui.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const artistId = Number(id)
  if (!Number.isFinite(artistId)) return NextResponse.json({ events: [] })

  try {
    const sb = createAdminClient()
    const { data, error } = await sb
      .from('event_artists')
      .select('events(id, title, slug, start_date, venue_name, city, cover_image_url, is_festival)')
      .eq('artist_id', artistId)
      .limit(60)
    if (error) throw error

    const events = (data || [])
      .map((r: any) => r.events)
      .filter(Boolean)
      .sort((a: any, b: any) => String(b.start_date || '').localeCompare(String(a.start_date || '')))
      .slice(0, 24)

    return NextResponse.json({ events }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, events: [] }, { status: 500 })
  }
}
