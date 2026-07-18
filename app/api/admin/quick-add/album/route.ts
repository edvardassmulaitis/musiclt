/**
 * POST /api/admin/quick-add/album
 *
 * Fone kuriamas albumas jau sukurtai dainai. commitTrack (mode='commit')
 * nebekuria albumo inline — daina grąžinama iškart (greitas approvinimas,
 * nenulūžta mobile'e perėjus kitur). Klientas po dainos commit'o iškviečia
 * ŠITĄ endpoint'ą atskiru non-blocking (keepalive) requestu su gauta track_id.
 *
 * Body: { album_mb_release_id, artist_id, track_id, title }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAlbumForTrack } from '@/lib/quick-add'

export const runtime = 'nodejs'
// Albumo single-check'ai (iki 30 throttled MB kvietimų) gali užtrukti ~30s —
// bet dabar tai vyksta fone, admin jau seniai priėmė dainą ir dirba toliau.
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user.role as string) || '')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const releaseId = typeof body.album_mb_release_id === 'string' ? body.album_mb_release_id.trim() : ''
  const artistId = Number(body.artist_id)
  const trackId = Number(body.track_id)
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!releaseId || !artistId || !trackId || !title) {
    return NextResponse.json({ ok: false, error: 'album_mb_release_id, artist_id, track_id, title required' }, { status: 400 })
  }

  try {
    const album = await createAlbumForTrack(releaseId, artistId, trackId, title)
    if (!album) return NextResponse.json({ ok: false, error: 'Nepavyko atkurti albumo (MusicBrainz)' }, { status: 422 })
    return NextResponse.json({ ok: true, album })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 300) }, { status: 500 })
  }
}
