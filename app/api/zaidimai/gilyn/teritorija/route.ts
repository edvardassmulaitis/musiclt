// app/api/zaidimai/gilyn/teritorija/route.ts
//
// Pilnas teritorijos atlikėjų sąrašas su viewer'io būsenom.
//
// v3: teritorijos ID yra TEKSTINIS (gilyn_terr.id), nariai gyvena
// gilyn_artist_terr lentelėje. Rikiuojam pagal AI žinomumą (artist_fame),
// ne pagal music.lt score — kitaip klasikos ir džiazo teritorijų viršuje
// atsidurtų atsitiktiniai vardai, o Mozartas nugrimztų.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { resolveViewer } from '@/lib/zaidimai'
import { fetchViewerLikes } from '@/lib/gilyn'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const id = (req.nextUrl.searchParams.get('id') || '').trim()
    if (!id) return NextResponse.json({ error: 'Trūksta id' }, { status: 400 })
    const sb = createAdminClient()
    const viewer = await resolveViewer()

    const { data: t } = await sb.from('gilyn_terr')
      .select('id, name, n_artists').eq('id', id).maybeSingle()
    if (!t) return NextResponse.json({ error: 'Nėra tokios teritorijos' }, { status: 404 })

    const { data: mem } = await sb.from('gilyn_artist_terr')
      .select('artist_id').eq('terr_id', id).limit(1500)
    const ids: number[] = ((mem as any[]) || []).map(r => r.artist_id)

    const likes = await fetchViewerLikes(viewer)
    const likedSet = new Set<number>([...likes.artistIds, ...likes.trackArtistIds])
    const nodeState = new Map<number, { visited: boolean; saved: boolean }>()
    if (viewer.userId || viewer.anonId) {
      let q = sb.from('gilyn_map_nodes').select('artist_id, visited, saved')
      q = viewer.userId ? q.eq('user_id', viewer.userId) : q.eq('anon_id', viewer.anonId!)
      const { data } = await q.limit(1000)
      for (const r of (data as any[]) || []) nodeState.set(r.artist_id, { visited: !!r.visited, saved: !!r.saved })
    }

    const fame = new Map<number, number>()
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await sb.from('artist_fame').select('artist_id, fame')
        .in('artist_id', ids.slice(i, i + 300)).limit(300)
      for (const r of (data as any[]) || []) fame.set(r.artist_id, r.fame)
    }

    const artists: { id: number; n: string; img: string | null; score: number; fame: number; k: string | null }[] = []
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await sb.from('artists').select('id, name, cover_image_url, score')
        .in('id', ids.slice(i, i + 200)).limit(200)
      for (const r of (data as any[]) || []) {
        const st = nodeState.get(r.id)
        artists.push({
          id: r.id, n: r.name, img: r.cover_image_url || null,
          score: r.score || 0, fame: fame.get(r.id) || 1,
          k: st?.saved ? 'saved' : st?.visited ? 'visited' : likedSet.has(r.id) ? 'beacon' : null,
        })
      }
    }
    artists.sort((a, b) => (b.fame - a.fame) || (b.score - a.score))

    return NextResponse.json({ id: t.id, name: t.name, total: t.n_artists, artists })
  } catch (e: any) {
    console.error('gilyn teritorija:', e?.message)
    return NextResponse.json({ error: 'Įvyko klaida' }, { status: 500 })
  }
}
