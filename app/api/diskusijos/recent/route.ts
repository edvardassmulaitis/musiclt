// app/api/diskusijos/recent/route.ts
//
// GET /api/diskusijos/recent — naujausios AKTYVIOS diskusijų temos su paskutiniais
// komentarais (Pulsas „Diskusijos" kortelėms). Rikiuojama pagal last_comment_at
// DESC. Kiekvienai temai grąžinam iki 2 paskutinių komentarų (latest_comments;
// latest_comment paliktas back-compat).
//
// ?featured=1 — tik „Dėmesio centre" pažymėtos (featured_until > now), /atrasti
// viršutiniam sliderio blokui.
//
// Komentarai gyvena `comments` lentelėje (discussion_id FK).

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const revalidate = 60

export async function GET(req: Request) {
  const sb = createAdminClient()
  const sp = new URL(req.url).searchParams
  const limit = Math.min(parseInt(sp.get('limit') || '6'), 20)
  const featuredOnly = sp.get('featured') === '1'
  try {
    // SVARBU (supabase-js): filtrai PRIEŠ .order/.limit.
    let q = sb
      .from('discussions')
      .select('id, slug, title, author_name, author_avatar, comment_count, created_at, last_comment_at, featured_until, ' +
        'artist:artist_id(name, slug, cover_image_url)')
      .eq('is_deleted', false)
      .or('legacy_kind.is.null,legacy_kind.eq.discussion')
    if (featuredOnly) q = q.gt('featured_until', new Date().toISOString())
    const ordered = featuredOnly
      ? q.order('featured_until', { ascending: false })
      : q.order('is_pinned', { ascending: false })
          .order('last_comment_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
    const { data: discs } = await ordered.limit(limit)

    const list = (discs || []) as any[]

    // Iki 2 paskutinių komentarų kiekvienai temai (paraleliai, limit 2 desc).
    // async/await + try/catch (NE `.catch` ant PostgREST builder'io).
    const latest = await Promise.all(
      list.map(async (d) => {
        try {
          const r: any = await sb
            .from('comments')
            .select('body, created_at, profiles:author_id(username, full_name, avatar_url)')
            .eq('discussion_id', d.id)
            .eq('is_deleted', false)
            .order('created_at', { ascending: false })
            .limit(2)
          return { id: d.id, cs: (r.data || []) as any[] }
        } catch {
          return { id: d.id, cs: [] as any[] }
        }
      }),
    )
    const latestById = new Map<number, any[]>()
    for (const r of latest) latestById.set(r.id, r.cs)

    const clean = (c: any) => {
      const prof = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles
      const body = String(c.body || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()
      return {
        excerpt: body.length > 600 ? body.slice(0, 600).replace(/\s+\S*$/, '') + '…' : body,
        // username pirmiau — bendruomenėje rodomi username'ai.
        author: prof?.username || prof?.full_name || 'narys',
        avatar: prof?.avatar_url || null,
        created_at: c.created_at,
      }
    }

    const items = list.map((d) => {
      const cs = (latestById.get(d.id) || []).map(clean)
      const art = Array.isArray(d.artist) ? d.artist[0] : d.artist
      return {
        id: d.id,
        slug: d.slug,
        title: d.title || '',
        author_name: d.author_name || null,
        author_avatar: d.author_avatar || null,
        comment_count: d.comment_count ?? 0,
        created_at: d.created_at,
        last_comment_at: d.last_comment_at,
        featured_until: d.featured_until || null,
        artist_name: art?.name || null,
        artist_image: art?.cover_image_url || null,
        latest_comment: cs[0] || null,
        latest_comments: cs,
      }
    })

    return NextResponse.json(
      { items },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    )
  } catch (e: any) {
    return NextResponse.json({ items: [], error: e.message }, { status: 200 })
  }
}
