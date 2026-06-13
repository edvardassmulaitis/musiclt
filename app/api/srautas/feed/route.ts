// app/api/srautas/feed/route.ts
//
// GET /api/srautas/feed?limit=30&before=<ISO>
//
// Asmeninis „Srautas" — turinys pritaikytas nariui pagal jo pamėgtus atlikėjus
// (likes entity_type='artist'). Agreguoja kelis šaltinius į vieną chronologinį
// srautą: naujienos (news_artists), narių įrašai (blog_post_artists), naujos
// dainos ir albumai (artist_id), artėjantys koncertai (event_artists). Jei narys
// neprisijungęs arba dar nieko nepamėgo → fallback į „trending" (naujausias
// turinys visiems), su personalized=false.
//
// GREITAVEIKA (2026-06-14 rebuild):
//   • VISI šaltiniai leidžiami LYGIAGREČIAI (Promise.all) — anksčiau buvo
//     nuoseklūs await'ai (5 round-trip'ai vienas po kito = lėta).
//   • Rezultatas cache'inamas per narį (unstable_cache, 90s TTL), keyed pagal
//     uid + pamėgtų atlikėjų rinkinį + cursor — grįžus atsakymas momentinis.
//
// Resilient: kiekvienas šaltinis savo try/catch — jei lentelės/kolonos nėra,
// grąžinam ką turim, o ne 500.

import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/

type FeedItem = {
  key: string
  kind: 'news' | 'blog' | 'track' | 'album' | 'event'
  title: string
  subtitle: string | null
  image: string | null
  href: string
  date: string | null
  badge: string
  artist?: { name: string; slug: string | null } | null
  meta?: Record<string, any>
}

const ytThumb = (url?: string | null) => {
  const m = url?.match?.(YT_RE)?.[1]
  return m ? `https://img.youtube.com/vi/${m}/mqdefault.jpg` : null
}

const albumDate = (y?: number | null, m?: number | null, d?: number | null) =>
  y ? `${y}-${String(m || 1).padStart(2, '0')}-${String(d || 1).padStart(2, '0')}T00:00:00.000Z` : null

const one = (v: any) => (Array.isArray(v) ? v[0] : v)

