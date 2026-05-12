// app/api/admin/migration/stats/route.ts
//
// Migration progress dashboard data: kiek atlikėjų jau "sutvarkyta" (LT:
// scrape ✓; INTL: wiki ✓ + scrape ✓), kiek dar laukia. Plius prioritetinis
// sąrašas — top N nedarytų atlikėjų sortintas pagal `legacy_likes` desc
// (pripildytas per scraper/quick_artist_stats.py).
//
// Šaltinis: `public.v_artist_migration_status` view (žr. migration
// 20260512_artist_migration_stats.sql), kuri agreguoja per-artist
// has_legacy_track / has_wiki_track / has_legacy_album / has_wiki_album.
//
// Cache: 60s — view aggregation'as ant 12k atlikėjų yra ~50-200ms, bet
// admin gali atnaujinti dashboard'ą dažnai. Cache'as `cache: 'no-store'`
// nereikalingas — dashboard'as ne user-facing.
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

type ArtistRow = {
  id: number
  name: string | null
  slug: string | null
  legacy_id: number | null
  country: string | null
  source: string | null
  legacy_likes: number | null
  legacy_comments: number | null
  legacy_discussion_count: number | null
  legacy_news_count: number | null
  legacy_concert_count: number | null
  legacy_stats_at: string | null
  track_count: number | null
  album_count: number | null
  is_lt: boolean
  scrape_done: boolean
  wiki_done: boolean
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const priorityLimit = Math.min(200, Math.max(1, Number(url.searchParams.get('priority_limit') || 25)))

  const sb = createAdminClient()

  // Pull visus 12k atlikėjų iš view'o vienu request'u. PostgREST default
  // cap'as yra 1000 — naudojam pagination su PAGE=1000 (žr.
  // feedback_postgrest_max_rows.md).
  const PAGE = 1000
  const all: ArtistRow[] = []
  let offset = 0
  while (true) {
    const { data, error } = await sb
      .from('v_artist_migration_status')
      .select('*')
      .range(offset, offset + PAGE - 1)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const rows = (data || []) as ArtistRow[]
    all.push(...rows)
    if (rows.length < PAGE) break
    offset += PAGE
  }

  // Agreguojame counter'ius
  const ltAll = all.filter(a => a.is_lt)
  const intlAll = all.filter(a => !a.is_lt)

  const ltDone = ltAll.filter(a => a.scrape_done).length
  // INTL "done" = ir scrape, ir wiki padaryti
  const intlDone = intlAll.filter(a => a.scrape_done && a.wiki_done).length
  const intlWikiOnly = intlAll.filter(a => a.wiki_done && !a.scrape_done).length
  const intlScrapeOnly = intlAll.filter(a => a.scrape_done && !a.wiki_done).length

  // Atlikėjai be legacy_id — jie negali būti scrape'inami iš senos sistemos
  // (manualiai sukurti). Į migration progress neįtraukiam, bet rodome counter'į.
  const noLegacy = all.filter(a => a.legacy_id == null).length

  // Prioritetinis sąrašas — atlikėjai, kuriems trūksta darbų, sortintas
  // pagal legacy_likes desc (NULL'us nustumiame į galą).
  const priority = all
    .filter(a => a.legacy_id != null)
    .filter(a => a.is_lt ? !a.scrape_done : !(a.scrape_done && a.wiki_done))
    .sort((x, y) => {
      const xl = x.legacy_likes ?? -1
      const yl = y.legacy_likes ?? -1
      if (xl !== yl) return yl - xl
      // Tie-breaker — discussions count, kad UI būtų stable
      return (y.legacy_discussion_count ?? 0) - (x.legacy_discussion_count ?? 0)
    })
    .slice(0, priorityLimit)
    .map(a => ({
      id: a.id,
      name: a.name,
      slug: a.slug,
      country: a.country,
      kind: a.is_lt ? 'lt' : 'intl' as 'lt' | 'intl',
      legacy_likes: a.legacy_likes,
      legacy_comments: a.legacy_comments,
      legacy_discussion_count: a.legacy_discussion_count,
      legacy_news_count: a.legacy_news_count,
      missing: [
        ...(a.scrape_done ? [] : ['scrape']),
        ...(!a.is_lt && !a.wiki_done ? ['wiki'] : []),
      ] as ('scrape' | 'wiki')[],
      track_count: a.track_count ?? 0,
      album_count: a.album_count ?? 0,
    }))

  // Stats freshness: kiek atlikėjų turi legacy_stats_at
  const statsCovered = all.filter(a => a.legacy_stats_at != null).length

  return NextResponse.json({
    total: {
      artists: all.length,
      with_legacy_id: all.length - noLegacy,
      no_legacy_id: noLegacy,
      done: ltDone + intlDone,
      pct: all.length > 0 ? Math.round(((ltDone + intlDone) / all.length) * 1000) / 10 : 0,
    },
    lt: {
      total: ltAll.length,
      done: ltDone,
      pending: ltAll.length - ltDone,
      pct: ltAll.length > 0 ? Math.round((ltDone / ltAll.length) * 1000) / 10 : 0,
    },
    intl: {
      total: intlAll.length,
      done: intlDone,
      wiki_only: intlWikiOnly,
      scrape_only: intlScrapeOnly,
      pending: intlAll.length - intlDone,
      pct: intlAll.length > 0 ? Math.round((intlDone / intlAll.length) * 1000) / 10 : 0,
    },
    priority_signal: {
      // Kiek atlikėjų turi legacy_likes pripildytus (svarbu prioritetiniam sąrašui)
      stats_covered: statsCovered,
      stats_missing: all.length - statsCovered,
      pct: all.length > 0 ? Math.round((statsCovered / all.length) * 1000) / 10 : 0,
    },
    priority,
  })
}
