// app/api/admin/dashboard-summary/route.ts
//
// Vienas endpoint'as admin homepage kortelėms — pakeičia ~10 atskirų client
// fetch'ų. Grąžina plokščią objektą { artists: N, inbox_pending: N, ... },
// kurio raktai sutampa su ADMIN_SECTIONS countKey / badgeKey.
//
// Visi skaičiai = HEAD count'ai (head:true) → DB grąžina tik count, ne rows.
// Totalai (artists/albums/...) cache'inami 5 min (unstable_cache), nes brangūs
// ant didelių lentelių ir keičiasi lėtai. Pending badge'ai skaičiuojami šviežiai
// (light užklausos). Kiekvienas count atskirame try/catch — viena klaida
// nenugriauna viso endpoint'o.
//
// Auth: editor ir aukščiau. Admin-tier skaičiai (active_jobs, users_migrated)
// įtraukiami tik pilniems adminams.

import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'
import { hasMinRole, type Role } from '@/lib/admin-sections'

export const dynamic = 'force-dynamic'

type SB = ReturnType<typeof createAdminClient>

async function headCount(fn: () => any): Promise<number> {
  try {
    const { count } = await fn()
    return count ?? 0
  } catch {
    return 0
  }
}

// Totalai — brangesni, cache'inami 5 min.
const getTotals = unstable_cache(
  async (): Promise<Record<string, number>> => {
    const sb: SB = createAdminClient()
    // news total praleidžiamas — „Naujienos" gyvena blog_posts kartu su diary/
    // recenzijomis, tad bendras count būtų klaidinantis. Reikia card_type
    // filtro (TODO), kol kas rodom kortelę be skaičiaus.
    const [artists, albums, tracks, events, venues] = await Promise.all([
      headCount(() => sb.from('artists').select('id', { count: 'exact', head: true })),
      headCount(() => sb.from('albums').select('id', { count: 'exact', head: true })),
      headCount(() => sb.from('tracks').select('id', { count: 'exact', head: true })),
      headCount(() => sb.from('events').select('id', { count: 'exact', head: true })),
      headCount(() => sb.from('venues').select('id', { count: 'exact', head: true })),
    ])
    return { artists, albums, tracks, events, venues }
  },
  ['admin-dashboard-totals-v1'],
  { revalidate: 300 },
)

export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const isFull = hasMinRole((session.user as any)?.role as Role, 'admin')

  const sb: SB = createAdminClient()

  const [
    totals,
    inbox_pending,
    events_inbox_pending,
    top_pending,
    missing_music,
    substyles_pending,
    claims_pending,
    pendAlbums,
    pendTracks,
  ] = await Promise.all([
    getTotals(),
    headCount(() => sb.from('news_candidates').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
    headCount(() => sb.from('event_candidates').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
    headCount(() => sb.from('top_suggestions').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
    headCount(() => sb.from('music_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
    headCount(() => sb.from('substyles').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
    headCount(() => sb.from('artist_claims').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
    headCount(() => sb.from('albums').select('id', { count: 'exact', head: true }).eq('source', 'legacy_scrape_pending')),
    headCount(() => sb.from('tracks').select('id', { count: 'exact', head: true }).eq('source', 'legacy_scrape_pending')),
  ])

  const out: Record<string, number> = {
    ...totals,
    inbox_pending,
    events_inbox_pending,
    top_pending,
    missing_music,
    substyles_pending,
    claims_pending,
    import_pending: pendAlbums + pendTracks,
  }

  // Admin-tier skaičiai — tik pilniems adminams (editor jų net nemato).
  if (isFull) {
    const [active_jobs, users_migrated] = await Promise.all([
      headCount(() => sb.from('import_jobs').select('id', { count: 'exact', head: true }).in('status', ['pending', 'running'])),
      headCount(() => sb.from('v_user_migration_status').select('*', { count: 'exact', head: true }).gte('phases_touched', 1)),
    ])
    out.active_jobs = active_jobs
    out.users_migrated = users_migrated
  }

  return NextResponse.json(out)
}
