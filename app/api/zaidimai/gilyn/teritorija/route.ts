// app/api/zaidimai/gilyn/teritorija/route.ts
//
// Pilnas teritorijos atlikėjų sąrašas (rikiuota pagal score) su viewer'io būsenom.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { resolveViewer } from '@/lib/zaidimai'
import { fetchViewerLikes } from '@/lib/gilyn'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const id = Number(req.nextUrl.searchParams.get('id') || 0)
    if (!id) return NextResponse.json({ error: 'Trūksta id' }, { status: 400 })
    const sb = createAdminClient()
    const viewer = await resolveViewer()

    const { data: t } = await sb.from('gilyn_territories').select('id, name, n, artist_ids').eq('id', id).maybeSingle()
    if (!t) return NextResponse.json({ error: 'Nėra tokios teritorijos' }, { status: 404 })

    const likes = await fetchViewerLikes(viewer)
    const likedSet = new Set<number>([...likes.artistIds, ...likes.trackArtistIds])
    const nodeState = new Map<number, { visited: boolean; saved: boolean }>()
    if (viewer.userId || viewer.anonId) {
      let q = sb.from('gilyn_map_nodes').select('artist_id, visited, saved')
      q = viewer.userId ? q.eq('user_id', viewer.userId) : q.eq('anon_id', viewer.anonId!)
      const { data } = await q.limit(1000)
      for (const r of (data as any[]) || []) nodeState.set(r.artist_id, { visited: !!r.visited, saved: !!r.saved })
    }

    const ids: number[] = (t.artist_ids || []).slice(0, 1500)
    const artists: { id: number; n: string; img: string | null; score: number; k: string | null }[] = []
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await sb.from('artists').select('id, name, cover_image_url, score')
        .in('id', ids.slice(i, i + 200)).limit(200)
      for (const r of (data as any[]) || []) {
        const st = nodeState.get(r.id)
        artists.push({
          id: r.id, n: r.name, img: r.cover_image_url || null, score: r.score || 0,
          k: st?.saved ? 'saved' : st?.visited ? 'visited' : likedSet.has(r.id) ? 'beacon' : null,
        })
      }
    }
    artists.sort((a, b) => b.score - a.score)

    return NextResponse.json({ id: t.id, name: t.name, total: t.n, artists })
  } catch (e: any) {
    console.error('gilyn teritorija:', e?.message)
    return NextResponse.json({ error: 'Įvyko klaida' }, { status: 500 })
  }
}
