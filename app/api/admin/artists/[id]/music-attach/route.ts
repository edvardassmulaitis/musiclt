/**
 * GET /api/admin/artists/[id]/music-attach
 *
 * News Muzikos žingsnio „Albumai" / „Atlikėjai" sub-tab'ams. Grąžina:
 *   - albums: atlikėjo albumai su dainų id sąrašais (kad būtų galima prijungti
 *     visą albumą = jo dainas)
 *   - artist_track_ids: visos atlikėjo dainos (kad būtų galima prijungti visą
 *     atlikėją = jo dainas)
 *
 * „Išskleisti į dainas" modelis — album/artist prijungimas = jų dainų track_id
 * sudėjimas į naujienos dainų sąrašą (news_songs), reuse'inant esamą playerį.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes((session.user.role as string) || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const artistId = parseInt((await params).id, 10)
  if (!Number.isFinite(artistId)) return NextResponse.json({ error: 'Bad id' }, { status: 400 })

  const sb = createAdminClient()

  // Albumai
  const { data: albums } = await sb
    .from('albums')
    .select('id, title, year, cover_image_url')
    .eq('artist_id', artistId)
    .order('year', { ascending: false, nullsFirst: false })
    .limit(100)

  const albumIds = (albums || []).map((a: any) => a.id)
  const tracksByAlbum: Record<number, number[]> = {}
  if (albumIds.length > 0) {
    const { data: at } = await sb
      .from('album_tracks')
      .select('album_id, track_id')
      .in('album_id', albumIds)
    for (const row of (at || []) as any[]) {
      (tracksByAlbum[row.album_id] ||= []).push(row.track_id)
    }
  }

  const albumsOut = (albums || []).map((a: any) => ({
    id: a.id,
    title: a.title,
    year: a.year ?? null,
    cover_url: a.cover_image_url ?? null,
    track_ids: tracksByAlbum[a.id] || [],
    track_count: (tracksByAlbum[a.id] || []).length,
  }))

  // Visos atlikėjo dainos (id) — populiarumo/naujumo tvarka (nauja pirma).
  const { data: tracks } = await sb
    .from('tracks')
    .select('id')
    .eq('artist_id', artistId)
    .order('release_year', { ascending: false, nullsFirst: false })
    .limit(300)
  const artistTrackIds = (tracks || []).map((t: any) => t.id)

  return NextResponse.json({ albums: albumsOut, artist_track_ids: artistTrackIds })
}
