// app/api/srautas/feed/route.ts
//
// GET /api/srautas/feed?limit=30&before=<ISO>
//
// Asmeninis „Srautas" — turinys pritaikytas nariui pagal jo pamėgtus atlikėjus
// (likes entity_type='artist'). Agreguoja VISKĄ, kas susiję su pamėgtais
// atlikėjais: nauja muzika (tracks + albums), naujienos (news_artists), narių
// įrašai / recenzijos (blog_post_artists), topai kuriuose paminėti
// (external_chart_entries), diskusijos (discussions.artist_id) ir artėjantys
// koncertai (event_artists). Jei narys neprisijungęs / dar nieko nepamėgo →
// fallback į „trending" visiems.
//
// SVARBU (2026-06-17 v8): kad VIENAS atlikėjas neužtvindytų srauto (pvz. ką tik
// įkėlus visą albumą — visos dainos gauna tą pačią video_uploaded_at), muzika
// DEDUPLINAMA per atlikėją: imam tik 1 dainą (populiariausią pagal video_views)
// + 1 albumą kiekvienam atlikėjui. Po to – diversity reorder: dvi gretimos
// kortelės niekada ne iš to paties atlikėjo.
//
// Pirmas puslapis (be cursor): visi tipai, supinti. Tolesni (su before): tik
// muzika (naujienos/įrašai/topai/diskusijos/koncertai baigtiniai → 1-ame psl).
//
// Resilient: kiekvienas šaltinis savo try/catch.

import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/

type Kind = 'news' | 'blog' | 'track' | 'album' | 'event' | 'topic' | 'chart'
type FeedItem = {
  key: string
  kind: Kind
  title: string
  subtitle: string | null
  image: string | null
  href: string
  date: string | null
  badge: string
  artistId?: number | null
  artist?: { name: string; slug: string | null } | null
  meta?: Record<string, any>
}

const ytThumb = (url?: string | null) => {
  const m = url?.match?.(YT_RE)?.[1]
  return m ? `https://img.youtube.com/vi/${m}/mqdefault.jpg` : null
}

const ymd = (y?: number | null, m?: number | null, d?: number | null) =>
  y ? `${y}-${String(m || 1).padStart(2, '0')}-${String(d || 1).padStart(2, '0')}T00:00:00.000Z` : null

const one = (v: any) => (Array.isArray(v) ? v[0] : v)

// Supina tipus į vieną srautą su variacija. Dainos (YT įkėlimai) — pirmiausia
// (tikriausias „kas naujo"), albumai antra, o naujienos / įrašai / topai /
// diskusijos / koncertai reguliariai įsiterpia.
function weave(q: Record<string, FeedItem[]>, limit: number): FeedItem[] {
  const template = ['track', 'album', 'track', 'news', 'chart', 'track', 'album', 'blog', 'track', 'topic', 'event', 'track', 'album', 'news', 'blog']
  const order = ['track', 'album', 'news', 'chart', 'blog', 'topic', 'event']
  const out: FeedItem[] = []
  let ti = 0
  while (out.length < limit) {
    const want = template[ti % template.length]; ti++
    let pick = q[want]?.shift()
    if (!pick) {
      const fb = order.find(k => q[k]?.length)
      if (!fb) break
      pick = q[fb].shift()
    }
    if (pick) out.push(pick)
  }
  return out
}

// Diversity reorder: dvi gretimos kortelės niekada ne iš to paties atlikėjo.
// Greedy — jei kitas elementas to paties atlikėjo kaip prieš tai, ieškom toliau
// kito atlikėjo ir sukeičiam. Stabilu, O(n²) bet n ≤ ~50.
function spreadByArtist(items: FeedItem[]): FeedItem[] {
  const out: FeedItem[] = []
  const pool = [...items]
  let lastAid: number | null | undefined = undefined
  while (pool.length) {
    let idx = pool.findIndex(it => !it.artistId || it.artistId !== lastAid)
    if (idx === -1) idx = 0
    const [pick] = pool.splice(idx, 1)
    out.push(pick)
    lastAid = pick.artistId
  }
  return out
}

// Per-artist cap: iš sąrašo palieka geriausią `perArtist` įrašų kiekvienam
// atlikėjui. score(it) — kuo didesnis, tuo geriau (dainoms = video_views).
function capPerArtist(items: FeedItem[], perArtist: number, score: (it: FeedItem) => number): FeedItem[] {
  const byArtist = new Map<number, FeedItem[]>()
  const noArtist: FeedItem[] = []
  for (const it of items) {
    const aid = it.artistId
    if (!aid) { noArtist.push(it); continue }
    const arr = byArtist.get(aid) || []
    arr.push(it)
    byArtist.set(aid, arr)
  }
  const out: FeedItem[] = [...noArtist]
  for (const arr of byArtist.values()) {
    arr.sort((a, b) => score(b) - score(a))
    out.push(...arr.slice(0, perArtist))
  }
  return out
}

