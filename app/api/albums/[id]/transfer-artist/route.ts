import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

// POST /api/albums/[id]/transfer-artist
//
// Perkelia album'ą į kitą atlikėją + optionally jo dainas.
// Naudojimas: kai music.lt scrape įrašė "The Cosmos Rocks" po Queen, bet
// realybe jis priklauso "Queen + Paul Rodgers" — admin sukuria naują atlikėją,
// tada per album form'ą paspaudžia transfer.
//
// Body:
//   {
//     target_artist_id: number,    // naujas atlikėjas (turi egzistuoti)
//     cascade_tracks: boolean,     // ar perkelti ir visus album'o tracks
//     skip_shared: boolean,        // jei cascade, praleisti tracks, kurios
//                                  // taip pat linkint'os į kitus albumus
//                                  // (kad nepakeistume kitų atlikėjų album'ų)
//   }
//
// Response:
//   {
//     ok: true,
//     album_updated: boolean,
//     tracks_updated: number,
//     tracks_skipped_shared: number,
//   }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin','super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id: idStr } = await params
  const albumId = parseInt(idStr)
  if (!Number.isFinite(albumId)) {
    return NextResponse.json({ error: 'Bad album id' }, { status: 400 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }
  const targetArtistId = Number(body?.target_artist_id)
  const cascadeTracks = !!body?.cascade_tracks
  const skipShared = body?.skip_shared !== false  // default true
  if (!Number.isFinite(targetArtistId) || targetArtistId <= 0) {
    return NextResponse.json({ error: 'Reikia target_artist_id' }, { status: 400 })
  }

  const sb = createAdminClient()

  // Sanity: target artist egzistuoja
  const { data: targetArtist } = await sb.from('artists').select('id, name').eq('id', targetArtistId).maybeSingle()
  if (!targetArtist) {
    return NextResponse.json({ error: `Target atlikejas id=${targetArtistId} neegzistuoja` }, { status: 404 })
  }

  // Album core update
  const { data: album, error: alErr } = await sb
    .from('albums').select('id, title, artist_id').eq('id', albumId).maybeSingle()
  if (alErr || !album) {
    return NextResponse.json({ error: 'Album not found' }, { status: 404 })
  }
  const oldArtistId = (album as any).artist_id

  const { error: upAlbErr } = await sb.from('albums').update({ artist_id: targetArtistId }).eq('id', albumId)
  if (upAlbErr) {
    return NextResponse.json({ error: `Album update failed: ${upAlbErr.message}` }, { status: 500 })
  }

  let tracksUpdated = 0
  let tracksSkippedShared = 0

  if (cascadeTracks) {
    // Surinkti visus track_id, kurie linkint'i prie šio album'o
    const { data: atLinks } = await sb
      .from('album_tracks')
      .select('track_id')
      .eq('album_id', albumId)
    const trackIds = (atLinks || []).map((r: any) => r.track_id).filter(Boolean) as number[]
    if (trackIds.length > 0) {
      // skip_shared logic: praleisti track'us, kurie linkint'i ir prie kitų
      // albumų (kad nepakeistume kitų album'ų atlikėjo).
      let candidateTrackIds = trackIds
      if (skipShared) {
        const { data: otherLinks } = await sb
          .from('album_tracks')
          .select('track_id, album_id')
          .in('track_id', trackIds)
          .neq('album_id', albumId)
        const sharedSet = new Set<number>((otherLinks || []).map((r: any) => r.track_id))
        tracksSkippedShared = sharedSet.size
        candidateTrackIds = trackIds.filter(t => !sharedSet.has(t))
      }
      if (candidateTrackIds.length > 0) {
        // Update tracks.artist_id batch'iniu way'u
        const { error: upTrkErr } = await sb
          .from('tracks')
          .update({ artist_id: targetArtistId })
          .in('id', candidateTrackIds)
        if (upTrkErr) {
          return NextResponse.json({
            error: `Track update partial fail: ${upTrkErr.message}`,
            album_updated: true,
            tracks_updated: 0,
            tracks_skipped_shared: tracksSkippedShared,
          }, { status: 500 })
        }
        tracksUpdated = candidateTrackIds.length
      }
    }
  }

  return NextResponse.json({
    ok: true,
    album_updated: true,
    old_artist_id: oldArtistId,
    new_artist_id: targetArtistId,
    new_artist_name: (targetArtist as any).name,
    tracks_updated: tracksUpdated,
    tracks_skipped_shared: tracksSkippedShared,
  })
}
