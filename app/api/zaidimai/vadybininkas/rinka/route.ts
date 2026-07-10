// app/api/zaidimai/vadybininkas/rinka/route.ts
//
// Fantasy lygos RINKA — visi LT atlikėjai su kainomis ir realiais rezultatais.
//   GET ?q=&salis=visi|lt|uzsienio&rusiavimas=populiariausi|forma|siulomi&tikIperkami=1&biudzetas=N&puslapis=0
//   „forma" — praėjusios savaitės taškų lyderiai; „siūlomi" — tavo sekami
//   atlikėjai (prisijungus) + formos lyderiai. Kaina kinta kas savaitę.
//
// Grąžina: kaina (iš score), praėjusios savaitės oficialūs taškai,
// kylančiojo žyma, ar jau mano komandoje. Nuo v3 — ir pasaulio atlikėjai.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { resolveViewer } from '@/lib/zaidimai'
import { priceFor, weekStartOf, prevWeekStart } from '@/lib/fantasy'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 30

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').trim()
  const page = Math.max(0, parseInt(url.searchParams.get('puslapis') || '0') || 0)
  const sort = url.searchParams.get('rusiavimas') || 'populiariausi'
  const salis = url.searchParams.get('salis') || 'visi'
  const tikIperkami = url.searchParams.get('tikIperkami') === '1'
  const biudzetas = parseInt(url.searchParams.get('biudzetas') || '0') || 0

  const viewer = await resolveViewer()
  const sb = createAdminClient()
  const lastWeek = prevWeekStart(weekStartOf())

  const salisFilter = (qq: any) => {
    if (salis === 'lt') return qq.eq('country', 'Lietuva')
    if (salis === 'uzsienio') return qq.neq('country', 'Lietuva')
    return qq
  }

  let artists: any[] = []
  let count = 0
  let inMemory = false // in-memory kelias: puslapiuojam PO iperkamumo filtro
  const ptsByArtist = new Map<number, number>()

  if (sort === 'forma' || sort === 'siulomi') {
    // Pagal PRAĖJUSIOS SAVAITĖS formą: pirmiausia taškų lyderiai, tada atlikėjai
    const { data: topPts } = await sb
      .from('fantasy_artist_weeks')
      .select('artist_id, total_points')
      .eq('week_start', lastWeek)
      .order('total_points', { ascending: false })
      .limit(400)
    for (const p of topPts || []) ptsByArtist.set(p.artist_id, p.total_points)
    let ids = Array.from(ptsByArtist.keys())

    // „Siūlomi": tavo sekami/mėgstami atlikėjai — į priekį
    let followedFirst: number[] = []
    if (sort === 'siulomi' && viewer.userId) {
      const [fRes, favRes] = await Promise.all([
        sb.from('artist_follows').select('artist_id').eq('user_id', viewer.userId).limit(200),
        sb.from('profile_favorite_artists').select('artist_id').eq('profile_id', viewer.userId).limit(200),
      ])
      const fset = new Set<number>([
        ...((fRes.data || []) as any[]).map(r => r.artist_id),
        ...((favRes.data || []) as any[]).map(r => r.artist_id),
      ])
      followedFirst = Array.from(fset)
      ids = [...followedFirst, ...ids.filter(i => !fset.has(i))]
    }

    let aq = sb.from('artists')
      .select('id, name, slug, cover_image_url, score, score_trending, country')
      .in('id', ids.slice(0, 300))
      .gt('score', 0)
    aq = salisFilter(aq)
    if (q) aq = aq.ilike('name', `%${q}%`)
    const { data: arows } = await aq
    const byId = new Map((arows || []).map((a: any) => [a.id, a]))
    const followedSet = new Set(followedFirst)
    const ordered = ids.map(i => byId.get(i)).filter(Boolean) as any[]
    // Sekami — viršuje, likusieji pagal formą
    ordered.sort((a, b) => {
      const af = followedSet.has(a.id) ? 1 : 0
      const bf = followedSet.has(b.id) ? 1 : 0
      if (af !== bf) return bf - af
      return (ptsByArtist.get(b.id) || 0) - (ptsByArtist.get(a.id) || 0)
    })
    count = ordered.length
    artists = ordered
    inMemory = true
  } else {
    let query = sb
      .from('artists')
      .select('id, name, slug, cover_image_url, score, score_trending, country', { count: 'exact' })
      .gt('score', 0)
    query = salisFilter(query)
    if (q) query = query.ilike('name', `%${q}%`)
    // Iperkamumo prefiltras DB lygmeny — kitaip filtruotume tik po puslapiavimo
    // ir puslapis likdavo beveik tuscias (kaina = 0.35*score + 0.9*forma >= 0.35*score)
    if (tikIperkami && biudzetas > 0) query = query.lte('score', Math.ceil(biudzetas / 0.35))
    query = query
      .order('score', { ascending: sort === 'pigiausi', nullsFirst: false })
      .order('name', { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    const res = await query
    artists = res.data || []
    count = res.count || 0
    const ids = artists.map(a => a.id)
    if (ids.length) {
      const { data: pts } = await sb
        .from('fantasy_artist_weeks')
        .select('artist_id, total_points')
        .eq('week_start', lastWeek)
        .in('artist_id', ids)
      for (const p of pts || []) ptsByArtist.set(p.artist_id, p.total_points)
    }
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
    price: priceFor(a.score, ptsByArtist.get(a.id) ?? 0),
    country: (a as any).country === 'Lietuva' ? 'LT' : 'užsienio',
    lastWeekPoints: ptsByArtist.get(a.id) ?? null,
    trending: (a.score_trending || 0) >= trendCut && (a.score_trending || 0) > 0,
    onMyRoster: myArtistIds.has(a.id),
  }))

  if (tikIperkami && biudzetas > 0) {
    // rodom TIK ka realiai gali nusipirkti (savu komandos nariu nerodom)
    list = list.filter(a => !a.onMyRoster && a.price <= biudzetas)
    if (inMemory) count = list.length
  }
  if (inMemory) {
    if (!(tikIperkami && biudzetas > 0)) count = list.length
    list = list.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  }

  return NextResponse.json({
    artists: list,
    page,
    pageSize: PAGE_SIZE,
    total: count || 0,
    lastWeek,
  })
}