async function buildFeed(artistIds: number[], limit: number, before: string | null) {
  const sb = createAdminClient()
  const beforeMs = before ? Date.parse(before) : null
  const personalized = artistIds.length > 0
  const nowIso = new Date().toISOString()
  const dateOk = (iso: string | null) => {
    if (!iso) return false
    if (beforeMs == null) return true
    const t = Date.parse(iso)
    return Number.isFinite(t) && t < beforeMs
  }

  // ── MUZIKA: tracks + albums (atskiros eilės) ────────────────────────────────
  // Per atlikėją paliekam TIK 1 dainą (daugiausiai video_views) + 1 albumą
  // (naujausią) — kad vieno atlikėjo albumo dainos neužtvindytų srauto.
  const musicTask = async (): Promise<{ tracks: FeedItem[]; albums: FeedItem[] }> => {
    const tracks: FeedItem[] = []
    const albums: FeedItem[] = []
    const [tracksRes, albumsRes] = await Promise.all([
      (async () => {
        try {
          // .not(video_uploaded_at null) BŪTINAS — be jo PostgREST nepanaudoja
          // partial indekso → full sort → timeout. Imam plačiau (200), nes po
          // dedup per atlikėją liks gerokai mažiau.
          let q = sb.from('tracks')
            .select('id, title, slug, cover_url, video_url, video_views, video_uploaded_at, release_date, release_year, release_month, release_day, artist_id, artists!tracks_artist_id_fkey(name, slug, cover_image_url)')
            .not('video_uploaded_at', 'is', null)
          if (personalized) q = q.in('artist_id', artistIds)
          q = q.order('video_uploaded_at', { ascending: false }).limit(personalized ? 240 : 80)
          return (await q).data || []
        } catch { return [] }
      })(),
      (async () => {
        try {
          let q = sb.from('albums')
            .select('id, title, slug, cover_image_url, year, month, day, artist_id, artists!albums_artist_id_fkey(name, slug, cover_image_url)')
            .not('year', 'is', null)
          if (personalized) q = q.in('artist_id', artistIds)
          q = q.order('year', { ascending: false }).order('month', { ascending: false, nullsFirst: false }).limit(personalized ? 120 : 50)
          return (await q).data || []
        } catch { return [] }
      })(),
    ])
    for (const t of tracksRes as any[]) {
      const a = one(t.artists)
      const date = t.video_uploaded_at || t.release_date || ymd(t.release_year, t.release_month, t.release_day)
      if (!dateOk(date)) continue
      tracks.push({
        key: `track-${t.id}`, kind: 'track', title: t.title || '', subtitle: a?.name || null,
        image: t.cover_url || ytThumb(t.video_url) || a?.cover_image_url || null,
        href: `/dainos/${t.slug || t.id}`, date, badge: 'Nauja daina',
        artistId: t.artist_id || null,
        artist: a ? { name: a.name, slug: a.slug } : null,
        meta: { views: Number(t.video_views) || 0 },
      })
    }
    for (const al of albumsRes as any[]) {
      const a = one(al.artists)
      const date = ymd(al.year, al.month, al.day)
      if (!dateOk(date)) continue
      albums.push({
        key: `album-${al.id}`, kind: 'album', title: al.title || '', subtitle: a?.name || null,
        image: al.cover_image_url || a?.cover_image_url || null,
        href: a?.slug ? `/albumai/${a.slug}-${al.slug}-${al.id}` : `/albumai/${al.slug || ''}-${al.id}`,
        date, badge: 'Naujas albumas',
        artistId: al.artist_id || null,
        artist: a ? { name: a.name, slug: a.slug } : null,
      })
    }
    // Per-artist dedup: 1 daina (max views), 1 albumas (naujausias).
    const dedTracks = capPerArtist(tracks, 1, it => (it.meta?.views as number) || Date.parse(it.date || '') / 1e10)
    const dedAlbums = capPerArtist(albums, 1, it => Date.parse(it.date || '') || 0)
    dedTracks.sort((a, b) => Date.parse(b.date || '') - Date.parse(a.date || ''))
    dedAlbums.sort((a, b) => Date.parse(b.date || '') - Date.parse(a.date || ''))
    return { tracks: dedTracks, albums: dedAlbums }
  }

  // ── NAUJIENOS (tik 1-am psl) ────────────────────────────────────────────────
  const newsTask = async (): Promise<FeedItem[]> => {
    if (before) return []
    const out: FeedItem[] = []
    try {
      let newsIds: number[] | null = null
      if (personalized) {
        const { data: na } = await sb.from('news_artists').select('news_id').in('artist_id', artistIds).limit(400)
        newsIds = Array.from(new Set((na || []).map((r: any) => Number(r.news_id)).filter(Boolean)))
        if (!newsIds.length) return out
      }
      let q = sb.from('news')
        .select('id, slug, title, image_small_url, image_title_url, published_at')
        .not('published_at', 'is', null).lte('published_at', nowIso)
      if (newsIds) q = q.in('id', newsIds)
      q = q.order('published_at', { ascending: false }).limit(16)
      const { data } = await q
      for (const n of (data || []) as any[]) {
        out.push({
          key: `news-${n.id}`, kind: 'news', title: n.title || '', subtitle: null,
          image: n.image_title_url || n.image_small_url || null,
          href: `/news/${n.slug}`, date: n.published_at, badge: 'Naujiena',
        })
      }
    } catch { /* ignore */ }
    return out
  }

  // ── NARIŲ ĮRAŠAI / RECENZIJOS (tik 1-am psl) ────────────────────────────────
  const blogTask = async (): Promise<FeedItem[]> => {
    if (before) return []
    const out: FeedItem[] = []
    try {
      let postIds: number[] | null = null
      if (personalized) {
        const { data: ba } = await sb.from('blog_post_artists').select('post_id').in('artist_id', artistIds).limit(400)
        postIds = Array.from(new Set((ba || []).map((r: any) => Number(r.post_id)).filter(Boolean)))
        if (!postIds.length) return out
      }
      let q = sb.from('blog_posts')
        .select('id, slug, title, cover_image_url, post_type, rating, published_at, blogs:blog_id(slug, profiles:user_id(full_name, username, avatar_url))')
        .eq('status', 'published').not('published_at', 'is', null).lte('published_at', nowIso)
      if (postIds) q = q.in('id', postIds)
      q = q.order('published_at', { ascending: false }).limit(16)
      const { data } = await q
      for (const p of (data || []) as any[]) {
        const blog = one(p.blogs); const prof = one(blog?.profiles)
        const blogSlug = blog?.slug || prof?.username
        const isReview = p.post_type === 'review' || p.rating != null
        out.push({
          key: `blog-${p.id}`, kind: 'blog', title: p.title || '',
          subtitle: prof?.full_name || prof?.username || null,
          image: p.cover_image_url || null,
          href: blogSlug ? `/blogas/${blogSlug}/${p.slug}` : '/blogas',
          date: p.published_at, badge: isReview ? 'Recenzija' : 'Įrašas',
          meta: { post_type: p.post_type, rating: p.rating, avatar: prof?.avatar_url || null },
        })
      }
    } catch { /* ignore */ }
    return out
  }

  // ── TOPAI kuriuose paminėti pamėgti atlikėjai (tik 1-am psl, personalized) ──
  const chartsTask = async (): Promise<FeedItem[]> => {
    if (before || !personalized) return []
    const out: FeedItem[] = []
    try {
      const { data: currentCharts } = await sb.from('external_charts')
        .select('id, source, chart_key, title, period_label').eq('is_current', true)
      const charts = (currentCharts || []) as any[]
      if (!charts.length) return out
      const chartById = new Map<number, any>(charts.map(c => [Number(c.id), c]))
      const { data: entries } = await sb.from('external_chart_entries')
        .select('chart_id, artist_id, position, title, artist_name, cover_url, tracks:track_id(slug, cover_url, artists:artist_id(name, cover_image_url))')
        .in('artist_id', artistIds).in('chart_id', charts.map(c => Number(c.id)))
        .order('position', { ascending: true }).limit(40)
      // Vienas geriausios pozicijos įrašas kiekvienam (atlikėjas+topas) deriniui.
      const seen = new Set<string>()
      for (const e of (entries || []) as any[]) {
        const c = chartById.get(Number(e.chart_id)); if (!c) continue
        const aid = Number(e.artist_id)
        const dedupeKey = `${aid}-${c.id}`
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey)
        const tr = one(e.tracks); const ar = one(tr?.artists)
        const artistName = ar?.name || e.artist_name || null
        out.push({
          key: `chart-${e.chart_id}-${aid}`, kind: 'chart',
          title: e.title || artistName || c.title || 'Topas',
          subtitle: `#${e.position} · ${c.title}${c.period_label ? ` · ${c.period_label}` : ''}`,
          image: e.cover_url || tr?.cover_url || ar?.cover_image_url || null,
          href: `/topai/${c.source}-${c.chart_key}`,
          date: nowIso, badge: 'Topuose', artistId: aid,
          artist: artistName ? { name: artistName, slug: null } : null,
        })
      }
    } catch { /* ignore */ }
    return out
  }

  // ── DISKUSIJOS susietos su pamėgtais atlikėjais (tik 1-am psl, personalized) ──
  const topicsTask = async (): Promise<FeedItem[]> => {
    if (before || !personalized) return []
    const out: FeedItem[] = []
    try {
      const { data } = await sb.from('discussions')
        .select('id, title, slug, artist_id, comment_count, like_count, last_comment_at, created_at')
        .in('artist_id', artistIds).eq('is_deleted', false)
        .order('last_comment_at', { ascending: false, nullsFirst: false }).limit(10)
      for (const d of (data || []) as any[]) {
        out.push({
          key: `topic-${d.id}`, kind: 'topic', title: d.title || '',
          subtitle: d.comment_count ? `${d.comment_count} komentarų` : 'Diskusija',
          image: null, href: `/diskusijos/${d.slug}`,
          date: d.last_comment_at || d.created_at, badge: 'Diskusija',
          artistId: d.artist_id ? Number(d.artist_id) : null,
          meta: { comments: d.comment_count, likes: d.like_count },
        })
      }
    } catch { /* ignore */ }
    return out
  }

  // ── ARTĖJANTYS KONCERTAI (tik 1-am psl) ─────────────────────────────────────
  const eventsTask = async (): Promise<FeedItem[]> => {
    if (before) return []
    const out: FeedItem[] = []
    try {
      let eventIds: number[] | null = null
      if (personalized) {
        const { data: ea } = await sb.from('event_artists').select('event_id').in('artist_id', artistIds).limit(400)
        eventIds = Array.from(new Set((ea || []).map((r: any) => Number(r.event_id)).filter(Boolean)))
        if (!eventIds.length) return out
      }
      let q = sb.from('events')
        .select('id, title, slug, cover_image_url, start_date, city, venue_name')
        .gte('start_date', nowIso)
      if (eventIds) q = q.in('id', eventIds)
      q = q.order('start_date', { ascending: true }).limit(8)
      const { data } = await q
      for (const ev of (data || []) as any[]) {
        out.push({
          key: `event-${ev.id}`, kind: 'event', title: ev.title || '',
          subtitle: [ev.city, ev.venue_name].filter(Boolean).join(' · ') || null,
          image: ev.cover_image_url || null, href: `/renginiai/${ev.slug}`,
          date: ev.start_date, badge: 'Koncertas',
        })
      }
    } catch { /* ignore */ }
    return out
  }

  const [music, news, blog, charts, topics, events] = await Promise.all([
    musicTask(), newsTask(), blogTask(), chartsTask(), topicsTask(), eventsTask(),
  ])

  // Pirmas psl → tipai supinti (dainos priekyje); tolesni → tik muzika chronologiškai.
  let out: FeedItem[]
  if (before) {
    out = [...music.tracks, ...music.albums]
      .sort((a, b) => Date.parse(b.date || '') - Date.parse(a.date || ''))
      .slice(0, limit)
  } else {
    out = weave({
      track: [...music.tracks], album: [...music.albums],
      news, blog, chart: charts, topic: topics, event: [...events],
    }, limit)
  }

  // Dedupe
  const seen = new Set<string>()
  const deduped: FeedItem[] = []
  for (const it of out) { if (!seen.has(it.key)) { seen.add(it.key); deduped.push(it) } }

  // Diversity: jokių dviejų gretimų to paties atlikėjo.
  const ordered = spreadByArtist(deduped)

  // nextBefore = seniausia grąžinta MUZIKOS data (muzika = gilus šaltinis).
  const musicReturned = ordered.filter(it => it.kind === 'track' || it.kind === 'album')
  let oldestMs = Infinity
  for (const it of musicReturned) { const t = Date.parse(it.date || ''); if (Number.isFinite(t) && t < oldestMs) oldestMs = t }
  const moreMusicAvail = music.tracks.length + music.albums.length > musicReturned.length
  const nextBefore = musicReturned.length && oldestMs !== Infinity && moreMusicAvail ? new Date(oldestMs).toISOString() : null

  return { items: ordered, personalized, nextBefore }
}

const getCachedFeed = unstable_cache(
  async (_uid: string, artistIds: number[], limit: number, before: string | null) =>
    buildFeed(artistIds, limit, before),
  ['srautas-feed-v8'],
  { revalidate: 90 },
)

export async function GET(req: NextRequest) {
  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('limit') || '30'), 1), 50)
  const before = req.nextUrl.searchParams.get('before')

  let uid = ''
  let artistIds: number[] = []
  try {
    const session = await getServerSession(authOptions)
    uid = ((session?.user as any)?.id as string | undefined) || ''
    if (uid) {
      const sb = createAdminClient()
      const { data } = await sb.from('likes').select('entity_id')
        .eq('entity_type', 'artist').eq('user_id', uid).limit(2000)
      artistIds = Array.from(new Set((data || []).map((r: any) => Number(r.entity_id)).filter(Boolean))).sort((a, b) => a - b)
    }
  } catch { /* anon */ }

  const result = await getCachedFeed(uid || 'anon', artistIds, limit, before)
  return NextResponse.json(result)
}
