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
import { getVertaKelionesData } from '@/lib/verta-keliones-db'
import { DEST_BY_KEY, flagEmoji } from '@/lib/verta-keliones-seed'

export const dynamic = 'force-dynamic'

// /bendruomene-stiliaus etiketė nario įrašui (pagal post_type + editorial_type).
function blogBadge(postType?: string | null, editorial?: string | null): { label: string; color: string } {
  if (postType === 'topas') return { label: 'Topas', color: '#f59e0b' }
  if (postType === 'creation') return { label: 'Kūryba', color: '#ec4899' }
  if (postType === 'translation') return { label: 'Vertimas', color: '#10b981' }
  if (postType === 'review') return { label: 'Muzikos apžvalga', color: '#ef4444' }
  if (postType === 'article') {
    if (editorial === 'recenzija') return { label: 'Muzikos apžvalga', color: '#ef4444' }
    if (editorial === 'koncertai') return { label: 'Koncerto įspūdžiai', color: '#3b82f6' }
  }
  return { label: 'Įrašas', color: '#8b5cf6' }
}

// Verta kelionės — paskirties subtitras: 🇵🇱 Lenkija · Varšuva (šalis pirma, miestas papildomai).
function tripSubtitle(destKey: string, fallbackVenue?: string | null): string | null {
  const d = DEST_BY_KEY[destKey]
  if (!d) return fallbackVenue || null
  const flag = d.countryCode ? flagEmoji(d.countryCode) : ''
  return `${flag ? flag + ' ' : ''}${d.country} · ${d.city}`
}

// Kelionės info: pasiekimo būdas + kaina/trukmė (iš DEST_BY_KEY seed laukų).
function tripInfo(destKey: string): string | null {
  const d = DEST_BY_KEY[destKey]
  if (!d) return null
  if (d.reach === 'car') {
    const parts = ['🚗 Pasiekiama mašina']
    if (d.driveHours) parts.push(`~${d.driveHours} val. kelio${d.driveFrom ? ` nuo ${d.driveFrom}` : ''}`)
    return parts.join(' · ')
  }
  const parts = ['✈️ Skrydis']
  if (d.carrier) parts.push(d.carrier)
  if (d.priceFrom) parts.push(`nuo ${d.priceFrom} €`)
  return parts.join(' · ')
}

const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/

