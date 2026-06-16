// app/api/srautas/recommendations/route.ts
//
// GET /api/srautas/recommendations?limit=45
//
// „Tau" — atradimų feed'as. Skirtingai nei /api/srautas/feed (Sekami = turinys
// iš JAU pamėgtų atlikėjų), čia siūlome tai, ko narys DAR neseka:
//
//   • rekomenduojami atlikėjai (recommend_taste RPC: collaborative co-like +
//     žanrų/substilių artumas + rising recent_score), su reason label;
//   • jų nauji leidiniai (tracks/albums);
//   • artėjantys koncertai, kuriuose groja pamėgti arba rekomenduojami atlikėjai;
//   • rekomenduojamos diskusijos (susietos su tais atlikėjais).
//
// Visi šaltiniai supinami į VIENĄ feed'ą (ne dashboard blokai). Jei narys
// neprisijungęs arba dar nieko nepamėgo → discovery fallback (kylantys vardai +
// nauji leidiniai), personalized=false.
//
// Resilient: kiekvienas šaltinis savo try/catch.

import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/
const ytThumb = (url?: string | null) => {
  const m = url?.match?.(YT_RE)?.[1]
  return m ? `https://img.youtube.com/vi/${m}/mqdefault.jpg` : null
}
const albumDate = (y?: number | null, m?: number | null, d?: number | null) =>
  y ? `${y}-${String(m || 1).padStart(2, '0')}-${String(d || 1).padStart(2, '0')}T00:00:00.000Z` : null
const one = (v: any) => (Array.isArray(v) ? v[0] : v)

type RecItem = {
  key: string
  kind: 'artist' | 'track' | 'album' | 'event' | 'topic' | 'chart'
  title: string
  subtitle: string | null
  image: string | null
  href: string
  date: string | null
  badge: string
  reason?: string
  because?: string | null
  artist?: { id: number; name: string; slug: string | null } | null
  meta?: Record<string, any>
}

const REASON_BADGE: Record<string, string> = {
  fans: 'Fanai mėgsta',
  rising: 'Kylantis vardas',
  similar: 'Panašus atlikėjas',
  popular: 'Vertas dėmesio',
}

// Supina kelias tipų eiles į vieną feed'ą: atlikėjai dominuoja, o leidiniai /
// koncertai / temos juos punktuoja — kad būtų gyvas, ne monotoniškas srautas.
function weave(queues: Record<string, RecItem[]>, limit: number): RecItem[] {
  const template = ['artist', 'artist', 'release', 'artist', 'chart', 'artist', 'topic', 'artist', 'release', 'artist', 'event']
  const out: RecItem[] = []
  let ti = 0
  const order = ['artist', 'release', 'chart', 'event', 'topic']
  while (out.length < limit) {
    const want = template[ti % template.length]
    ti++
    let pick = queues[want]?.shift()
    if (!pick) {
      // norimo tipo nebėra — imam iš bet kurios netuščios eilės (artist pirma)
      const fb = order.find(k => queues[k]?.length)
      if (!fb) break
      pick = queues[fb].shift()
    }
    if (pick) out.push(pick)
  }
  return out
}

// Diversity reorder: dvi gretimos kortelės niekada ne iš to paties atlikėjo —
// kad rekomendacijų nedominuotų viena pamėgta grupė (pvz. visi „panašūs į RHCP").
function spreadByArtist(items: RecItem[]): RecItem[] {
  const out: RecItem[] = []
  const pool = [...items]
  let lastAid: number | null | undefined = undefined
  while (pool.length) {
    let idx = pool.findIndex(it => !it.artist?.id || it.artist.id !== lastAid)
    if (idx === -1) idx = 0
    const [pick] = pool.splice(idx, 1)
    out.push(pick)
    lastAid = pick.artist?.id
  }
  return out
}

type Rec = { artist_id: number; name: string; slug: string | null; cover_image_url: string | null; country: string | null; recent_score: number | null; reason: string }

