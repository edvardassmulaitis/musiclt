// app/api/zaidimai/vadybininkas/rinka/route.ts
//
// Fantasy lygos RINKA — visi LT atlikėjai su kainomis ir realiais rezultatais.
//   GET ?q=paieška&rusiavimas=kaina|forma&puslapis=0
//
// Grąžina: kaina (iš score), praėjusios savaitės oficialūs taškai,
// trending žyma, ar jau mano komandoje.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { resolveViewer } from '@/lib/zaidimai'
import { priceOf, weekStartOf, prevWeekStart } from '@/lib/fantasy'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 30

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').trim()
  const page = Math.max(0, parseInt(url.searchParams.get('puslapis') || '0') || 0)
  const sort = url.searchParams.get('rusiavimas') || 'kaina'

  const viewer = await resolveViewer()
  const sb = createAdminClient()

  let query = sb
    .from('artists')
    .select('id, name, slug, cover_image_url, score, score_trending', { count: 'exact' })
    .eq('country', 'Lietuva')
    .gt('score', 0)

  if (q) query = query.ilike('name', `%${q}%`)
  query = query
    .order('score', { ascending: sort === 'pigiausi', nullsFirst: false })
    .order('name', { ascending: true })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

  const { data: artists, count } = await query
  const ids = (artists || []).map(a => a.id)

  // Praėjusios savaitės oficialūs taškai
  const lastWeek = prevWeekStart(weekStartOf())
  const ptsByArtist = new Map<number, number>()
  if (ids.length) {
    const { data: pts } = await sb
      .from('fantasy_artist_weeks')
      .select('artist_id, total_points')
      .eq('week_start', lastWeek)
      .in('artist_id', ids)
    for (const p of pts || []) ptsByArtist.set(p.artist_id, p.total_points)
  }

  // Mano roster'io žymos
  const myArtistIds = new Set<number>()
  {
    let tq = sb.from('fantasy_teams').select('id')
    if (viewer.userId) tq = tq.eq('user_id', viewer.userId)
    else if (viewer.anonId) tq = tq.eq('anon_id', viewer.anonId)
    const { data: team } = await tq.maybeSingle()
    if (team) {
      const { data: roster } = await sb
        .from('fantasy_roster')
        .select('artist_id')
        .eq('team_id', team.id)
        .is('released_at', null)
      for (const r of roster || []) myArtistIds.add(r.artist_id)
    }
  }

  // Trending riba (top ~20% pagal trending tarp turinčių)
  const trendVals = (artists || []).map(a => a.score_trending || 0).filter(v => v > 0).sort((a, b) => b - a)
  const trendCut = trendVals[Math.floor(trendVals.length * 0.3)] || Infinity

  let list = (artists || []).map(a => ({
    id: a.id,
    name: a.name,
    slug: a.slug,
    image: a.cover_image_url || null,
    price: priceOf(a.score),
    lastWeekPoints: ptsByArtist.get(a.id) ?? null,
    trending: (a.score_trending || 0) >= trendCut && (a.score_trending || 0) > 0,
    onMyRoster: myArtistIds.has(a.id),
  }))

  if (sort === 'forma') {
    // Puslapio ribose pagal praėjusios savaitės taškus
    list = list.sort((a, b) => (b.lastWeekPoints || 0) - (a.lastWeekPoints || 0))
  }

  return NextResponse.json({
    artists: list,
    page,
    pageSize: PAGE_SIZE,
    total: count || 0,
    lastWeek,
  })
}
