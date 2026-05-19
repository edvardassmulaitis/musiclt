/**
 * GET /api/artists/top?country=X&genre=Y&limit=20
 *
 * Grąžina top atlikėjus, surūšiuotus pagal score (desc), filtruotus pagal
 * šalies arba žanro pavadinimą. Naudojamas TopArtistsModal Hero zonoje
 * atlikėjo puslapyje — paspaudus šalies vėliavą ar žanro chip'ą.
 *
 * Query params:
 *   country  — exact match (artists.country)
 *   genre    — name match per artist_genres JOIN (case-insensitive)
 *              VEIKIA ir su substyle pavadinimais — artist_substyles JOIN'ą
 *              tikrinam paraleliai ir grąžinam union'ą (kad „Funk metal"
 *              substyle paspaudus rodytų ne tuščią sąrašą)
 *   limit    — default 20, max 50
 *
 * Response: { ok, items: [{ id, slug, name, country, cover_image_url,
 *             score, type }], total }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const country = searchParams.get('country')?.trim() || null
  const genre = searchParams.get('genre')?.trim() || null
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 20)))

  if (!country && !genre) {
    return NextResponse.json({ error: 'country or genre required' }, { status: 400 })
  }

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

  return NextResponse.json({
    ok: true,
    items: (data || []) as any[],
    total: count || 0,
  })
}
