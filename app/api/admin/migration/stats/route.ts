// app/api/admin/migration/stats/route.ts
//
// Migration progress dashboard data — 3 buckets (LT / INTL / Unknown).
//
// Query params:
//   bucket  = 'lt' | 'intl' | 'unknown' | 'all' (default: 'all')
//   status  = 'done' | 'pending' | 'all'        (default: 'all' summary; 'pending' priority list)
//   limit   = N priority/list items             (default: 50, cap: 500)
//   offset  = pagination offset                  (default: 0)
//
// Done kriterijai (v3 — 2026-05-21):
//   LT      done = scrape_done AND hero_done AND photo_done AND score_done
//   INTL    done = scrape_done AND wiki_done AND hero_done AND photo_done AND score_done
//   Unknown done = scrape_done AND wiki_done AND hero_done AND photo_done AND score_done
//
// Coverage % (lyrics_pct, yt_pct, yt_views_pct) NĖRA done blocker —
// rodomi kaip warning indicators UI'e, kad būtų matyti, kur santykiai mažu
// = potencialiai trūksta enrichment'o (lyrics ar YT match).
//
// Dedupe: priority/list naudoja `dedup_key` (lower(trim(name))) — UI rodo
// vieną rep per name + `dup_count`. Viskas DB lygyje galioja toliau —
// dedupe TIK display optimizacija, kol artists merger tool dar nepasileido.
//
// Source: `public.v_artist_migration_status` view (žr. 20260521a_*.sql v3).
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
  // Score state
  score: number | null
  score_updated_at: string | null
  score_done: boolean
  // Photo state
  image_url: string | null
  hero_url: string | null
  image_width: number | null
  image_height: number | null
  image_checked_at: string | null
  image_is_small: boolean
  hero_done: boolean
  photo_done: boolean
  // Counts + coverage
  track_count: number | null
  album_count: number | null
  n_lyrics: number | null
  n_videos: number | null
  n_video_views_filled: number | null
  lyrics_pct: number | null
  yt_pct: number | null
  yt_views_pct: number | null
  // Buckets
  is_lt: boolean
  is_intl: boolean
  is_unknown: boolean
  scrape_done: boolean
  wiki_done: boolean
  dedup_key: string | null
}

type Bucket = 'lt' | 'intl' | 'unknown' | 'all'
type StatusFilter = 'done' | 'pending' | 'all'

// 2026-05-21 v3: done = scrape + (INT: wiki) + hero + photo + score.
// Coverage % NE done blocker — surface kaip warning UI'e.
function isDone(r: ArtistRow): boolean {
  if (!r.scrape_done) return false
  if (!r.is_lt && !r.wiki_done) return false
  if (!r.hero_done) return false
  if (!r.photo_done) return false
  if (!r.score_done) return false
  return true
}

type MissingKey = 'scrape' | 'wiki' | 'hero' | 'photo' | 'score'

function missingFor(r: ArtistRow): MissingKey[] {
  const m: MissingKey[] = []
  if (!r.scrape_done) m.push('scrape')
  if (!r.is_lt && !r.wiki_done) m.push('wiki')
  if (!r.hero_done) m.push('hero')
  if (!r.photo_done) m.push('photo')
  if (!r.score_done) m.push('score')
  return m
}

function inBucket(r: ArtistRow, bucket: Bucket): boolean {
  if (bucket === 'all') return true
  if (bucket === 'lt') return r.is_lt
  if (bucket === 'intl') return r.is_intl
  if (bucket === 'unknown') return r.is_unknown
  return false
}

function rowToOut(r: ArtistRow, dupCount: number) {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    country: r.country,
    kind: (r.is_lt ? 'lt' : r.is_intl ? 'intl' : 'unknown') as 'lt' | 'intl' | 'unknown',
    legacy_likes: r.legacy_likes,
    legacy_comments: r.legacy_comments,
    legacy_discussion_count: r.legacy_discussion_count,
    legacy_news_count: r.legacy_news_count,
    missing: missingFor(r),
    // Counts + coverage
    track_count: r.track_count ?? 0,
    album_count: r.album_count ?? 0,
    n_lyrics: r.n_lyrics ?? 0,
    n_videos: r.n_videos ?? 0,
    n_video_views_filled: r.n_video_views_filled ?? 0,
    lyrics_pct: r.lyrics_pct ?? 0,
    yt_pct: r.yt_pct ?? 0,
    yt_views_pct: r.yt_views_pct ?? 0,
    // Done flags
    scrape_done: r.scrape_done,
    wiki_done: r.wiki_done,
    hero_done: r.hero_done,
    photo_done: r.photo_done,
    score_done: r.score_done,
    // Score + photo state
    score: r.score,
    image_url: r.image_url,
    hero_url: r.hero_url,
    image_is_small: r.image_is_small,
    image_width: r.image_width,
    image_height: r.image_height,
    legacy_stats_at: r.legacy_stats_at,
    dup_count: dupCount,
  }
}

