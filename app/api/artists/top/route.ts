/**
 * GET /api/artists/top?country=X&genre=Y&sort=recent&limit=20&includeRankFor=NN
 *
 * Grąžina top atlikėjus. Pagal default'ą sort'inta pagal score (desc).
 * Su sort=recent — sort'inama pagal 30d like aktyvumą (count(likes) per
 * artist where created_at >= NOW()-30d). Filtruojama pagal šalies arba
 * žanro pavadinimą (arba abu tuščius — global'us top).
 *
 * Query params:
 *   country         — exact match (artists.country)
 *   genre           — name match per artist_genres JOIN (case-insensitive).
 *                     VEIKIA ir su substyle pavadinimais.
 *   sort            — 'score' (default) arba 'recent' (30d like activity)
 *   limit           — default 20, max 50
 *   includeRankFor  — artist ID; grąžinam papildomai myRank.rank+total
 *                     (vieta visame filtruotame sąraše, ne tik limit'e).
 *                     Recent sort'ui rank computed iš 30d like count'ų.
 *
 * Response: { ok, items: [{ id, slug, name, country, cover_image_url,
 *             score, type, is_verified, recent_likes? }], total, myRank? }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const country = searchParams.get('country')?.trim() || null
  const genre = searchParams.get('genre')?.trim() || null
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 20)))
  const includeRankFor = Number(searchParams.get('includeRankFor') || 0) || null
  const sort = (searchParams.get('sort')?.trim().toLowerCase() === 'recent') ? 'recent' : 'score'

  // Be filtrų — global'us top. Anksčiau buvo required, bet po user feedback
  // (2026-05-20) pridedam global mode'ą main PopBar'ui Hero zonoje.

  const sb = createAdminClient()

  // ── Genre filter — surenkam artist_id'us iš artist_genres / artist_substyles
  // pirmyn (tarsi prefilter'is). Tada main query'ė pasiima artists su tais id.
  let artistIdFilter: number[] | null = null
  if (genre) {
    const ids = new Set<number>()
    // Genres lentelė
    const { data: gRows } = await sb
      .from('genres')
      .select('id')
      .ilike('name', genre)
      .limit(5)
    const genreIds = (gRows || []).map((g: any) => g.id).filter(Boolean)
    if (genreIds.length > 0) {
      const { data: agRows } = await sb
        .from('artist_genres')
        .select('artist_id')
        .in('genre_id', genreIds)
      for (const r of (agRows || []) as any[]) {
        if (r.artist_id) ids.add(r.artist_id)
      }
    }
    // Substyles lentelė
    const { data: sRows } = await sb
      .from('substyles')
      .select('id')
      .ilike('name', genre)
      .limit(5)
    const substyleIds = (sRows || []).map((s: any) => s.id).filter(Boolean)
    if (substyleIds.length > 0) {
      const { data: asRows } = await sb
        .from('artist_substyles')
        .select('artist_id')
        .in('substyle_id', substyleIds)
      for (const r of (asRows || []) as any[]) {
        if (r.artist_id) ids.add(r.artist_id)
      }
    }
    artistIdFilter = Array.from(ids)
    if (artistIdFilter.length === 0) {
      return NextResponse.json({ ok: true, items: [], total: 0 })
    }
  }

  // ── sort=recent branch — top atlikėjai pagal pastarųjų 2 metų performance ─
  // Recent score formulė (atitinka getRecentPopBarLevel page.tsx'e):
  //    sum(tracks.score WHERE release_year >= sinceYear)
  //  + sum(albums.score WHERE year >= sinceYear)
  //  + count(awards) * 50  (50pt už kiekvieną nominaciją/laimėjimą)
  //
  // Performance: 3 parallel paginated fetch'ai + JS aggregation. LT scene'oje
  // tracks released last 2y maždaug 500-2000 įrašų; albums ~100-300; awards
  // ~50-150. Total Network 1-3 round-trips per source.
  if (sort === 'recent') {
    const sinceYear = new Date().getFullYear() - 2
    const PAGE = 1000

    const recentScore = new Map<number, number>()

    // Tracks
    {
      let offset = 0
      while (true) {
        const { data: rows } = await sb
          .from('tracks')
          .select('artist_id, score')
          .gte('release_year', sinceYear)
          .range(offset, offset + PAGE - 1)
        const arr = (rows || []) as { artist_id: number; score: number | null }[]
        for (const r of arr) {
          if (!r.artist_id) continue
          recentScore.set(r.artist_id, (recentScore.get(r.artist_id) || 0) + (Number(r.score) || 0))
        }
        if (arr.length < PAGE) break
        offset += PAGE
        if (offset > 100000) break
      }
    }
    // Albums
    {
      let offset = 0
      while (true) {
        const { data: rows } = await sb
          .from('albums')
          .select('artist_id, score')
          .gte('year', sinceYear)
          .range(offset, offset + PAGE - 1)
        const arr = (rows || []) as { artist_id: number; score: number | null }[]
        for (const r of arr) {
          if (!r.artist_id) continue
          recentScore.set(r.artist_id, (recentScore.get(r.artist_id) || 0) + (Number(r.score) || 0))
        }
        if (arr.length < PAGE) break
        offset += PAGE
        if (offset > 100000) break
      }
    }
    // Awards — voting_participants joined to editions.year
    {
      let offset = 0
      while (true) {
        const { data: rows } = await sb
          .from('voting_participants')
          .select('artist_id, voting_events!inner(voting_editions!inner(year))')
          .gte('voting_events.voting_editions.year', sinceYear)
          .range(offset, offset + PAGE - 1)
        const arr = (rows || []) as any[]
        for (const r of arr) {
          if (!r.artist_id) continue
          recentScore.set(r.artist_id, (recentScore.get(r.artist_id) || 0) + 50)
        }
        if (arr.length < PAGE) break
        offset += PAGE
        if (offset > 100000) break
      }
    }

    // Apply genre filter (intersect)
    let candidateIds = Array.from(recentScore.keys()).filter(id => (recentScore.get(id) || 0) > 0)
    if (artistIdFilter) {
      const set = new Set(artistIdFilter)
      candidateIds = candidateIds.filter(id => set.has(id))
    }
    // Apply country filter — fetch artists per ID and filter
    if (country && candidateIds.length > 0) {
      const ctxIds: number[] = []
      for (let i = 0; i < candidateIds.length; i += 500) {
        const chunk = candidateIds.slice(i, i + 500)
        const { data: aRows } = await sb
          .from('artists')
          .select('id')
          .eq('country', country)
          .in('id', chunk)
        for (const r of (aRows || []) as { id: number }[]) ctxIds.push(r.id)
      }
      candidateIds = ctxIds
    }
    candidateIds.sort((a, b) => (recentScore.get(b) || 0) - (recentScore.get(a) || 0))
    const topIds = candidateIds.slice(0, limit)

    // includeRankFor recent — rank pagal recent_score
    let myRankRecent: { rank: number; total: number } | null = null
    if (includeRankFor) {
      const myScore = recentScore.get(includeRankFor) || 0
      if (myScore > 0) {
        const above = candidateIds.filter(id => (recentScore.get(id) || 0) > myScore).length
        myRankRecent = { rank: above + 1, total: candidateIds.length }
      }
    }

    if (topIds.length === 0) {
      return NextResponse.json({
        ok: true,
        items: [],
        total: candidateIds.length,
        ...(myRankRecent ? { myRank: myRankRecent } : {}),
      })
    }

    // Fetch artist details
    const { data: artistsData } = await sb
      .from('artists')
      .select('id, slug, name, country, cover_image_url, cover_image_position, score, type, is_verified')
      .in('id', topIds)
    const map = new Map<number, any>((artistsData || []).map((a: any) => [a.id, a]))
    const items = topIds
      .map(id => {
        const a = map.get(id)
        return a ? { ...a, recent_score: Math.round(recentScore.get(id) || 0) } : null
      })
      .filter(Boolean)

    return NextResponse.json({
      ok: true,
      items,
      total: candidateIds.length,
      ...(myRankRecent ? { myRank: myRankRecent } : {}),
    })
  }

  // ── Main artists query (filtruojam pagal country + artistIdFilter, sort
  // by score desc). PostgREST max-rows = 1000 — limit'as <= 50, nieks nesilauš.
  let q = sb
    .from('artists')
    .select('id, slug, name, country, cover_image_url, cover_image_position, score, type, is_verified', { count: 'exact' })
    .gt('score', 0)
    .order('score', { ascending: false })
    .limit(limit)

  if (country) q = q.eq('country', country)
  if (artistIdFilter) q = q.in('id', artistIdFilter)

  const { data, error, count } = await q
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // includeRankFor — papildomai grąžinam atlikėjo poziciją (rank) visame
  // filtruotame sąraše, ne tik top 20. Naudojam count() requests, nes 12k
  // atlikėjų į memory load'inti vien dėl rank skaičiavimo per brangu.
  let myRank: { rank: number; total: number } | null = null
  if (includeRankFor) {
    // Mūsų atlikėjo score
    const { data: my } = await sb
      .from('artists')
      .select('id, score')
      .eq('id', includeRankFor)
      .maybeSingle()
    if (my && (my.score || 0) > 0) {
      const myScore = Number(my.score)
      // Total filtered + count su didesniu score
      let totalQ = sb.from('artists').select('id', { count: 'exact', head: true }).gt('score', 0)
      let aboveQ = sb.from('artists').select('id', { count: 'exact', head: true }).gt('score', myScore)
      if (country) {
        totalQ = totalQ.eq('country', country)
        aboveQ = aboveQ.eq('country', country)
      }
      if (artistIdFilter) {
        totalQ = totalQ.in('id', artistIdFilter)
        aboveQ = aboveQ.in('id', artistIdFilter)
      }
      const [{ count: totalCount }, { count: aboveCount }] = await Promise.all([totalQ, aboveQ])
      myRank = {
        rank: (aboveCount || 0) + 1,
        total: totalCount || 0,
      }
    }
  }

  return NextResponse.json({
    ok: true,
    items: (data || []) as any[],
    total: count || 0,
    ...(myRank ? { myRank } : {}),
  })
}