// Visa rekomendacijų logika — sukeliama į cache'inamą fn (žr. žemiau). Enrichment
// užklausos (leidiniai / koncertai / temos) leidžiamos LYGIAGREČIAI (Promise.all),
// ne nuosekliai — tai didžiausias greičio laimėjimas.
async function buildRecs(uid: string, likedIds: number[], limit: number) {
  const sb = createAdminClient()

  // ── 1. Rekomenduojami atlikėjai (RPC) ──────────────────────────────────────
  let recs: Rec[] = []
  if (uid && likedIds.length > 0) {
    try {
      const { data } = await sb.rpc('recommend_taste', { p_user: uid, p_limit: 40 })
      recs = (data || []) as Rec[]
    } catch { /* RPC nėra / klaida → fallback žemiau */ }
  }

  // ── Discovery fallback: anon, 0 like'ų arba RPC tuščia ─────────────────────
  const personalized = recs.length > 0
  if (!personalized) {
    try {
      const { data } = await sb
        .from('artists')
        .select('id, name, slug, cover_image_url, country, recent_score')
        .not('cover_image_url', 'is', null)
        .order('recent_score', { ascending: false, nullsFirst: false })
        .limit(40)
      recs = ((data || []) as any[])
        .filter(a => !likedIds.includes(Number(a.id)))
        .map(a => ({ ...a, artist_id: Number(a.id), reason: (a.recent_score || 0) > 100 ? 'rising' : 'popular' }))
    } catch { /* ignore */ }
  }

  const recIds = recs.map(r => r.artist_id)
  const recById = new Map(recs.map(r => [r.artist_id, r]))
  const matchIds = Array.from(new Set([...likedIds, ...recIds]))
  const topRecIds = recIds.slice(0, 16)

  const queues: Record<string, RecItem[]> = { artist: [], release: [], chart: [], event: [], topic: [] }

  // ── 2a. Atlikėjų kortelės (sync) ───────────────────────────────────────────
  for (const r of recs) {
    queues.artist.push({
      key: `artist-${r.artist_id}`, kind: 'artist', title: r.name,
      subtitle: r.country || null, image: r.cover_image_url,
      href: `/atlikejai/${r.slug || r.artist_id}`, date: null,
      badge: REASON_BADGE[r.reason] || REASON_BADGE.similar, reason: r.reason,
      artist: { id: r.artist_id, name: r.name, slug: r.slug },
    })
  }

  // ── 2b–2d. Leidiniai / koncertai / temos — LYGIAGREČIAI ────────────────────
  const releasesTask = async () => {
    if (!topRecIds.length) return
    const [tracksRes, albumsRes] = await Promise.all([
      sb.from('tracks')
        .select('id, title, slug, cover_url, video_url, video_uploaded_at, release_date, release_year, release_month, release_day, artist_id, artists!tracks_artist_id_fkey(name, slug, cover_image_url)')
        .in('artist_id', topRecIds).not('video_uploaded_at', 'is', null)
        .order('video_uploaded_at', { ascending: false }).limit(12),
      sb.from('albums')
        .select('id, title, slug, cover_image_url, year, month, day, artist_id, artists!albums_artist_id_fkey(name, slug, cover_image_url)')
        .in('artist_id', topRecIds).not('year', 'is', null)
        .order('year', { ascending: false }).order('month', { ascending: false, nullsFirst: false }).limit(8),
    ])
    for (const t of (tracksRes.data || []) as any[]) {
      const a = one(t.artists)
      queues.release.push({
        key: `track-${t.id}`, kind: 'track', title: t.title || '', subtitle: a?.name || null,
        image: t.cover_url || ytThumb(t.video_url) || a?.cover_image_url || null,
        href: `/dainos/${t.slug || t.id}`,
        date: t.video_uploaded_at || t.release_date || albumDate(t.release_year, t.release_month, t.release_day),
        badge: 'Nauja daina',
        artist: a ? { id: t.artist_id, name: a.name, slug: a.slug } : null,
      })
    }
    for (const al of (albumsRes.data || []) as any[]) {
      const a = one(al.artists)
      queues.release.push({
        key: `album-${al.id}`, kind: 'album', title: al.title || '', subtitle: a?.name || null,
        image: al.cover_image_url || a?.cover_image_url || null,
        href: a?.slug ? `/albumai/${a.slug}-${al.slug}-${al.id}` : `/albumai/${al.slug || ''}-${al.id}`,
        date: albumDate(al.year, al.month, al.day), badge: 'Naujas albumas',
        artist: a ? { id: al.artist_id, name: a.name, slug: a.slug } : null,
      })
    }
    // Per-artist cap: ne daugiau 1 leidinio kiekvienam rekomenduojamam atlikėjui,
    // kad srauto nedominuotų vienas atlikėjas su daug naujų dainų.
    const perArtist = new Map<number, number>()
    const capped = queues.release
      .sort((a, b) => Date.parse(b.date || '') - Date.parse(a.date || ''))
      .filter(it => {
        const aid = it.artist?.id
        if (!aid) return true
        const n = perArtist.get(aid) || 0
        if (n >= 1) return false
        perArtist.set(aid, n + 1)
        return true
      })
    queues.release = capped
  }

  // ── Topai, kuriuose figūruoja pamėgti / rekomenduojami atlikėjai ─────────────
  const chartsTask = async () => {
    if (!matchIds.length) return
    const { data: currentCharts } = await sb.from('external_charts')
      .select('id, source, chart_key, title, period_label').eq('is_current', true)
    const charts = (currentCharts || []) as any[]
    if (!charts.length) return
    const chartById = new Map<number, any>(charts.map(c => [Number(c.id), c]))
    const { data: entries } = await sb.from('external_chart_entries')
      .select('chart_id, artist_id, position, title, artist_name, cover_url')
      .in('artist_id', matchIds).in('chart_id', charts.map(c => Number(c.id)))
      .order('position', { ascending: true }).limit(30)
    const seen = new Set<string>()
    for (const e of (entries || []) as any[]) {
      const c = chartById.get(Number(e.chart_id)); if (!c) continue
      const aid = Number(e.artist_id)
      const dk = `${aid}-${c.id}`
      if (seen.has(dk)) continue
      seen.add(dk)
      const rec = recById.get(aid)
      queues.chart.push({
        key: `chart-${e.chart_id}-${aid}`, kind: 'chart',
        title: e.title || e.artist_name || c.title || 'Topas',
        subtitle: `#${e.position} · ${c.title}${c.period_label ? ` · ${c.period_label}` : ''}`,
        image: e.cover_url || rec?.cover_image_url || null,
        href: `/topai/${c.source}-${c.chart_key}`, date: null, badge: 'Topuose',
        artist: rec ? { id: aid, name: rec.name, slug: rec.slug } : (e.artist_name ? { id: aid, name: e.artist_name, slug: null } : null),
      })
    }
  }

  const eventsTask = async () => {
    if (!matchIds.length) return
    const { data: ea } = await sb.from('event_artists').select('event_id, artist_id').in('artist_id', matchIds).limit(400)
    const eventIds = Array.from(new Set((ea || []).map((r: any) => Number(r.event_id)).filter(Boolean)))
    if (!eventIds.length) return
    const { data } = await sb.from('events')
      .select('id, title, slug, cover_image_url, start_date, city, venue_name')
      .in('id', eventIds).gte('start_date', new Date().toISOString())
      .order('start_date', { ascending: true }).limit(6)
    for (const ev of (data || []) as any[]) {
      queues.event.push({
        key: `event-${ev.id}`, kind: 'event', title: ev.title || '',
        subtitle: [ev.city, ev.venue_name].filter(Boolean).join(' · ') || null,
        image: ev.cover_image_url || null, href: `/renginiai/${ev.slug}`, date: ev.start_date, badge: 'Koncertas tau',
      })
    }
  }

  // „Nes tau patinka X" — kiekvienam rekomenduojamam atlikėjui surandam pamėgtą
  // atlikėją, dalijantį tą patį žanrą. 3 pigios indeksuotos užklausos (paralelės).
  const becauseMap = new Map<number, string>()
  const becauseTask = async () => {
    if (!personalized || !recIds.length || !likedIds.length) return
    const likedSample = likedIds.slice(0, 500)
    const [lg, ln, rg] = await Promise.all([
      sb.from('artist_genres').select('genre_id, artist_id').in('artist_id', likedSample),
      sb.from('artists').select('id, name').in('id', likedSample),
      sb.from('artist_genres').select('genre_id, artist_id').in('artist_id', recIds),
    ])
    const nameById = new Map<number, string>(((ln.data || []) as any[]).map(r => [Number(r.id), r.name as string]))
    const genreToLiked = new Map<number, string>()
    for (const r of (lg.data || []) as any[]) {
      const gid = Number(r.genre_id)
      if (genreToLiked.has(gid)) continue
      const nm = nameById.get(Number(r.artist_id))
      if (nm) genreToLiked.set(gid, nm)
    }
    const recGenres = new Map<number, number[]>()
    for (const r of (rg.data || []) as any[]) {
      const aid = Number(r.artist_id)
      const arr = recGenres.get(aid) || []
      arr.push(Number(r.genre_id))
      recGenres.set(aid, arr)
    }
    for (const rid of recIds) {
      for (const g of recGenres.get(rid) || []) {
        const nm = genreToLiked.get(g)
        if (nm) { becauseMap.set(rid, nm); break }
      }
    }
  }

  const topicsTask = async () => {
    if (!matchIds.length) return
    const { data } = await sb.from('discussions')
      .select('id, title, slug, artist_id, comment_count, like_count, last_comment_at, created_at')
      .in('artist_id', matchIds).eq('is_deleted', false)
      .order('last_comment_at', { ascending: false, nullsFirst: false }).limit(6)
    for (const d of (data || []) as any[]) {
      const a = d.artist_id ? recById.get(Number(d.artist_id)) : null
      queues.topic.push({
        key: `topic-${d.id}`, kind: 'topic', title: d.title || '',
        subtitle: a?.name || (d.comment_count ? `${d.comment_count} komentarų` : null),
        image: a?.cover_image_url || null, href: `/diskusijos/${d.slug}`,
        date: d.last_comment_at || d.created_at, badge: 'Tema tau',
        meta: { comments: d.comment_count, likes: d.like_count },
      })
    }
  }

  await Promise.all([releasesTask(), chartsTask(), eventsTask(), topicsTask(), becauseTask()].map(p => p.catch(() => {})))

  // Prikabinam „Nes tau patinka X" prie atlikėjų kortelių.
  for (const a of queues.artist) {
    const rid = a.artist?.id
    if (rid && becauseMap.has(rid)) a.because = becauseMap.get(rid) || null
  }

  return { items: spreadByArtist(weave(queues, limit)), personalized, recommendedCount: recs.length }
}

