// app/api/diskusijos/recent/route.ts
//
// GET /api/diskusijos/recent — naujausios AKTYVIOS diskusijų temos su PASKUTINIU
// komentaru (Pulsas „Diskusijos" stulpeliui homepage'e). Rikiuojama pagal
// last_comment_at DESC (kaip /api/diskusijos?sort=activity), bet papildomai
// kiekvienai temai pridedam paskutinio komentaro snippet'ą + autorių.
//
// Komentarai gyvena `comments` lentelėje (discussion_id FK). Paskutinį komentarą
// imam per-temą paraleliai (limit 1 desc) — garantuotai gaunam naujausią net jei
// viena tema turi šimtus komentarų.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const revalidate = 60

export async function GET(req: Request) {
  const sb = createAdminClient()
  const limit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') || '6'), 20)
  try {
    const { data: discs } = await sb
      .from('discussions')
      .select('id, slug, title, author_name, author_avatar, comment_count, created_at, last_comment_at')
      .eq('is_deleted', false)
      .or('legacy_kind.is.null,legacy_kind.eq.discussion')
      .order('is_pinned', { ascending: false })
      .order('last_comment_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit)

    const list = (discs || []) as any[]

    // Paskutinis komentaras kiekvienai temai (paraleliai, limit 1 desc).
    // async/await + try/catch (NE `.catch` ant PostgREST builder'io — jo
    // grąžinamas PromiseLike neturi .catch, tsc lūžta).
    const latest = await Promise.all(
      list.map(async (d) => {
        try {
          const r: any = await sb
            .from('comments')
            .select('body, created_at, profiles:author_id(username, full_name, avatar_url)')
            .eq('discussion_id', d.id)
            .eq('is_deleted', false)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          return { id: d.id, c: r.data }
        } catch {
          return { id: d.id, c: null }
        }
      }),
    )
    const latestById = new Map<number, any>()
    for (const r of latest) latestById.set(r.id, r.c)

    const items = list.map((d) => {
      const c = latestById.get(d.id)
      const prof = c ? (Array.isArray(c.profiles) ? c.profiles[0] : c.profiles) : null
      const body = c
        ? String(c.body || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()
        : ''
      return {
        id: d.id,
        slug: d.slug,
        title: d.title || '',
        author_name: d.author_name || null,
        author_avatar: d.author_avatar || null,
        comment_count: d.comment_count ?? 0,
        created_at: d.created_at,
        last_comment_at: d.last_comment_at,
        latest_comment: c
          ? {
              excerpt: body.length > 100 ? body.slice(0, 100).replace(/\s+\S*$/, '') + '…' : body,
              author: prof?.full_name || prof?.username || 'Vartotojas',
              avatar: prof?.avatar_url || null,
              created_at: c.created_at,
            }
          : null,
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
