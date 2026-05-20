/**
 * GET /api/artists/top?country=X&genre=Y&limit=20&includeRankFor=NN
 *
 * Grąžina top atlikėjus, surūšiuotus pagal score (desc), filtruotus pagal
 * šalies arba žanro pavadinimą (arba abu tuščius — tada global'us top).
 * Naudojamas TopArtistsModal Hero zonoje atlikėjo puslapyje — paspaudus
 * šalies vėliavą, žanro chip'ą arba pagrindinį PopBar'ą.
 *
 * Query params:
 *   country         — exact match (artists.country)
 *   genre           — name match per artist_genres JOIN (case-insensitive)
 *                     VEIKIA ir su substyle pavadinimais — artist_substyles
 *                     JOIN'ą tikrinam paraleliai ir grąžinam union'ą.
 *   limit           — default 20, max 50
 *   includeRankFor  — artist ID; grąžinam papildomai myRank.rank+total
 *                     (vieta visame filtruotame sąraše, ne tik limit'e)
 *
 * Response: { ok, items: [{ id, slug, name, country, cover_image_url,
 *             score, type, is_verified }], total, myRank? }
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
