/**
 * GET /api/home/list
 *
 * Pilnas (paginuotas) sąrašas homepage'o „Naujos dainos" / „Nauji albumai" /
 * „Greitai pasirodys" modalams. Praplečia /api/home/latest (kuris grąžina tik
 * ~10 įrašų per lane) — čia grąžinam VISĄ filtruotą rinkinį su žanro facet'ais,
 * like_count'ais ir rūšiavimu, + offset/limit pagination ("Rodyti daugiau").
 *
 * Query params:
 *   type   = tracks | albums | upcoming   (default tracks)
 *   lane   = lt | world                   (upcoming nepaiso lane)
 *   genre  = žanro pavadinimas (filtras)  (tuščias = visi)
 *   sort   = new | liked | az             (default new)
 *   offset = 0                            (pagination)
 *   limit  = 100                          (max 200)
 *
 * Atsakas: { items: [...], total, genres: [{ name, count }] }
 *
 * ⚡ PERFORMANCE (2026-06-29): visas sunkus enrichment'as suvyniotas į
 *   `getHomeListEnriched` (lib/home-latest.ts, unstable_cache 6h + CRON warm),
 *   todėl modalas atsidaro IŠKART. Čia liko tik žanro filtras + sort + pagination
 *   atmintyje ant cache'into rinkinio.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getHomeListEnriched, type HomeListType, type HomeLane } from '@/lib/home-latest'

type Sort = 'new' | 'liked' | 'az'

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams
    const type = (sp.get('type') || 'tracks') as HomeListType
    const lane = (sp.get('lane') || 'lt') as HomeLane
    const genre = (sp.get('genre') || '').trim()
    const sort = (sp.get('sort') || 'new') as Sort
    const offset = Math.max(0, parseInt(sp.get('offset') || '0', 10) || 0)
    const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') || '100', 10) || 100))

    // Cache'intas (warm) pilnas enriched rinkinys, jau „new" tvarka + žanro facet'ai.
    const { rows, genres } = await getHomeListEnriched(type, lane)

    // Filtras pagal žanrą.
    let filtered = genre
      ? rows.filter(r => (r.genres as string[]).includes(genre))
      : rows

    // Rūšiavimas (rows jau „new"; perrūšiuojam tik kitiems).
    if (sort === 'liked') {
      const nowMs = Date.now()
      const windowMs = 90 * 86_400_000
      filtered = [...filtered].sort((a, b) => {
        const scoreOf = (r: any) => {
          const dateMs = new Date(r.video_uploaded_at || r.release_date || (r.year ? `${r.year}-01-01` : '1970-01-01')).getTime()
          const freshness = Math.max(0, Math.min(1, (dateMs - (nowMs - windowMs)) / windowMs))
          const popArtist = Math.min(1, (r.artists?.score || 0) / 80)
          const popViews = (r.views || 0) > 0 ? Math.min(1, Math.log10(r.views) / 8) : 0
          const popularity = popArtist * 0.7 + popViews * 0.3
          return freshness * 0.7 + popularity * 0.3
        }
        return scoreOf(b) - scoreOf(a)
      })
    } else if (sort === 'az') {
      filtered = [...filtered].sort((a, b) =>
        String(a.title || '').localeCompare(String(b.title || ''), 'lt'),
      )
    }

    const total = filtered.length
    const items = filtered.slice(offset, offset + limit)

    return NextResponse.json(
      { items, total, genres },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
          'CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
          'Vercel-CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
        },
      },
    )
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
