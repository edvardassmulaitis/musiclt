// app/api/admin/dashboard-summary/route.ts
//
// Vienas endpoint'as admin homepage kortelėms — pakeičia ~10 atskirų client
// fetch'ų. Grąžina plokščią objektą { artists: N, inbox_pending: N, ... },
// kurio raktai sutampa su ADMIN_SECTIONS countKey / badgeKey.
//
// GREITAVEIKA: VISI skaičiai cache'inami (unstable_cache, ~90s). Anksčiau pending
// badge'ai buvo skaičiuojami šviežiai kas atidarymą → lėta. Dabar — pirmas
// atidarymas po 90s perskaičiuoja fone, kiti grąžinami akimirksniu.
//
// Skaičiai = HEAD count'ai (head:true) kur įmanoma. Kiekvienas atskirame
// try/catch — viena klaida nenugriauna viso endpoint'o.
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

// ── Tuning ────────────────────────────────────────────────────────────────
const NEWS_FRESH_DAYS = 7        // naujienų inbox: tik paskutinės savaitės pending
const REVIEW_MONTH_DAYS = 31     // narių įrašai / vidiniai topai: per mėnesį
const RADAR_FRESH_DAYS = 45      // radaras: švieži įkėlimai
const RADAR_LIKES_CEIL = 250     // virš jų — jau žinomas (ne radarui)
const TOP40_TARGET = 10          // ateinančiai savaitei reikia bent tiek approved
const LTTOP30_TARGET = 5
const isLt = (c: any) => c === 'Lietuva' || c === 'LT' || c === 'Lithuania'

async function headCount(fn: () => any): Promise<number> {
  try { const { count } = await fn(); return count ?? 0 } catch { return 0 }
}

const daysAgoIso = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString()
const todayDate = () => new Date().toISOString().slice(0, 10)

// ── Radaro „naujų, dar netriažuotų" skaičius (untriaged fresh emerging) ──────
// Auto-poolas gyvas (LT atlikėjai su šviežiu įkėlimu, mažai like'ų, radar_status
// dar nenustatytas). Vienas ~800 eilučių query, cache'inamas su visu bloku.
async function radarPending(sb: SB): Promise<number> {
  try {
    const { data } = await sb
      .from('tracks')
      .select('artist_id, artists!tracks_artist_id_fkey(country, legacy_likes, cover_image_url, radar_status)')
      .not('video_uploaded_at', 'is', null)
      .gte('video_uploaded_at', daysAgoIso(RADAR_FRESH_DAYS))
      .order('video_uploaded_at', { ascending: false })
      .limit(800)
    const seen = new Set<number>()
    for (const t of (data || []) as any[]) {
      const a = t.artists || {}
      if (!t.artist_id || seen.has(t.artist_id)) continue
      if (!isLt(a.country) || !a.cover_image_url) continue
      if ((a.legacy_likes ?? 0) >= RADAR_LIKES_CEIL) continue
      if (a.radar_status != null) continue          // jau triažuotas (featured/included/excluded)
      seen.add(t.artist_id)
    }
    return seen.size
  } catch { return 0 }
}

// ── Išorinių topų nesumatchintos dainos (po dienos atnaujinimo) ──────────────
async function chartsUnmatched(sb: SB): Promise<number> {
  try {
    const { data: charts } = await sb
      .from('external_charts')
      .select('id, chart_key, source')
      .eq('is_current', true).neq('source', 'consensus')
    const ids = (charts || []).filter((c: any) => c.chart_key !== 'albums').map((c: any) => c.id)
    if (ids.length === 0) return 0
    const { count } = await sb
      .from('external_chart_entries')
      .select('id', { count: 'exact', head: true })
      .in('chart_id', ids)
      .is('track_id', null)
      .in('resolve_state', ['pending', 'ambiguous', 'text_only'])
    return count ?? 0
  } catch { return 0 }
}

// ── TOP pasiūlymų trūkumas ateinančiai savaitei ──────────────────────────────
// Approved pasiūlymai laukia top_suggestions lentelėje, kol prasideda nauja
// savaitė (žr. /api/top/cron). Trūkumas = target − approved.
async function topShort(sb: SB): Promise<number> {
  try {
    const [a40, a30] = await Promise.all([
      headCount(() => sb.from('top_suggestions').select('id', { count: 'exact', head: true }).eq('status', 'approved').eq('top_type', 'top40')),
      headCount(() => sb.from('top_suggestions').select('id', { count: 'exact', head: true }).eq('status', 'approved').eq('top_type', 'lt_top30')),
    ])
    return Math.max(0, TOP40_TARGET - a40) + Math.max(0, LTTOP30_TARGET - a30)
  } catch { return 0 }
}