// ── Pagrindinė feed'o logika — cache'inama (žr. getCachedFeed žemiau). ────────
async function buildFeed(artistIds: number[], limit: number, before: string | null) {
  const sb = createAdminClient()
  const beforeMs = before ? Date.parse(before) : null
  const personalized = artistIds.length > 0
  const nowIso = new Date().toISOString()

  // ── Naujienos ──────────────────────────────────────────────────────────────
  const newsTask = async (): Promise<FeedItem[]> => {
    const out: FeedItem[] = []
    try {
      let newsIds: number[] | null = null
      if (personalized) {
        const { data: na } = await sb
          .from('news_artists').select('news_id').in('artist_id', artistIds).limit(400)
        newsIds = Array.from(new Set((na || []).map((r: any) => Number(r.news_id)).filter(Boolean)))
        if (!newsIds.length) return out
      }
      let q = sb
        .from('news')
        .select('id, slug, title, image_small_url, image_title_url, published_at')
        .not('published_at', 'is', null)
        .lte('published_at', nowIso)
      if (newsIds) q = q.in('id', newsIds)
      if (before) q = q.lt('published_at', before)
      q = q.order('published_at', { ascending: false }).limit(40)
      const { data } = await q
      for (const n of (data || []) as any[]) {
        out.push({
          key: `news-${n.id}`, kind: 'news', title: n.title || '',
          subtitle: null, image: n.image_title_url || n.image_small_url || null,
          href: `/news/${n.slug}`, date: n.published_at, badge: 'Naujiena',
        })
      }
    } catch { /* ignore */ }
    return out
  }

  // ── Narių įrašai (blog) ──────────────────────────────────────────────────────
  const blogTask = async (): Promise<FeedItem[]> => {
    const out: FeedItem[] = []
    try {
      let postIds: number[] | null = null
      if (personalized) {
        const { data: ba } = await sb
          .from('blog_post_artists').select('post_id').in('artist_id', artistIds).limit(400)
        postIds = Array.from(new Set((ba || []).map((r: any) => Number(r.post_id)).filter(Boolean)))
        if (!postIds.length) return out
      }
      let q = sb
        .from('blog_posts')
        .select('id, slug, title, cover_image_url, post_type, rating, published_at, ' +
          'blogs:blog_id(slug, profiles:user_id(full_name, username, avatar_url))')
        .eq('status', 'published')
        .not('published_at', 'is', null)
        .lte('published_at', nowIso)
      if (postIds) q = q.in('id', postIds)
      if (before) q = q.lt('published_at', before)
      q = q.order('published_at', { ascending: false }).limit(40)
      const { data } = await q
      for (const p of (data || []) as any[]) {
        const blog = one(p.blogs)
        const prof = one(blog?.profiles)
        const blogSlug = blog?.slug || prof?.username
        out.push({
          key: `blog-${p.id}`, kind: 'blog', title: p.title || '',
          subtitle: prof?.full_name || prof?.username || null,
          image: p.cover_image_url || null,
          href: blogSlug ? `/blogas/${blogSlug}/${p.slug}` : '/blogas',
          date: p.published_at, badge: 'Įrašas',
          meta: { post_type: p.post_type, rating: p.rating, avatar: prof?.avatar_url || null },
        })
      }
    } catch { /* ignore */ }
    return out
  }

  // ── Naujos dainos ─────────────────────────────────────────────────────────────
  const tracksTask = async (): Promise<FeedItem[]> => {
    const out: FeedItem[] = []
    try {
      let q = sb
        .from('tracks')
        .select('id, title, slug, cover_url, video_url, release_date, artist_id, ' +
          'artists!tracks_artist_id_fkey(name, slug, cover_image_url)')
        .not('release_date', 'is', null)
      if (personalized) q = q.in('artist_id', artistIds)
      if (before) q = q.lt('release_date', before)
      q = q.order('release_date', { ascending: false }).limit(40)
      const { data } = await q
      for (const t of (data || []) as any[]) {
        const a = one(t.artists)
        out.push({
          key: `track-${t.id}`, kind: 'track', title: t.title || '',
          subtitle: a?.name || null,
          image: t.cover_url || ytThumb(t.video_url) || a?.cover_image_url || null,
          href: `/dainos/${t.slug || t.id}`,
          date: t.release_date, badge: 'Nauja daina',
          artist: a ? { name: a.name, slug: a.slug } : null,
        })
      }
    } catch { /* ignore */ }
    return out
  }

  // ── Nauji albumai ─────────────────────────────────────────────────────────────
  const albumsTask = async (): Promise<FeedItem[]> => {
    const out: FeedItem[] = []
    try {
      let q = sb
        .from('albums')
        .select('id, title, slug, cover_image_url, year, month, day, artist_id, ' +
          'artists!albums_artist_id_fkey(name, slug, cover_image_url)')
        .not('year', 'is', null)
      if (personalized) q = q.in('artist_id', artistIds)
      q = q.order('year', { ascending: false }).order('month', { ascending: false, nullsFirst: false }).limit(40)
      const { data } = await q
      for (const al of (data || []) as any[]) {
        const a = one(al.artists)
        out.push({
          key: `album-${al.id}`, kind: 'album', title: al.title || '',
          subtitle: a?.name || null,
          image: al.cover_image_url || a?.cover_image_url || null,
          href: a?.slug ? `/albumai/${a.slug}-${al.slug}-${al.id}` : `/albumai/${al.slug || ''}-${al.id}`,
          date: albumDate(al.year, al.month, al.day), badge: 'Naujas albumas',
          artist: a ? { name: a.name, slug: a.slug } : null,
        })
      }
    } catch { /* ignore */ }
    return out
  }

  // ── Artėjantys koncertai (tik 1-am puslapyje — be cursor'io) ───────────────────
  const eventsTask = async (): Promise<FeedItem[]> => {
    const out: FeedItem[] = []
    if (before) return out // koncertai (ateities datos) rodomi tik 1-ame puslapyje
    try {
      let eventIds: number[] | null = null
      if (personalized) {
        const { data: ea } = await sb
          .from('event_artists').select('event_id').in('artist_id', artistIds).limit(400)
        eventIds = Array.from(new Set((ea || []).map((r: any) => Number(r.event_id)).filter(Boolean)))
        if (!eventIds.length) return out
      }
      let q = sb
        .from('events')
        .select('id, title, slug, cover_image_url, start_date, city, venue_name')
        .gte('start_date', nowIso)
      if (eventIds) q = q.in('id', eventIds)
      q = q.order('start_date', { ascending: true }).limit(8)
      const { data } = await q
      for (const ev of (data || []) as any[]) {
        out.push({
          key: `event-${ev.id}`, kind: 'event', title: ev.title || '',
          subtitle: [ev.city, ev.venue_name].filter(Boolean).join(' · ') || null,
          image: ev.cover_image_url || null,
          href: `/renginiai/${ev.slug}`, date: ev.start_date, badge: 'Koncertas',
        })
      }
    } catch { /* ignore */ }
    return out
  }

  // ── VISI šaltiniai LYGIAGREČIAI ──────────────────────────────────────────────
  const groups = await Promise.all([
    newsTask(), blogTask(), tracksTask(), albumsTask(), eventsTask(),
  ])
  const items = groups.flat()

  // ── Merge: events (ateities) viršuje; likę chronologiškai; cursor; dedupe ────
  const events = items.filter(it => it.kind === 'event')
  const rest = items
    .filter(it => it.kind !== 'event')
    .filter(it => {
      if (!it.date) return false
      if (beforeMs == null) return true
      const t = Date.parse(it.date)
      return Number.isFinite(t) && t < beforeMs
    })
    .sort((a, b) => Date.parse(b.date || '') - Date.parse(a.date || ''))

  const ordered = [...events, ...rest]
  const seen = new Set<string>()
  const out: FeedItem[] = []
  for (const it of ordered) {
    if (seen.has(it.key)) continue
    seen.add(it.key)
    out.push(it)
    if (out.length >= limit) break
  }

  // nextBefore = paskutinio NE-event item'o data (events neturi praeities cursor'io)
  const lastDated = [...out].reverse().find(it => it.kind !== 'event' && it.date)
  const nextBefore = out.length >= limit && lastDated ? lastDated.date : null

  return { items: out, personalized, nextBefore }
}

