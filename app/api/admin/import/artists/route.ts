/**
 * GET /api/admin/import/artists
 *
 * Query params:
 *   - search: string (name or legacy_id exact match)
 *   - status: 'all' | 'pending' | 'wiki_done' | 'scrape_done' | 'both_done'
 *           | 'failed' | 'running'
 *           | 'no_score' | 'no_photo' | 'no_hero'
 *           | 'lt' | 'intl' | 'unknown'
 *           | 'low_lyrics' | 'low_yt'
 *   - sort: 'legacy_id' | 'name' | 'score' | 'legacy_likes' | 'last_activity'
 *         | 'lyrics_pct' | 'yt_pct' | 'track_count' | 'album_count'
 *   - direction: 'asc' | 'desc' (override default direction)
 *   - page: number (default 1)
 *   - limit: number (default 100, max 500)
 *
 * Returns list + total + status counts aggregate.
 *
 * 2026-05-21 v2: Status filter'iai naudoja REALIAS booleans iš
 * `v_artist_import_status` view'os (kuri savo ruožtu derina iš
 * `v_artist_migration_status` v3 — t.y. iš tikrų tracks/albums source
 * lauko). CLI imported atlikėjai (`import_artist.py`) dabar rodomi
 * `scrape_done=true` BE queue job pėdsako. Žr. 20260521b_*.sql.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return null
  }
  return session
}

// Low-coverage threshold % — jei track_count > 0 ir field % < 50, "maža"
// reiškia, kad reikia papildomai paleisti enrichment'ą (lyrics arba YT).
const LOW_COVERAGE_PCT = 50

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const search = (url.searchParams.get('search') || '').trim()
  const status = url.searchParams.get('status') || 'all'
  const sort = url.searchParams.get('sort') || 'legacy_id'
  const directionOverride = url.searchParams.get('direction')
  const page = Math.max(1, Number(url.searchParams.get('page') || 1))
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') || 100)))
  const offset = (page - 1) * limit

  let query = supabase
    .from('v_artist_import_status')
    .select('*', { count: 'exact' })

  // Search — jeigu skaičius, tai kaip legacy_id; kitaip pagal name
  if (search) {
    const asNum = Number(search)
    if (Number.isInteger(asNum) && asNum > 0) {
      query = query.eq('legacy_id', asNum)
    } else {
      query = query.ilike('name', `%${search}%`)
    }
  }

  // ── Status filter (v2: REAL DB state instead of job queue) ──
  switch (status) {
    // ── Importavimo state'as ──
    case 'pending':
      // Visiškai nelietas: nei tracks/albums source su 'legacy', nei 'wiki'
      query = query.eq('scrape_done', false).eq('wiki_done', false).eq('active_jobs', 0)
      break
    case 'wiki_done':
      query = query.eq('wiki_done', true).eq('scrape_done', false)
      break
    case 'scrape_done':
      query = query.eq('scrape_done', true).eq('wiki_done', false)
      break
    case 'both_done':
      query = query.eq('scrape_done', true).eq('wiki_done', true)
      break

    // ── Aktyvumas / klaidos (vis dar pagal queue jobs) ──
    case 'running':
      query = query.gt('active_jobs', 0)
      break
    case 'failed':
      query = query.or('wiki_last_status.eq.failed,scrape_last_status.eq.failed')
      break

    // ── Kokybės indikatoriai ──
    case 'no_score':
      query = query.eq('score_done', false)
      break
    case 'no_photo':
      query = query.eq('photo_done', false)
      break
    case 'no_hero':
      query = query.eq('hero_done', false)
      break
    case 'low_lyrics':
      query = query.gt('track_count', 0).lt('lyrics_pct', LOW_COVERAGE_PCT)
      break
    case 'low_yt':
      query = query.gt('track_count', 0).lt('yt_pct', LOW_COVERAGE_PCT)
      break

    // ── Buckets (LT / INTL / Unknown) ──
    case 'lt':
      query = query.eq('is_lt', true)
      break
    case 'intl':
      query = query.eq('is_intl', true)
      break
    case 'unknown':
      query = query.eq('is_unknown', true)
      break

    // 'all' → no filter
  }

  // ── Sort ──
  // Default direction per sortavimo tipą; user'is gali override per
  // `direction` query param (UI rodo ↑↓ rodyklytes).
  const sortMap: Record<string, { col: string; asc: boolean }> = {
    legacy_id:    { col: 'legacy_id',           asc: true  },
    name:         { col: 'name',                asc: true  },
    score:        { col: 'score',               asc: false },
    legacy_likes: { col: 'legacy_likes',        asc: false },
    last_activity:{ col: 'scrape_completed_at', asc: false },
    lyrics_pct:   { col: 'lyrics_pct',          asc: false },
    yt_pct:       { col: 'yt_pct',              asc: false },
    track_count:  { col: 'track_count',         asc: false },
    album_count:  { col: 'album_count',         asc: false },
  }
  const s = sortMap[sort] || sortMap.legacy_id
  const ascending = directionOverride === 'asc' ? true
                  : directionOverride === 'desc' ? false
                  : s.asc
  query = query.order(s.col, { ascending, nullsFirst: false })

  // Pagination
  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    artists: data || [],
    total: count || 0,
    page,
    limit,
  })
}