/** Group rows by `dedup_key`, keep highest-legacy_likes representative per name. */
function dedupeRows(rows: ArtistRow[]): { rep: ArtistRow; count: number }[] {
  const groups = new Map<string, ArtistRow[]>()
  for (const r of rows) {
    const key = r.dedup_key || `__id_${r.id}`
    const arr = groups.get(key)
    if (arr) arr.push(r)
    else groups.set(key, [r])
  }
  const out: { rep: ArtistRow; count: number }[] = []
  for (const [, arr] of groups) {
    arr.sort((a, b) => (b.legacy_likes ?? -1) - (a.legacy_likes ?? -1))
    out.push({ rep: arr[0], count: arr.length })
  }
  return out
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const bucket = (url.searchParams.get('bucket') || 'all') as Bucket
  const statusParam = (url.searchParams.get('status') || 'all') as StatusFilter
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') || 50)))
  const offset = Math.max(0, Number(url.searchParams.get('offset') || 0))

  const sb = createAdminClient()

  // Pull all rows from view (PostgREST 1000-row pagination — žr.
  // feedback_postgrest_max_rows.md).
  const PAGE = 1000
  const all: ArtistRow[] = []
  let pgOffset = 0
  while (true) {
    const { data, error } = await sb
      .from('v_artist_migration_status')
      .select('*')
      .range(pgOffset, pgOffset + PAGE - 1)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const rows = (data || []) as ArtistRow[]
    all.push(...rows)
    if (rows.length < PAGE) break
    pgOffset += PAGE
  }

  // ── Counters per bucket (RAW — not dedup'd. DB true counts.) ──
  const ltAll = all.filter(a => a.is_lt)
  const intlAll = all.filter(a => a.is_intl)
  const unknownAll = all.filter(a => a.is_unknown)

  const ltDone = ltAll.filter(isDone).length
  const intlDone = intlAll.filter(isDone).length
  const unknownDone = unknownAll.filter(isDone).length

  // Stats coverage
  const statsCovered = all.filter(a => a.legacy_stats_at != null).length

  // Avg coverage per bucket (per-artist % avg, used as health indicator)
  function avgCoverage(rows: ArtistRow[], field: 'lyrics_pct' | 'yt_pct' | 'yt_views_pct'): number {
    const withTracks = rows.filter(r => (r.track_count ?? 0) > 0)
    if (withTracks.length === 0) return 0
    const sum = withTracks.reduce((acc, r) => acc + (r[field] ?? 0), 0)
    return Math.round((sum / withTracks.length) * 10) / 10
  }

  // Total duplicate ranges — kiek atlikėjų DB'jeje turi pagal name
  // bent vieną kitą artist'ą su tuo paciu pavadinimu.
  const dupGroups = dedupeRows(all)
  const totalDuplicates = dupGroups.filter(g => g.count > 1).length
  const totalDupRows = dupGroups
    .filter(g => g.count > 1)
    .reduce((acc, g) => acc + g.count, 0)

  // ── Filtered list (bucket + status), dedup'd, paginated ──
  const filtered = all.filter(r => {
    if (!inBucket(r, bucket)) return false
    if (statusParam === 'done') return isDone(r)
    if (statusParam === 'pending') return !isDone(r)
    return true
  })

  const filteredDeduped = dedupeRows(filtered)
    // Default sort: legacy_likes desc, then discussion_count desc
    .sort((x, y) => {
      const xl = x.rep.legacy_likes ?? -1
      const yl = y.rep.legacy_likes ?? -1
      if (xl !== yl) return yl - xl
      return (y.rep.legacy_discussion_count ?? 0) - (x.rep.legacy_discussion_count ?? 0)
    })

  const totalFiltered = filteredDeduped.length
  const page = filteredDeduped
    .slice(offset, offset + limit)
    .map(g => rowToOut(g.rep, g.count))

  // Wiki factors globally enabled? Mirror'ina scoring.ts logiką.
  // Kai false (default) — score'ai tik iš music.lt + YT views; UI rodo `•`
  // indikatorių visiems score pill'iams.
  const wikiFactorsEnabled = process.env.SCORING_USE_WIKI_FACTORS === 'true'

  return NextResponse.json({
    summary: {
      total: all.length,
      duplicates: { unique_groups: totalDuplicates, total_rows: totalDupRows },
      wiki_factors_enabled: wikiFactorsEnabled,
      lt:      { total: ltAll.length,     done: ltDone,     pending: ltAll.length - ltDone,     pct: pct(ltDone, ltAll.length) },
      intl:    { total: intlAll.length,   done: intlDone,   pending: intlAll.length - intlDone, pct: pct(intlDone, intlAll.length) },
      unknown: { total: unknownAll.length, done: unknownDone, pending: unknownAll.length - unknownDone, pct: pct(unknownDone, unknownAll.length) },
      stats_coverage: { covered: statsCovered, missing: all.length - statsCovered, pct: pct(statsCovered, all.length) },
      coverage: {
        lt: {
          lyrics_pct: avgCoverage(ltAll, 'lyrics_pct'),
          yt_pct: avgCoverage(ltAll, 'yt_pct'),
          yt_views_pct: avgCoverage(ltAll, 'yt_views_pct'),
        },
        intl: {
          lyrics_pct: avgCoverage(intlAll, 'lyrics_pct'),
          yt_pct: avgCoverage(intlAll, 'yt_pct'),
          yt_views_pct: avgCoverage(intlAll, 'yt_views_pct'),
        },
      },
    },
    query: { bucket, status: statusParam, limit, offset, total: totalFiltered },
    rows: page,
  })
}

function pct(num: number, denom: number): number {
  if (denom <= 0) return 0
  return Math.round((num / denom) * 1000) / 10
}