// Server-side cache — keyed pagal uid + pamėgtų atlikėjų rinkinį + cursor + limit.
// 90s TTL: turinys nesikeičia kas sekundę, o cache duoda momentinį atsakymą grįžus.
const getCachedFeed = unstable_cache(
  async (_uid: string, artistIds: number[], limit: number, before: string | null) =>
    buildFeed(artistIds, limit, before),
  ['srautas-feed-v2'],
  { revalidate: 90 },
)

export async function GET(req: NextRequest) {
  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('limit') || '30'), 1), 50)
  const before = req.nextUrl.searchParams.get('before')

  // Sesija + pamėgti atlikėjai (NEcache'inama — priklauso nuo cookies).
  let uid = ''
  let artistIds: number[] = []
  try {
    const session = await getServerSession(authOptions)
    uid = ((session?.user as any)?.id as string | undefined) || ''
    if (uid) {
      const sb = createAdminClient()
      const { data } = await sb.from('likes').select('entity_id')
        .eq('entity_type', 'artist').eq('user_id', uid).limit(2000)
      artistIds = Array.from(new Set((data || []).map((r: any) => Number(r.entity_id)).filter(Boolean)))
        .sort((a, b) => a - b)
    }
  } catch { /* anon */ }

  const result = await getCachedFeed(uid || 'anon', artistIds, limit, before)
  return NextResponse.json(result)
}