// Server-side cache — per narį (uid + likedIds + limit auto-keyed). 5 min TTL:
// rekomendacijos nesikeičia akimirksniu, tad nereikia perskaičiuoti kiekvieną
// kartą (RPC + 4 užklausos). Pakeitus pamėgtus → likedIds keičiasi → naujas key.
const getCachedRecs = unstable_cache(
  async (uid: string, likedIds: number[], limit: number) => buildRecs(uid, likedIds, limit),
  ['srautas-recs-v4'],
  { revalidate: 300 },
)

export async function GET(req: NextRequest) {
  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('limit') || '45'), 1), 60)

  // Sesija + pamėgti atlikėjai (NEcache'inama — priklauso nuo cookies).
  let uid = ''
  let likedIds: number[] = []
  try {
    const session = await getServerSession(authOptions)
    uid = ((session?.user as any)?.id as string | undefined) || ''
    if (uid) {
      const sb = createAdminClient()
      const { data } = await sb.from('likes').select('entity_id')
        .eq('entity_type', 'artist').eq('user_id', uid).limit(3000)
      likedIds = Array.from(new Set((data || []).map((r: any) => Number(r.entity_id)).filter(Boolean))).sort((a, b) => a - b)
    }
  } catch { /* anon */ }

  const result = await getCachedRecs(uid, likedIds, limit)
  return NextResponse.json(result)
}
