// app/api/srautas/feed/route.ts
//
// GET /api/srautas/feed?limit=30&before=<ISO>
//
// Asmeninis „Srautas" — turinys pritaikytas nariui pagal jo pamėgtus atlikėjus
// (likes entity_type='artist'). Agreguoja kelis šaltinius: naujienos
// (news_artists), narių įrašai (blog_post_artists), nauja muzika (tracks +
// albums pagal artist_id), artėjantys koncertai (event_artists). Jei narys
// neprisijungęs arba dar nieko nepamėgo → fallback į „trending" visiems.
//
// SVARBU (2026-06-14 v4): dauguma tracks NEturi release_date (tik ~1/3868
// užpildyta), todėl muzikos datą imam su atsarga: release_date → sukomponuota
// iš release_year/month/day. Be to, kad srautas nebūtų vien albumai, tipus
// SUPINAME (weave) su variacija — muzika dominuoja, bet naujienos / įrašai /
// koncertai reguliariai įsiterpia (anksčiau 348 albumai nuskandindavo visa kita).
//
// Pirmas puslapis (be cursor): visi tipai, supinti. Tolesni (su before): tik
// muzika (naujienos/įrašai/koncertai baigtiniai → rodomi 1-ame psl).
//
// Resilient: kiekvienas šaltinis savo try/catch.

import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/

type Kind = 'news' | 'blog' | 'track' | 'album' | 'event'
type FeedItem = {
  key: string
  kind: Kind
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

const ymd = (y?: number | null, m?: number | null, d?: number | null) =>
  y ? `${y}-${String(m || 1).padStart(2, '0')}-${String(d || 1).padStart(2, '0')}T00:00:00.000Z` : null

const one = (v: any) => (Array.isArray(v) ? v[0] : v)

// Supina kelis tipus į vieną srautą su variacija. Muzika dominuoja (jos daugiausia),
// bet naujienos / įrašai / koncertai reguliariai įsiterpia, kad nebūtų vien albumai.
function weave(q: Record<string, FeedItem[]>, limit: number): FeedItem[] {
  const template = ['music', 'music', 'news', 'music', 'blog', 'music', 'event', 'music', 'news', 'music', 'blog', 'music', 'event']
  const order = ['music', 'news', 'blog', 'event']
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

  // ── MUZIKA: tracks + albums (didžiausias šaltinis) ──────────────────────────
  const musicTask = async (): Promise<FeedItem[]> => {
    const out: FeedItem[] = []
    const [tracksRes, albumsRes] = await Promise.all([
      (async () => {
        try {
          let q = sb.from('tracks')
            .select('id, title, slug, cover_url, video_url, release_date, release_year, release_month, release_day, artist_id, artists!tracks_artist_id_fkey(name, slug, cover_image_url)')
          if (personalized) q = q.in('artist_id', artistIds)
          // dauguma neturi release_date → rikiuojam pagal release_year (yra ~77%)
          q = q.order('release_year', { ascending: false, nullsFirst: false })
               .order('release_date', { ascending: false, nullsFirst: false })
               .limit(60)
          return (await q).data || []
        } catch { return [] }
      })(),
      (async () => {
        try {
          let q = sb.from('albums')
            .select('id, title, slug, cover_image_url, year, month, day, artist_id, artists!albums_artist_id_fkey(name, slug, cover_image_url)')
            .not('year', 'is', null)
          if (personalized) q = q.in('artist_id', artistIds)
          q = q.order('year', { ascending: false }).order('month', { ascending: false, nullsFirst: false }).limit(40)
          return (await q).data || []
        } catch { return [] }
      })(),
    ])
    for (const t of tracksRes as any[]) {
      const a = one(t.artists)
      const date = t.release_date || ymd(t.release_year, t.release_month, t.release_day)
      if (!dateOk(date)) continue
      out.push({
        key: `track-${t.id}`, kind: 'track', title: t.title || '', subtitle: a?.name || null,
        image: t.cover_url || ytThumb(t.video_url) || a?.cover_image_url || null,
        href: `/dainos/${t.slug || t.id}`, date, badge: 'Nauja daina',
        artist: a ? { name: a.name, slug: a.slug } : null,
      })
    }
    for (const al of albumsRes as any[]) {
      const a = one(al.artists)
      const date = ymd(al.year, al.month, al.day)
      if (!dateOk(date)) continue
      out.push({
        key: `album-${al.id}`, kind: 'album', title: al.title || '', subtitle: a?.name || null,
        image: al.cover_image_url || a?.cover_image_url || null,
        href: a?.slug ? `/albumai/${a.slug}-${al.slug}-${al.id}` : `/albumai/${al.slug || ''}-${al.id}`,
        date, badge: 'Naujas albumas',
        artist: a ? { name: a.name, slug: a.slug } : null,
      })
    }
    out.sort((a, b) => Date.parse(b.date || '') - Date.parse(a.date || ''))
    return out
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

  // ── NARIŲ ĮRAŠAI (tik 1-am psl) ─────────────────────────────────────────────
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

  const [music, news, blog, events] = await Promise.all([musicTask(), newsTask(), blogTask(), eventsTask()])

  // Pirmas psl → koncertai viršuje + supinti tipai; tolesni → tik muzika.
  let out: FeedItem[]
  if (before) {
    out = music.slice(0, limit)
  } else {
    const woven = weave({ music: [...music], news, blog, event: [...events] }, limit)
    out = woven
  }

  // Dedupe
  const seen = new Set<string>()
  const deduped: FeedItem[] = []
  for (const it of out) { if (!seen.has(it.key)) { seen.add(it.key); deduped.push(it) } }

  // nextBefore = seniausia grąžinto MUZIKOS item'o data (muzika = gilus šaltinis)
  const musicReturned = deduped.filter(it => it.kind === 'track' || it.kind === 'album')
  const oldestMusic = musicReturned.length ? musicReturned[musicReturned.length - 1].date : null
  const moreMusicAvail = music.length >= 60 || (musicReturned.length > 0 && music.length > musicReturned.length)
  const nextBefore = oldestMusic && moreMusicAvail ? oldestMusic : null

  return { items: deduped, personalized, nextBefore }
}

const getCachedFeed = unstable_cache(
  async (_uid: string, artistIds: number[], limit: number, before: string | null) =>
    buildFeed(artistIds, limit, before),
  ['srautas-feed-v4'],
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
