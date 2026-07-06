// app/api/zaidimai/vadybininkas/atlikejas/route.ts
//
// Atlikėjo kortelė vadybininko lygoje — detalės modalui:
//   GET ?id=123 → savaitinių taškų istorija (iki 8 sav.), einamosios savaitės
//   išskaidymas gyvai, kaina, paskutinių savaičių įvykiai (topų pozicijos).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { priceFor, weekStartOf, prevWeekStart, computeArtistWeekPoints } from '@/lib/fantasy'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const id = parseInt(new URL(req.url).searchParams.get('id') || '')
  if (!id) return NextResponse.json({ error: 'Netinkama užklausa' }, { status: 400 })

  const sb = createAdminClient()
  const { data: artist } = await sb
    .from('artists')
    .select('id, name, slug, cover_image_url, score, score_trending, country')
    .eq('id', id)
    .maybeSingle()
  if (!artist) return NextResponse.json({ error: 'Atlikėjas nerastas' }, { status: 404 })

  const thisWeek = weekStartOf()
  const lastWeek = prevWeekStart(thisWeek)

  const [weeksRes, liveMap] = await Promise.all([
    sb.from('fantasy_artist_weeks')
      .select('week_start, total_points, chart_points, yt_points, release_points, base_points, details')
      .eq('artist_id', id)
      .order('week_start', { ascending: false })
      .limit(8),
    computeArtistWeekPoints([id], thisWeek, { live: true }),
  ])

  const weeks = (weeksRes.data || []).reverse() // chronologine tvarka grafikui
  const live = liveMap.get(id) || null
  const lastPts = (weeksRes.data || []).find((w: any) => w.week_start === lastWeek)?.total_points ?? 0

  // Paskutiniai realūs įvykiai (topų pozicijos iš details)
  const events: Array<{ week: string; text: string }> = []
  for (const w of (weeksRes.data || []).slice(0, 3)) {
    for (const e of ((w as any).details?.chart_entries || []).slice(0, 3)) {
      events.push({
        week: (w as any).week_start,
        text: e.chart ? `${e.chart}: #${e.pos}${e.title ? ` — „${e.title}“` : ''}` : `${e.top === 'top40' ? 'TOP40' : 'TOP30'}: #${e.pos}${e.title ? ` — „${e.title}“` : ''}`,
      })
    }
    if (((w as any).details?.releases || 0) > 0) {
      events.push({ week: (w as any).week_start, text: `Naujos dainos: ${(w as any).details.releases}` })
    }
  }

  return NextResponse.json({
    artist: {
      id: artist.id,
      name: artist.name,
      slug: artist.slug,
      image: artist.cover_image_url,
      country: artist.country === 'Lietuva' ? 'LT' : 'užsienio',
      price: priceFor(artist.score, lastPts),
    },
    weeks: weeks.map((w: any) => ({ week: w.week_start, points: w.total_points })),
    live: live ? {
      total: live.total_points,
      chart: live.chart_points,
      yt: live.yt_points,
      rel: live.release_points,
      base: live.base_points,
    } : null,
    events: events.slice(0, 6),
  })
}
