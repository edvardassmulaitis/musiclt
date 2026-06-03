// app/api/srautas/feed/route.ts
//
// GET /api/srautas/feed?limit=24&before=<ISO>
//
// Asmeninis „Srautas" — turinys pritaikytas nariui pagal jo pamėgtus atlikėjus
// (likes entity_type='artist'). Agreguoja kelis šaltinius į vieną chronologinį
// srautą: naujienos (news_artists), narių įrašai (blog_post_artists), naujos
// dainos ir albumai (artist_id). Jei narys neprisijungęs arba dar nieko nepamėgo
// → fallback į „trending" (naujausias turinys visiems), su personalized=false.
//
// Resilient: kiekvienas šaltinis savo try/catch — jei lentelės/kolonos nėra,
// grąžinam ką turim, o ne 500.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/

type FeedItem = {
  key: string
  kind: 'news' | 'blog' | 'track' | 'album'
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

export async function GET(req: NextRequest) {
  const sb = createAdminClient()
  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('limit') || '24'), 1), 50)
  const before = req.nextUrl.searchParams.get('before') // ISO date cursor
  const beforeMs = before ? Date.parse(before) : null

  // ── 1. Kas prisijungęs + jo pamėgti atlikėjai ──────────────────────────────
  let artistIds: number[] = []
  try {
    const session = await getServerSession(authOptions)
    const uid = (session?.user as any)?.id as string | undefined
    if (uid) {
      const { data } = await sb
        .from('likes')
        .select('entity_id')
        .eq('entity_type', 'artist')
        .eq('user_id', uid)
        .limit(2000)
      artistIds = Array.from(new Set((data || []).map((r: any) => Number(r.entity_id)).filter(Boolean)))
    }
  } catch { /* anon / no session */ }

  const personalized = artistIds.length > 0
  const items: FeedItem[] = []

  // ── 2. Naujienos ───────────────────────────────────────────────────────────
  try {
    let newsIds: number[] | null = null
    if (personalized) {
      const { data: na } = await sb
        .from('news_artists')
        .select('news_id')
        .in('artist_id', artistIds)
        .limit(400)
      newsIds = Array.from(new Set((na || []).map((r: any) => Number(r.news_id)).filter(Boolean)))
    }
    if (!personalized || (newsIds && newsIds.length)) {
      let q = sb
        .from('news')
        .select('id, slug, title, image_small_url, image_title_url, published_at')
        .not('published_at', 'is', null)
        .lte('published_at', new Date().toISOString())
        .order('published_at', { ascending: false })
        .limit(60)
      if (newsIds) q = q.in('id', newsIds)
      if (before) q = q.lt('published_at', before)
      const { data } = await q
      for (const n of (data || []) as any[]) {
        items.push({
          key: `news-${n.id}`, kind: 'news', title: n.title || '',
          subtitle: null, image: n.image_title_url || n.image_small_url || null,
          href: `/news/${n.slug}`, date: n.published_at, badge: 'Naujiena',
        })
      }
    }
  } catch { /* ignore */ }

  // ── 3. Narių įrašai (blog) ──────────────────────────────────────────────────
  try {
    let postIds: number[] | null = null
    if (personalized) {
      const { data: ba } = await sb
        .from('blog_post_artists')
        .select('post_id')
        .in('artist_id', artistIds)
        .limit(400)
      postIds = Array.from(new Set((ba || []).map((r: any) => Number(r.post_id)).filter(Boolean)))
    }
    if (!personalized || (postIds && postIds.length)) {
      let q = sb
        .from('blog_posts')
        .select('id, slug, title, cover_image_url, post_type, rating, published_at, ' +
          'blogs:blog_id(slug, profiles:user_id(full_name, username, avatar_url))')
        .eq('status', 'published')
        .not('published_at', 'is', null)
        .lte('published_at', new Date().toISOString())
        .order('published_at', { ascending: false })
        .limit(60)
      if (postIds) q = q.in('id', postIds)
      if (before) q = q.lt('published_at', before)
      const { data } = await q
      for (const p of (data || []) as any[]) {
        const blog = one(p.blogs)
        const prof = one(blog?.profiles)
        const blogSlug = blog?.slug || prof?.username
        items.push({
          key: `blog-${p.id}`, kind: 'blog', title: p.title || '',
          subtitle: prof?.full_name || prof?.username || null,
          image: p.cover_image_url || null,
          href: blogSlug ? `/blogas/${blogSlug}/${p.slug}` : '/blogas',
          date: p.published_at, badge: 'Įrašas',
          meta: { post_type: p.post_type, rating: p.rating, avatar: prof?.avatar_url || null },
        })
      }
    }
  } catch { /* ignore */ }

  // ── 4. Naujos dainos ────────────────────────────────────────────────────────
  try {
    let q = sb
      .from('tracks')
      .select('id, title, slug, cover_url, video_url, release_date, artist_id, ' +
        'artists!tracks_artist_id_fkey(name, slug, cover_image_url)')
      .not('release_date', 'is', null)
      .order('release_date', { ascending: false })
      .limit(40)
    if (personalized) q = q.in('artist_id', artistIds)
    if (before) q = q.lt('release_date', before)
    const { data } = await q
    for (const t of (data || []) as any[]) {
      const a = one(t.artists)
      items.push({
        key: `track-${t.id}`, kind: 'track', title: t.title || '',
        subtitle: a?.name || null,
        image: t.cover_url || ytThumb(t.video_url) || a?.cover_image_url || null,
        href: `/dainos/${t.slug || t.id}`,
        date: t.release_date, badge: 'Nauja daina',
        artist: a ? { name: a.name, slug: a.slug } : null,
      })
    }
  } catch { /* ignore */ }

  // ── 5. Nauji albumai ────────────────────────────────────────────────────────
  try {
    let q = sb
      .from('albums')
      .select('id, title, slug, cover_image_url, year, month, day, artist_id, ' +
        'artists!albums_artist_id_fkey(name, slug, cover_image_url)')
      .not('year', 'is', null)
      .order('year', { ascending: false })
      .order('month', { ascending: false, nullsFirst: false })
      .limit(40)
    if (personalized) q = q.in('artist_id', artistIds)
    const { data } = await q
    for (const al of (data || []) as any[]) {
      const a = one(al.artists)
      const d = albumDate(al.year, al.month, al.day)
      items.push({
        key: `album-${al.id}`, kind: 'album', title: al.title || '',
        subtitle: a?.name || null,
        image: al.cover_image_url || a?.cover_image_url || null,
        href: a?.slug ? `/albumai/${a.slug}-${al.slug}-${al.id}` : `/albumai/${al.slug || ''}-${al.id}`,
        date: d, badge: 'Naujas albumas',
        artist: a ? { name: a.name, slug: a.slug } : null,
      })
    }
  } catch { /* ignore */ }

  // ── 6. Merge: filtruoti pagal cursor, rikiuoti pagal datą, dedupinti, riboti ─
  const merged = items
    .filter(it => {
      if (!it.date) return false
      if (beforeMs == null) return true
      const t = Date.parse(it.date)
      return Number.isFinite(t) && t < beforeMs
    })
    .sort((a, b) => Date.parse(b.date || '') - Date.parse(a.date || ''))

  const seen = new Set<string>()
  const out: FeedItem[] = []
  for (const it of merged) {
    if (seen.has(it.key)) continue
    seen.add(it.key)
    out.push(it)
    if (out.length >= limit) break
  }

  const nextBefore = out.length >= limit ? out[out.length - 1].date : null

  return NextResponse.json({ items: out, personalized, nextBefore })
}
