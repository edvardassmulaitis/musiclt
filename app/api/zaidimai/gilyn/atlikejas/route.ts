// app/api/zaidimai/gilyn/atlikejas/route.ts
//
// Atlikėjo kortelė ŽEMĖLAPIO KONTEKSTE — ne bendras atlikėjo puslapis.
//
//   ?id=123&from=1990&to=1996

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { resolveViewer } from '@/lib/zaidimai'
import { fetchViewerLikes } from '@/lib/gilyn'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const id = Number(req.nextUrl.searchParams.get('id') || 0)
    if (!id) return NextResponse.json({ error: 'Trūksta id' }, { status: 400 })
    const from = Number(req.nextUrl.searchParams.get('from') || 0) || null
    const to = Number(req.nextUrl.searchParams.get('to') || 0) || null

    const sb = createAdminClient()
    const viewer = await resolveViewer()

    const [{ data: a }, { data: albums }, { data: fame }] = await Promise.all([
      sb.from('artists').select('id, name, slug, country, cover_image_url, active_from, active_until, description').eq('id', id).maybeSingle(),
      sb.from('albums').select('id, title, slug, year, cover_image_url, type_studio')
        .eq('artist_id', id).not('year', 'is', null).order('year', { ascending: true }).limit(80),
      sb.from('artist_fame').select('fame').eq('artist_id', id).maybeSingle(),
    ])
    if (!a) return NextResponse.json({ error: 'Nėra tokio atlikėjo' }, { status: 404 })

    const inEra = (y: number | null) =>
      y != null && (from == null || y >= from - 1) && (to == null || y <= to + 1)

    const all = (albums as any[]) || []
    const era = all.filter(al => inEra(al.year))
    const other = all.filter(al => !inEra(al.year))

    const likes = await fetchViewerLikes(viewer)
    const liked = likes.artistIds.has(id) || likes.trackArtistIds.has(id)

    let heard = false, visited = false
    if (viewer.userId || viewer.anonId) {
      let q = sb.from('gilyn_map_nodes').select('heard, visited').eq('artist_id', id)
      q = viewer.userId ? q.eq('user_id', viewer.userId) : q.eq('anon_id', viewer.anonId!)
      const { data } = await q.maybeSingle()
      heard = !!(data as any)?.heard
      visited = !!(data as any)?.visited
    }

    return NextResponse.json({
      artist: {
        id: a.id, name: a.name, slug: a.slug, country: a.country,
        img: a.cover_image_url || null,
        from: a.active_from, to: a.active_until,
        fame: (fame as any)?.fame ?? 1,
        bio: (a.description || '').replace(/\[[^\]]*\]/g, '').trim().slice(0, 260),
      },
      state: { liked, heard, visited },
      eraAlbums: era.map(al => ({ id: al.id, t: al.title, slug: al.slug, y: al.year, img: al.cover_image_url || null })),
      otherAlbums: other.map(al => ({ id: al.id, t: al.title, slug: al.slug, y: al.year, img: al.cover_image_url || null })),
    })
  } catch (e: any) {
    console.error('gilyn atlikejas:', e?.message)
    return NextResponse.json({ error: 'Įvyko klaida' }, { status: 500 })
  }
}