// ── Editor-lygio skaičiai (vienas cache'as, 90s) ─────────────────────────────
const getEditorCounts = unstable_cache(
  async (): Promise<Record<string, number>> => {
    const sb: SB = createAdminClient()
    const monthAgo = daysAgoIso(REVIEW_MONTH_DAYS)
    const newsFresh = daysAgoIso(NEWS_FRESH_DAYS)
    const today = todayDate()

    const [
      artists, albums, tracks, events, venues,
      inbox_pending, events_inbox_pending,
      missing_music, substyles_pending, claims_pending,
      internal_tops, member_posts,
      charts_unmatched, top_short, radar_pending, atradimai_pending,
      lyrics_suggestions_pending, feed_pending, seen_live_pending,
    ] = await Promise.all([
      // Totalai
      headCount(() => sb.from('artists').select('id', { count: 'exact', head: true })),
      headCount(() => sb.from('albums').select('id', { count: 'exact', head: true })),
      headCount(() => sb.from('tracks').select('id', { count: 'exact', head: true })),
      headCount(() => sb.from('events').select('id', { count: 'exact', head: true })),
      headCount(() => sb.from('venues').select('id', { count: 'exact', head: true })),
      // Naujienos: tik paskutinės savaitės pending
      headCount(() => sb.from('news_candidates').select('id', { count: 'exact', head: true }).eq('status', 'pending').gte('created_at', newsFresh)),
      // Renginiai: tik būsimi (fresh) pending
      headCount(() => sb.from('event_candidates').select('id', { count: 'exact', head: true }).eq('status', 'pending').gte('event_date', today)),
      headCount(() => sb.from('music_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
      headCount(() => sb.from('substyles').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
      headCount(() => sb.from('artist_claims').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
      // Vidiniai topai: neapprove'inti topas postai per mėnesį
      headCount(() => sb.from('blog_posts').select('id', { count: 'exact', head: true }).eq('post_type', 'topas').is('topas_approved_at', null).gte('created_at', monthAgo)),
      // Narių įrašai: neperžiūrėti (homepage_reviewed_at null) per mėnesį
      headCount(() => sb.from('blog_posts').select('id', { count: 'exact', head: true }).is('homepage_reviewed_at', null).in('post_type', ['article', 'review', 'creation', 'translation', 'event']).gte('created_at', monthAgo)),
      chartsUnmatched(sb),
      topShort(sb),
      radarPending(sb),
      // Muzikos atradimai: trūkstami atlikėjai (discovery_pending_artist, dar ne 'done')
      headCount(() => sb.from('discovery_pending_artist').select('id', { count: 'exact', head: true }).neq('status', 'done')),
      // Dainų tekstų pasiūlymai — laukiantys peržiūros
      headCount(() => sb.from('lyrics_suggestions').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
      // Homepage feed kandidatai — laukia patvirtinimo (/admin/feed)
      headCount(() => sb.from('home_feed').select('id', { count: 'exact', head: true }).eq('kind', 'candidate').eq('status', 'pending')),
      // „Matyti gyvai" narių draft'ai — laukia patvirtinimo (/admin/matyti-gyvai)
      headCount(() => sb.from('profile_seen_live').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
    ])

    return {
      artists, albums, tracks, events, venues,
      inbox_pending, events_inbox_pending,
      missing_music, substyles_pending, claims_pending,
      internal_tops, member_posts,
      charts_unmatched, top_short, radar_pending, atradimai_pending,
      lyrics_suggestions_pending, feed_pending, seen_live_pending,
    }
  },
  ['admin-dashboard-editor-v3'],
  { revalidate: 90 },
)

// ── Admin-tier skaičiai (atskiras cache) ─────────────────────────────────────
const getAdminCounts = unstable_cache(
  async (): Promise<Record<string, number>> => {
    const sb: SB = createAdminClient()
    const [active_jobs, users_migrated] = await Promise.all([
      headCount(() => sb.from('import_jobs').select('id', { count: 'exact', head: true }).in('status', ['pending', 'running'])),
      headCount(() => sb.from('v_user_migration_status').select('*', { count: 'exact', head: true }).gte('phases_touched', 1)),
    ])
    return { active_jobs, users_migrated }
  },
  ['admin-dashboard-admin-v2'],
  { revalidate: 90 },
)

export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const isFull = hasMinRole((session.user as any)?.role as Role, 'admin')

  const out: Record<string, number> = { ...(await getEditorCounts()) }
  if (isFull) Object.assign(out, await getAdminCounts())

  return NextResponse.json(out)
}
