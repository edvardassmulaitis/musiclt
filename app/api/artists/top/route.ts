/**
 * GET /api/artists/top?country=X&genre=Y&zodiac=Z&sort=recent&limit=20&includeRankFor=NN
 *
 * Grąžina top atlikėjus. Pagal default'ą sort'inta pagal score (desc).
 * Su sort=recent — sort'inama pagal 30d like aktyvumą (count(likes) per
 * artist where created_at >= NOW()-30d). Filtruojama pagal šalies, žanro
 * arba zodiako pavadinimą (arba visus tuščius — global'us top).
 *
 * Query params:
 *   country         — exact match (artists.country)
 *   genre           — name match per artist_genres JOIN (case-insensitive).
 *                     VEIKIA ir su substyle pavadinimais.
 *   zodiac          — LT zodiako pavadinimas (Skorpionas, Avinas...). Filtras
 *                     skaičiuojamas iš birth_date month/day diapazono — tik
 *                     solo atlikėjams su užpildytu birth_date.
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

// Zodiako datų diapazonai — month/day pairs. Reikšmės atitinka frontend'o
// zodiacOf() logiką BioFactsInline komponente.
// Format: [[startMonth, startDay, endMonth, endDay], ...] (gali būti 1-2 segmentai
// — Ožiaragis spans gruodis→sausis, todėl dvi)
const ZODIAC_RANGES: Record<string, Array<[number, number, number, number]>> = {
  'Avinas':       [[3, 21, 4, 19]],
  'Jautis':       [[4, 20, 5, 20]],
  'Dvyniai':      [[5, 21, 6, 20]],
  'Vėžys':        [[6, 21, 7, 22]],
  'Liūtas':       [[7, 23, 8, 22]],
  'Mergelė':      [[8, 23, 9, 22]],
  'Svarstyklės':  [[9, 23, 10, 22]],
  'Skorpionas':   [[10, 23, 11, 21]],
  'Šaulys':       [[11, 22, 12, 21]],
  'Ožiaragis':    [[12, 22, 12, 31], [1, 1, 1, 19]],
  'Vandenis':     [[1, 20, 2, 18]],
  'Žuvys':        [[2, 19, 3, 20]],
}

function matchesZodiac(birthDateISO: string, zodiac: string): boolean {
  const ranges = ZODIAC_RANGES[zodiac]
  if (!ranges) return false
  const d = new Date(birthDateISO)
  if (isNaN(d.getTime())) return false
  const m = d.getMonth() + 1
  const day = d.getDate()
  return ranges.some(([sm, sd, em, ed]) => {
    if (sm === em) {
      return m === sm && day >= sd && day <= ed
    }
    return (m === sm && day >= sd) || (m === em && day <= ed)
  })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const country = searchParams.get('country')?.trim() || null
  const genre = searchParams.get('genre')?.trim() || null
  const zodiac = searchParams.get('zodiac')?.trim() || null
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 20)))
  const includeRankFor = Number(searchParams.get('includeRankFor') || 0) || null
  const sort = (searchParams.get('sort')?.trim().toLowerCase() === 'recent') ? 'recent' : 'score'

  // Be filtrų — global'us top. Anksčiau buvo required, bet po user feedback
  // (2026-05-20) pridedam global mode'ą main PopBar'ui Hero zonoje.

  const sb = createAdminClient()

  // ── Zodiac filter — atitinka tik solo atlikėjus su užpildytu birth_date.
  // Filtravimas JS pusėje (PostgREST neturi EXTRACT month/day operatoriaus
  // be RPC). Fetch'inam solo atlikėjus su birth_date NOT NULL ir score > 0,
  // tada filter'inam pagal zodiako diapazoną. Output → zodiacArtistIds,
  // kuris intersect'inamas su kitais filter'iais žemiau.
  let zodiacArtistIds: number[] | null = null
  if (zodiac) {
    if (!ZODIAC_RANGES[zodiac]) {
      return NextResponse.json({ ok: true, items: [], total: 0 })
    }
    const PAGE_Z = 1000
    const ids: number[] = []
    let offset = 0
    while (true) {
      const { data: rows } = await sb
        .from('artists')
        .select('id, birth_date')
        .eq('type', 'solo')
        .gt('score', 0)
        .not('birth_date', 'is', null)
        .range(offset, offset + PAGE_Z - 1)
      const arr = (rows || []) as { id: number; birth_date: string }[]
      for (const a of arr) {
        if (matchesZodiac(a.birth_date, zodiac)) ids.push(a.id)
      }
      if (arr.length < PAGE_Z) break
      offset += PAGE_Z
      if (offset > 100000) break
    }
    zodiacArtistIds = ids
    if (zodiacArtistIds.length === 0) {
      return NextResponse.json({ ok: true, items: [], total: 0 })
    }
  }

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
      // PAGINUOTA — PostgREST grąžina max 1000 eilučių per request. Be
      // pagination'o populiarūs žanrai (rokas/hip-hop'as) prarasdavo dalį
      // atlikėjų → sąrašas/rank'as undercount'indavo (pvz. 2Pac dingdavo iš
      // JAV hip-hop'o, Kanye rodydavo #2 vietoj #4). Imam VISAS eilutes.
      const PAGE_G = 1000
      let off = 0
      while (true) {
        const { data: agRows } = await sb
          .from('artist_genres')
          .select('artist_id')
          .in('genre_id', genreIds)
          .range(off, off + PAGE_G - 1)
        const arr = (agRows || []) as any[]
        for (const r of arr) {
          if (r.artist_id) ids.add(r.artist_id)
        }
        if (arr.length < PAGE_G) break
        off += PAGE_G
        if (off > 200000) break
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
      const PAGE_S = 1000
      let off = 0
      while (true) {
        const { data: asRows } = await sb
          .from('artist_substyles')
          .select('artist_id')
          .in('substyle_id', substyleIds)
          .range(off, off + PAGE_S - 1)
        const arr = (asRows || []) as any[]
        for (const r of arr) {
          if (r.artist_id) ids.add(r.artist_id)
        }
        if (arr.length < PAGE_S) break
        off += PAGE_S
        if (off > 200000) break
      }
    }
    artistIdFilter = Array.from(ids)
    if (artistIdFilter.length === 0) {
      return NextResponse.json({ ok: true, items: [], total: 0 })
    }
  }

  // Intersect zodiac + genre prefilter'iai (jei abu yra). Tai užtikrina,
  // kad gauname tik tuos atlikėjus, kurie atitinka VISUS filter'ius.
  if (zodiacArtistIds && artistIdFilter) {
    const set = new Set(artistIdFilter)
    artistIdFilter = zodiacArtistIds.filter(id => set.has(id))
    if (artistIdFilter.length === 0) {
      return NextResponse.json({ ok: true, items: [], total: 0 })
    }
  } else if (zodiacArtistIds && !artistIdFilter) {
    artistIdFilter = zodiacArtistIds
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
    // 2026-05-21: Deterministic sort — primary recent_score DESC, tiebreaker
    // id ASC. Tai užtikrina, kad rank skaičiavimas (indexOf žemiau) sutaps
    // su list pozicijomis (anksčiau buvo non-deterministic ties → rank
    // mismatch headeryje vs list'e).
    candidateIds.sort((a, b) => {
      const sa = recentScore.get(a) || 0
      const sb = recentScore.get(b) || 0
      if (sa !== sb) return sb - sa
      return a - b
    })
    const topIds = candidateIds.slice(0, limit)

    // includeRankFor recent — rank pagal indexOf (exact match su list order).
    let myRankRecent: { rank: number; total: number } | null = null
    if (includeRankFor) {
      const idx = candidateIds.indexOf(includeRankFor)
      if (idx >= 0) {
        myRankRecent = { rank: idx + 1, total: candidateIds.length }
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

  // ── Score-sort branch ──────────────────────────────────────────────
  // Du keliai:
  //  (1) Su genre/zodiac filtru (artistIdFilter aktyvus) — NEDAROM didelio
  //      `.in(id, [tūkstančiai])` (URL limitas + PostgREST 1000-row cap
  //      praleisdavo atlikėjus). Vietoj to surenkam (id, score) chunk'ais po
  //      500, rikiuojam in-memory (score DESC, id ASC) — IDENTIŠKAI artist_rank
  //      RPC tiebreaker'iui — ir myRank = indexOf+1 (tiksliai sutampa su sąrašo
  //      pozicija ir su pill'o numeriu).
  //  (2) Be genre/zodiac (tik country arba global) — paprasta query su count.
  if (artistIdFilter) {
    const scoreById = new Map<number, number>()
    for (let i = 0; i < artistIdFilter.length; i += 500) {
      const chunk = artistIdFilter.slice(i, i + 500)
      let cq = sb.from('artists').select('id, score').gt('score', 0).in('id', chunk)
      if (country) cq = cq.eq('country', country)
      const { data: rows } = await cq
      for (const r of (rows || []) as { id: number; score: number | null }[]) {
        scoreById.set(r.id, Number(r.score) || 0)
      }
    }
    const sortedIds = Array.from(scoreById.keys()).sort((a, b) => {
      const sa = scoreById.get(a) || 0
      const sbb = scoreById.get(b) || 0
      if (sa !== sbb) return sbb - sa
      return a - b
    })
    let myRankF: { rank: number; total: number } | null = null
    if (includeRankFor) {
      const idx = sortedIds.indexOf(includeRankFor)
      if (idx >= 0) myRankF = { rank: idx + 1, total: sortedIds.length }
    }
    const topIds = sortedIds.slice(0, limit)
    let items: any[] = []
    if (topIds.length > 0) {
      const { data: details } = await sb
        .from('artists')
        .select('id, slug, name, country, cover_image_url, cover_image_position, score, type, is_verified')
        .in('id', topIds)
      const map = new Map<number, any>((details || []).map((a: any) => [a.id, a]))
      items = topIds.map(id => map.get(id)).filter(Boolean)
    }
    return NextResponse.json({
      ok: true,
      items,
      total: sortedIds.length,
      ...(myRankF ? { myRank: myRankF } : {}),
    })
  }

  // ── (2) Tik country arba global — paprasta query (be didelio .in()) ──
  let q = sb
    .from('artists')
    .select('id, slug, name, country, cover_image_url, cover_image_position, score, type, is_verified', { count: 'exact' })
    .gt('score', 0)
    .order('score', { ascending: false })
    .order('id', { ascending: true })
    .limit(limit)
  if (country) q = q.eq('country', country)

  const { data, error, count } = await q
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // includeRankFor — pozicija visame filtruotame sąraše (count requests).
  // above = score > myScore OR (score == myScore AND id < myId) — atitinka
  // 'score DESC, id ASC' tvarką.
  let myRank: { rank: number; total: number } | null = null
  if (includeRankFor) {
    const { data: my } = await sb
      .from('artists')
      .select('id, score')
      .eq('id', includeRankFor)
      .maybeSingle()
    if (my && (my.score || 0) > 0) {
      const myScore = Number(my.score)
      const myId = Number(my.id)
      let totalQ = sb.from('artists').select('id', { count: 'exact', head: true }).gt('score', 0)
      let aboveQ = sb.from('artists').select('id', { count: 'exact', head: true })
        .or(`score.gt.${myScore},and(score.eq.${myScore},id.lt.${myId})`)
        .gt('score', 0)
      if (country) {
        totalQ = totalQ.eq('country', country)
        aboveQ = aboveQ.eq('country', country)
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