type Kind = 'news' | 'blog' | 'track' | 'album' | 'event' | 'topic' | 'chart' | 'recording'
type FeedItem = {
  key: string
  kind: Kind
  title: string
  subtitle: string | null
  image: string | null
  href: string
  date: string | null
  badge: string
  badgeColor?: string | null
  liked?: boolean
  artistId?: number | null
  avatar?: string | null
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

// Išvalo legacy diskusijų pavadinimų šiukšles iš seno forumo importo:
// „R E M |232112" → „R E M"; „232112| Title" → „Title"; likę pavieniai „|".
function cleanTitle(t?: string | null): string {
  return (t || '')
    .replace(/\s*\|\s*\d{3,}\s*$/g, '')   // trailing  | <legacy_id>
    .replace(/^\s*\d{3,}\s*\|\s*/g, '')    // leading   <legacy_id> |
    .replace(/\s*\|\s*\d{3,}(?=\s|\|)/g, '') // viduryje
    .replace(/\s*\|\s*$/,'')                // likęs vienišas |
    .replace(/\s{2,}/g, ' ').trim()
}

// Įrašo excerpt — HTML nuvalytas, sutrumpintas (kortelėms be viršelio).
function excerptOf(summary?: string | null, max = 360): string | null {
  const t = (summary || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
  if (!t) return null
  return t.length > max ? t.slice(0, max).trimEnd() + '…' : t
}

// Nario įrašo „vizualas" — kaip /bendruomene feede: jei nėra cover_image_url,
// imam susietos muzikos nuotrauką (daina → albumas → atlikėjas). NE avataras.
async function blogThumbs(sb: any, posts: { id: number; cover_image_url: string | null }[]): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  const need = posts.filter(p => !p.cover_image_url).map(p => p.id)
  if (!need.length) return map
  try {
    const [tj, aj, arj] = await Promise.all([
      sb.from('blog_post_tracks').select('post_id, tracks:track_id(video_url, cover_url, artist:artist_id(cover_image_url))').in('post_id', need),
      sb.from('blog_post_albums').select('post_id, albums:album_id(cover_image_url)').in('post_id', need),
      sb.from('blog_post_artists').select('post_id, artists:artist_id(cover_image_url)').in('post_id', need),
    ])
    for (const row of (tj.data || []) as any[]) {
      if (map.has(row.post_id)) continue
      const t = one(row.tracks); if (!t) continue
      const img = t.cover_url || ytThumb(t.video_url) || one(t.artist)?.cover_image_url
      if (img) map.set(row.post_id, img)
    }
    for (const row of (aj.data || []) as any[]) { if (map.has(row.post_id)) continue; const al = one(row.albums); if (al?.cover_image_url) map.set(row.post_id, al.cover_image_url) }
    for (const row of (arj.data || []) as any[]) { if (map.has(row.post_id)) continue; const ar = one(row.artists); if (ar?.cover_image_url) map.set(row.post_id, ar.cover_image_url) }
  } catch { /* ignore */ }
  return map
}

// Per-artist cap: iš sąrašo palieka geriausią `perArtist` įrašų kiekvienam
// atlikėjui. score(it) — kuo didesnis, tuo geriau (dainoms = naujumas).
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

// Populiariausios dainos (su klipu) ytId kiekvienam atlikėjui — koncertų kortelių grotuvui.
async function topTrackYtByArtist(sb: any, artistIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  const ids = Array.from(new Set(artistIds.filter(Boolean)))
  if (!ids.length) return out
  try {
    const { data } = await sb.from('tracks')
      .select('artist_id, video_url, video_views').in('artist_id', ids).not('video_url', 'is', null)
      .order('video_views', { ascending: false, nullsFirst: false }).limit(Math.min(ids.length * 8, 300))
    for (const t of (data || []) as any[]) {
      const aid = Number(t.artist_id); if (out.has(aid)) continue
      const yt = t.video_url?.match?.(YT_RE)?.[1]; if (!yt) continue
      out.set(aid, yt)
    }
  } catch { /* ignore */ }
  return out
}

async function buildFeed(artistIds: number[], followedIds: string[], limit: number, before: string | null) {
  const sb = createAdminClient()
  const beforeMs = before ? Date.parse(before) : null
  const personalized = artistIds.length > 0 || followedIds.length > 0
  const nowIso = new Date().toISOString()
  const curYear = new Date().getFullYear()
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
      // SENO KATALOGO filtras: jei daina išleista seniai (pvz. 1987 m.) bet jos
      // YouTube įkėlimas šviežias — tai NĖRA naujiena, praleidžiam.
      const ry = t.release_year || (t.release_date ? new Date(t.release_date).getFullYear() : null)
      if (ry && ry < curYear - 1) continue
      if (Date.parse(date || '') > Date.now()) continue // dar neišleista
      tracks.push({
        key: `track-${t.id}`, kind: 'track', title: t.title || '', subtitle: a?.name || null,
        image: t.cover_url || ytThumb(t.video_url) || a?.cover_image_url || null,
        href: `/dainos/${a?.slug ? a.slug + '-' : ''}${t.slug || 'daina'}-${t.id}`, date, badge: 'Nauja daina',
        artistId: t.artist_id || null, avatar: a?.cover_image_url || null,
        artist: a ? { name: a.name, slug: a.slug } : null,
        meta: { views: Number(t.video_views) || 0, ytId: t.video_url?.match?.(YT_RE)?.[1] || null },
      })
    }
    for (const al of albumsRes as any[]) {
      const a = one(al.artists)
      const date = ymd(al.year, al.month, al.day)
      if (!dateOk(date)) continue
      if (Date.parse(date || '') > Date.now()) continue // dar neišleistas (pvz. Muse – Wow Signal)
      albums.push({
        key: `album-${al.id}`, kind: 'album', title: al.title || '', subtitle: a?.name || null,
        image: al.cover_image_url || a?.cover_image_url || null,
        href: a?.slug ? `/albumai/${a.slug}-${al.slug}-${al.id}` : `/albumai/${al.slug || ''}-${al.id}`,
        date, badge: 'Naujas albumas',
        artistId: al.artist_id || null, avatar: a?.cover_image_url || null,
        artist: a ? { name: a.name, slug: a.slug } : null,
      })
    }
    // Per-artist dedup: 1 NAUJAUSIA daina + 1 naujausias albumas (kad srautas
    // būtų pagal šviežumą, ne pagal seną hitą — anksčiau imdavom max views ir
    // iškildavo seni populiarūs kūriniai virš naujesnių).
    const dedTracks = capPerArtist(tracks, 1, it => Date.parse(it.date || '') || 0)
    const dedAlbums = capPerArtist(albums, 1, it => Date.parse(it.date || '') || 0)
    dedTracks.sort((a, b) => Date.parse(b.date || '') - Date.parse(a.date || ''))
    dedAlbums.sort((a, b) => Date.parse(b.date || '') - Date.parse(a.date || ''))
    // Albumams — kelios (≤2) populiariausios dainos su klipais → inline ▶ grotuvai.
    try {
      const albIds = dedAlbums.map(a => Number(a.key.split('-').pop())).filter(Boolean)
      if (albIds.length) {
        const { data: at } = await sb.from('album_tracks')
          .select('album_id, tracks:track_id(title, video_url, video_views)').in('album_id', albIds)
        const byAlbum = new Map<number, { yt: string; title: string; views: number }[]>()
        for (const r of (at || []) as any[]) {
          const t = one(r.tracks); if (!t) continue
          const yt = t.video_url?.match?.(YT_RE)?.[1]; if (!yt) continue
          const aid = Number(r.album_id)
          const arr = byAlbum.get(aid) || []; arr.push({ yt, title: t.title || '', views: Number(t.video_views) || 0 }); byAlbum.set(aid, arr)
        }
        for (const al of dedAlbums) {
          const arr = (byAlbum.get(Number(al.key.split('-').pop())) || [])
            .sort((a, b) => b.views - a.views)
          // unikalūs ytId, top 2
          const seenYt = new Set<string>(); const top: { ytId: string; title: string }[] = []
          for (const x of arr) { if (seenYt.has(x.yt)) continue; seenYt.add(x.yt); top.push({ ytId: x.yt, title: x.title }); if (top.length >= 2) break }
          if (top.length) al.meta = { ...(al.meta || {}), albumTracks: top }
        }
      }
    } catch { /* ignore */ }
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
        .select('id, slug, title, summary, cover_image_url, post_type, editorial_type, rating, published_at, blogs:blog_id(slug, profiles:user_id(full_name, username, avatar_url))')
        .eq('status', 'published').not('published_at', 'is', null).lte('published_at', nowIso)
      if (postIds) q = q.in('id', postIds)
      q = q.order('published_at', { ascending: false }).limit(16)
      const { data } = await q
      const rows = (data || []) as any[]
      const thumbs = await blogThumbs(sb, rows)
      for (const p of rows) {
        const blog = one(p.blogs); const prof = one(blog?.profiles)
        const blogSlug = blog?.slug || prof?.username
        const bb = blogBadge(p.post_type, p.editorial_type)
        out.push({
          key: `blog-${p.id}`, kind: 'blog', title: p.title || '',
          subtitle: prof?.full_name || prof?.username || null,
          image: p.cover_image_url || thumbs.get(p.id) || null,
          href: blogSlug ? `/blogas/${blogSlug}/${p.slug}` : '/blogas',
          date: p.published_at, badge: bb.label, badgeColor: bb.color,
          avatar: prof?.avatar_url || null,
          meta: { post_type: p.post_type, rating: p.rating, avatar: prof?.avatar_url || null, excerpt: excerptOf(p.summary) },
        })
      }
    } catch { /* ignore */ }
    return out
  }

  // ── TOPAI — VIENA agreguota kortelė (be floodo, be foto). Detalės (kuris
  //    atlikėjas kuriame tope) — modale (meta.chartRows). ──────────────────────
  const chartsTask = async (): Promise<FeedItem[]> => {
    if (before || !personalized) return []
    try {
      const { data: currentCharts } = await sb.from('external_charts')
        .select('id, source, chart_key, title').eq('is_current', true)
      const charts = (currentCharts || []) as any[]
      if (!charts.length) return []
      const chartById = new Map<number, any>(charts.map(c => [Number(c.id), c]))
      const { data: entries } = await sb.from('external_chart_entries')
        .select('artist_id, chart_id, position, title, cover_url, track_id, artist_name').in('artist_id', artistIds).in('chart_id', charts.map(c => Number(c.id)))
        .order('position', { ascending: true }).limit(120)
      const eRows = (entries || []) as any[]
      const aids = Array.from(new Set(eRows.map(e => Number(e.artist_id)).filter(Boolean)))
      if (!aids.length) return []
      // Atlikėjai (pills) + konkrečios dainos (track_id → pavadinimas, klipas, viršelis).
      const trackIds = Array.from(new Set(eRows.map(e => Number(e.track_id)).filter(Boolean)))
      const [artsRes, tracksRes] = await Promise.all([
        sb.from('artists').select('id, name, cover_image_url, slug').in('id', aids),
        trackIds.length ? sb.from('tracks').select('id, title, video_url, cover_url').in('id', trackIds) : Promise.resolve({ data: [] as any[] }),
      ])
      const artById = new Map<number, { name: string; image: string | null; slug: string | null }>(
        ((artsRes.data || []) as any[]).map(a => [Number(a.id), { name: a.name as string, image: a.cover_image_url || null, slug: a.slug || null }]))
      const trackById = new Map<number, { title: string; yt: string | null; cover: string | null }>(
        ((tracksRes.data || []) as any[]).map(t => [Number(t.id), { title: t.title || '', yt: t.video_url?.match?.(YT_RE)?.[1] || null, cover: t.cover_url || null }]))
      const seen = new Set<string>()
      // chartRows — DAINOS lygmuo (pavadinimas + atlikėjas + dainos viršelis + klipas); pills — atlikėjai.
      const rows: { artist: string; song: string | null; ytId: string | null; chart: string; position: number; href: string; image: string | null }[] = []
      const thumbs: { name: string; image: string | null; href: string }[] = []
      const seenArt = new Set<number>()
      for (const e of eRows) {
        const c = chartById.get(Number(e.chart_id)); if (!c) continue
        const a = artById.get(Number(e.artist_id)); if (!a) continue
        const tr = e.track_id ? trackById.get(Number(e.track_id)) : null
        const song = tr?.title || e.title || null
        const k = `${e.artist_id}-${e.chart_id}-${song || ''}`; if (seen.has(k)) continue; seen.add(k)
        rows.push({ artist: a.name || e.artist_name, song, ytId: tr?.yt || null, chart: c.title || 'Topas', position: Number(e.position) || 0, href: `/topai/${c.source}-${c.chart_key}`, image: tr?.cover || e.cover_url || a.image })
        const aid = Number(e.artist_id)
        if (!seenArt.has(aid)) { seenArt.add(aid); thumbs.push({ name: a.name, image: a.image, href: a.slug ? `/atlikejai/${a.slug}` : '/topai' }) }
      }
      if (!rows.length) return []
      return [{
        key: 'charts-summary', kind: 'chart',
        title: 'Tavo atlikėjai topuose',
        subtitle: null, image: null, href: '/topai', date: nowIso, badge: 'Topai',
        artistId: null, avatar: null,
        meta: { chartRows: rows.slice(0, 50), artistThumbs: thumbs.slice(0, 16) },
      }]
    } catch { /* ignore */ }
    return []
  }

  // ── DISKUSIJOS susietos su pamėgtais atlikėjais (tik 1-am psl, personalized) ──
  const topicsTask = async (): Promise<FeedItem[]> => {
    if (before || !personalized) return []
    const out: FeedItem[] = []
    try {
      const { data } = await sb.from('discussions')
        .select('id, title, slug, artist_id, comment_count, like_count, last_comment_at, created_at')
        .in('artist_id', artistIds).eq('is_deleted', false)
        .or('legacy_kind.is.null,legacy_kind.eq.discussion') // tik tikros diskusijos (ne migruotos recenzijos/naujienos)
        .order('last_comment_at', { ascending: false, nullsFirst: false }).limit(10)
      const rows = (data || []) as any[]
      // Atlikėjų nuotraukos atskira užklausa (patikimiau nei embedded join).
      const artCover = new Map<number, { name: string; cover: string | null }>()
      const artIds = Array.from(new Set(rows.map(d => Number(d.artist_id)).filter(Boolean)))
      if (artIds.length) {
        try {
          const { data: arts } = await sb.from('artists').select('id, name, cover_image_url').in('id', artIds)
          for (const a of (arts || []) as any[]) artCover.set(Number(a.id), { name: a.name, cover: a.cover_image_url || null })
        } catch { /* ignore */ }
      }
      // Naujausias komentaras + kas parašė (kaip /bendruomene).
      const lastComment = new Map<number, { body: string; by: string | null; avatar: string | null }>()
      const ids = rows.map(d => d.id)
      if (ids.length) {
        try {
          const { data: cmts } = await sb.from('comments')
            .select('discussion_id, body, created_at, profiles:user_id(full_name, username, avatar_url)')
            .in('discussion_id', ids).eq('is_deleted', false).not('body', 'is', null)
            .order('created_at', { ascending: false }).limit(60)
          for (const c of (cmts || []) as any[]) {
            if (lastComment.has(c.discussion_id)) continue
            const t = (c.body || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
            if (!t) continue
            const pr = one(c.profiles)
            lastComment.set(c.discussion_id, {
              body: t.length > 400 ? t.slice(0, 400).trimEnd() + '…' : t,
              by: pr?.full_name || pr?.username || null,
              avatar: pr?.avatar_url || null,
            })
          }
        } catch { /* ignore */ }
      }
      for (const d of rows) {
        const aid = d.artist_id ? Number(d.artist_id) : 0
        const ac = aid ? artCover.get(aid) : null
        const cmt = lastComment.get(d.id)
        out.push({
          key: `topic-${d.id}`, kind: 'topic', title: cleanTitle(d.title),
          subtitle: ac?.name || (d.comment_count ? `${d.comment_count} komentarų` : 'Diskusija'),
          image: ac?.cover || null, href: `/diskusijos/${d.slug}`,
          date: d.last_comment_at || d.created_at, badge: 'Diskusija',
          artistId: aid || null, avatar: ac?.cover || null,
          meta: { comments: d.comment_count, likes: d.like_count, excerpt: cmt?.body || null, commentBy: cmt?.by || null, commentAvatar: cmt?.avatar || null },
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
      const evs = (data || []) as any[]
      // Renginio atlikėjas → jo top dainos klipas (kortelės grotuvui).
      const evArtist = new Map<number, number>()
      try {
        const { data: ea2 } = await sb.from('event_artists').select('event_id, artist_id').in('event_id', evs.map(e => Number(e.id)))
        for (const r of (ea2 || []) as any[]) { const e = Number(r.event_id); if (!evArtist.has(e)) evArtist.set(e, Number(r.artist_id)) }
      } catch { /* ignore */ }
      const evYt = await topTrackYtByArtist(sb, Array.from(evArtist.values()))
      for (const ev of evs) {
        const yt = evYt.get(evArtist.get(Number(ev.id)) || 0) || null
        out.push({
          key: `event-${ev.id}`, kind: 'event', title: ev.title || '',
          subtitle: [ev.city, ev.venue_name].filter(Boolean).join(' · ') || null,
          image: ev.cover_image_url || null, href: `/renginiai/${ev.slug}`,
          date: ev.start_date, badge: 'Koncertas',
          meta: yt ? { ytId: yt } : undefined,
        })
      }
    } catch { /* ignore */ }
    return out
  }

  // ── KONCERTŲ ĮRAŠAI (live archyvas, tik 1-am psl) ───────────────────────────
  const recordingsTask = async (): Promise<FeedItem[]> => {
    if (before) return []
    const out: FeedItem[] = []
    try {
      let q = sb.from('concert_recordings')
        .select('id, slug, title, artist_id, thumbnail_url, recording_type, uploaded_at, created_at, artists:artist_id(name, slug, cover_image_url)')
        .eq('is_published', true)
      if (personalized) q = q.in('artist_id', artistIds)
      q = q.order('uploaded_at', { ascending: false, nullsFirst: false }).limit(personalized ? 12 : 6)
      const { data } = await q
      const TYPE_LABEL: Record<string, string> = { full: 'Pilnas koncertas', special: 'Koncerto įrašas', session: 'Gyvas pasirodymas' }
      for (const r of (data || []) as any[]) {
        const a = one(r.artists)
        out.push({
          key: `recording-${r.id}`, kind: 'recording', title: r.title || '',
          subtitle: a?.name || null, image: r.thumbnail_url || a?.cover_image_url || null,
          href: `/koncertu-irasai/${r.slug}`, date: r.uploaded_at || r.created_at,
          badge: TYPE_LABEL[r.recording_type] || 'Koncerto įrašas',
          artistId: r.artist_id || null, avatar: a?.cover_image_url || null,
          artist: a ? { name: a.name, slug: a.slug } : null,
        })
      }
    } catch { /* ignore */ }
    return out
  }

  // ── SEKAMŲ NARIŲ ĮRAŠAI (user_follows → jų blog_posts) ──────────────────────
  const followedPostsTask = async (): Promise<FeedItem[]> => {
    if (before || !followedIds.length) return []
    const out: FeedItem[] = []
    try {
      const { data } = await sb.from('blog_posts')
        .select('id, slug, title, summary, cover_image_url, post_type, editorial_type, rating, published_at, user_id, blogs:blog_id(slug, profiles:user_id(full_name, username, avatar_url))')
        .eq('status', 'published').not('published_at', 'is', null).lte('published_at', nowIso)
        .in('user_id', followedIds)
        .order('published_at', { ascending: false }).limit(20)
      const rows = (data || []) as any[]
      const thumbs = await blogThumbs(sb, rows)
      for (const p of rows) {
        const blog = one(p.blogs); const prof = one(blog?.profiles)
        const blogSlug = blog?.slug || prof?.username
        const bb = blogBadge(p.post_type, p.editorial_type)
        out.push({
          key: `blog-${p.id}`, kind: 'blog', title: p.title || '',
          subtitle: prof?.full_name || prof?.username || null,
          image: p.cover_image_url || thumbs.get(p.id) || null,
          href: blogSlug ? `/blogas/${blogSlug}/${p.slug}` : '/blogas',
          date: p.published_at, badge: bb.label, badgeColor: bb.color,
          avatar: prof?.avatar_url || null,
          meta: { post_type: p.post_type, rating: p.rating, avatar: prof?.avatar_url || null, excerpt: excerptOf(p.summary) },
        })
      }
    } catch { /* ignore */ }
    return out
  }

  // ── VERTA KELIONĖS — pamėgtų atlikėjų koncertai užsienyje (tik 1-am psl) ─────
  const vertaTask = async (): Promise<FeedItem[]> => {
    if (before || !artistIds.length) return []
    const out: FeedItem[] = []
    try {
      const { data: arts } = await sb.from('artists').select('id, slug, name, cover_image_url').in('id', artistIds)
      const likedSlugs = new Set<string>()
      const likedNames = new Set<string>()
      const coverBySlug = new Map<string, string>()
      const coverByName = new Map<string, string>()
      const idBySlug = new Map<string, number>()
      const idByName = new Map<string, number>()
      for (const a of (arts || []) as any[]) {
        if (a.slug) { likedSlugs.add(a.slug); idBySlug.set(a.slug, Number(a.id)); if (a.cover_image_url) coverBySlug.set(a.slug, a.cover_image_url) }
        if (a.name) { const n = String(a.name).trim().toLowerCase(); likedNames.add(n); idByName.set(n, Number(a.id)); if (a.cover_image_url) coverByName.set(n, a.cover_image_url) }
      }
      if (!likedSlugs.size && !likedNames.size) return out
      const { concerts } = await getVertaKelionesData()
      const now = Date.now()
      const tripArtistId = new Map<string, number>() // trip key → artist id
      for (const c of concerts as any[]) {
        const nm = (c.artist || '').trim().toLowerCase()
        // Slug ARBA vardas — kad Coldplay (kt. slug DB) irgi pataikytų.
        if (!((c.artistSlug && likedSlugs.has(c.artistSlug)) || (nm && likedNames.has(nm)))) continue
        const t = Date.parse(c.date)
        if (!Number.isFinite(t) || t < now) continue
        const cover = (c.artistSlug && coverBySlug.get(c.artistSlug)) || coverByName.get(nm) || c.image || null
        const aid = (c.artistSlug && idBySlug.get(c.artistSlug)) || idByName.get(nm) || 0
        const key = `trip-${c.id}`
        if (aid) tripArtistId.set(key, aid)
        out.push({
          key, kind: 'event',
          title: c.isFestival ? (c.festivalName || c.artist) : c.artist,
          subtitle: tripSubtitle(c.destKey, c.venue), image: c.image || cover || null,
          href: `/verta-keliones#vk-${c.id}`, date: c.date, badge: 'Koncertas, vertas kelionės',
          avatar: cover,
          meta: { tripInfo: tripInfo(c.destKey), excerpt: c.why || null, venue: c.venue || null },
        })
      }
      out.sort((a, b) => Date.parse(a.date || '') - Date.parse(b.date || ''))
      const top = out.slice(0, 6)
      // Atlikėjo top dainos klipas (kortelės grotuvui).
      const ytByArtist = await topTrackYtByArtist(sb, top.map(it => tripArtistId.get(it.key) || 0))
      for (const it of top) {
        const yt = ytByArtist.get(tripArtistId.get(it.key) || 0)
        if (yt) it.meta = { ...(it.meta || {}), ytId: yt }
      }
      return top
    } catch { /* ignore */ }
    return out.slice(0, 6)
  }

  const [music, news, blog, charts, topics, events, recordings, followedPosts, verta] = await Promise.all([
    musicTask(), newsTask(), blogTask(), chartsTask(), topicsTask(), eventsTask(), recordingsTask(), followedPostsTask(), vertaTask(),
  ])

  const ms = (it: FeedItem) => { const t = Date.parse(it.date || ''); return Number.isFinite(t) ? t : NaN }

  // Chronologinis srautas: NAUJAUSI pirma. Būsimi koncertai (įprasti + „verta
  // kelionės") — pačiame viršuje (artimiausi pirmi). Bedatės kortelės (topai) —
  // gale. Tolesni psl (before) → tik muzika chronologiškai.
  let ordered: FeedItem[]
  const dedupe = (arr: FeedItem[]) => { const s = new Set<string>(); const o: FeedItem[] = []; for (const it of arr) { if (!s.has(it.key)) { s.add(it.key); o.push(it) } } return o }

  if (before) {
    ordered = dedupe([...music.tracks, ...music.albums].sort((a, b) => ms(b) - ms(a))).slice(0, limit)
  } else {
    const uniq = dedupe([
      ...music.tracks, ...music.albums, ...news, ...blog, ...followedPosts,
      ...topics, ...events, ...verta, ...recordings, ...charts,
    ])
    const now = Date.now()
    const upcoming = uniq.filter(it => it.kind === 'event' && !Number.isNaN(ms(it)) && ms(it) >= now)
      .sort((a, b) => ms(a) - ms(b)).slice(0, 4)
    const upKeys = new Set(upcoming.map(e => e.key))
    const rest = uniq.filter(it => !upKeys.has(it.key))
    const dated = rest.filter(it => !Number.isNaN(ms(it))).sort((a, b) => ms(b) - ms(a))
    const undated = rest.filter(it => Number.isNaN(ms(it)))
    ordered = [...upcoming, ...dated, ...undated].slice(0, limit)
  }

  // nextBefore = seniausia grąžinta MUZIKOS data (muzika = gilus šaltinis).
  const musicReturned = ordered.filter(it => it.kind === 'track' || it.kind === 'album')
  let oldestMs = Infinity
  for (const it of musicReturned) { const t = Date.parse(it.date || ''); if (Number.isFinite(t) && t < oldestMs) oldestMs = t }
  const moreMusicAvail = music.tracks.length + music.albums.length > musicReturned.length
  const nextBefore = musicReturned.length && oldestMs !== Infinity && moreMusicAvail ? new Date(oldestMs).toISOString() : null

  return { items: ordered, personalized, nextBefore }
}

const getCachedFeed = unstable_cache(
  async (_uid: string, artistIds: number[], followedIds: string[], limit: number, before: string | null) =>
    buildFeed(artistIds, followedIds, limit, before),
  ['srautas-feed-v22'],
  { revalidate: 90 },
)

export async function GET(req: NextRequest) {
  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('limit') || '30'), 1), 50)
  const before = req.nextUrl.searchParams.get('before')

  let uid = ''
  let artistIds: number[] = []
  let followedIds: string[] = []
  try {
    const session = await getServerSession(authOptions)
    uid = ((session?.user as any)?.id as string | undefined) || ''
    if (uid) {
      const sb = createAdminClient()
      const { data: likesData } = await sb.from('likes').select('entity_id')
        .eq('entity_type', 'artist').eq('user_id', uid).limit(2000)
      artistIds = Array.from(new Set((likesData || []).map((r: any) => Number(r.entity_id)).filter(Boolean))).sort((a, b) => a - b)
      // Sekami nariai — atskirai (jei user_follows migracija dar neaplikuota, nenugriūna likes).
      try {
        const { data: followsData } = await sb.from('user_follows').select('following_id').eq('follower_id', uid).limit(2000)
        followedIds = Array.from(new Set((followsData || []).map((r: any) => String(r.following_id)).filter(Boolean))).sort()
      } catch { /* table missing */ }
    }
  } catch { /* anon */ }

  const result = await getCachedFeed(uid || 'anon', artistIds, followedIds, limit, before)

  // „liked" žyma dabartiniam nariui (kad ♥ rodytų teisingą būseną, ne visada tuščią).
  if (uid && Array.isArray(result.items) && result.items.length) {
    try {
      const sb = createAdminClient()
      const numId = (k: string) => Number(k.split('-').pop())
      const tIds = result.items.filter((i: any) => i.kind === 'track').map((i: any) => numId(i.key)).filter(Boolean)
      const aIds = result.items.filter((i: any) => i.kind === 'album').map((i: any) => numId(i.key)).filter(Boolean)
      const liked = new Set<string>()
      const [tl, al] = await Promise.all([
        tIds.length ? sb.from('likes').select('entity_id').eq('entity_type', 'track').eq('user_id', uid).in('entity_id', tIds) : Promise.resolve({ data: [] as any[] }),
        aIds.length ? sb.from('likes').select('entity_id').eq('entity_type', 'album').eq('user_id', uid).in('entity_id', aIds) : Promise.resolve({ data: [] as any[] }),
      ])
      for (const r of (tl.data || []) as any[]) liked.add(`track-${r.entity_id}`)
      for (const r of (al.data || []) as any[]) liked.add(`album-${r.entity_id}`)
      if (liked.size) {
        // Naujas masyvas — nemutuojam unstable_cache objektų.
        const items = result.items.map((it: any) => liked.has(it.key) ? { ...it, liked: true } : it)
        return NextResponse.json({ ...result, items })
      }
    } catch { /* ignore */ }
  }

  return NextResponse.json(result)
}
