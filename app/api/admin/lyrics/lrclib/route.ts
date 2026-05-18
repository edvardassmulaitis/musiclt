import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

// POST /api/admin/lyrics/lrclib
//
// Ieško lyrics per LRCLib (https://lrclib.net) — atviras community lyrics
// service'as su gera EN + LT atlikėjų aprėptimi. NEREIKIA API rakto.
//
// Body: { track_id: number }
// Response: { ok, found, source?, plain_chars?, synced_chars? }
//
// Search strategija:
//   1. /api/get — exact match by artist+track+duration (jei žinom duration)
//   2. /api/search — fuzzy paieška by artist+track
//   3. Filtruoti pagal artist name match (skip rezultatus ne to atlikėjo)
//
// Naudojama Wiki Discography Import auto-cascade flow'e: po Wiki overlay,
// per kiekvieną track be lyrics — kviečiame šitą endpoint'ą.

const LRCLIB_HEADERS = {
  'User-Agent': 'MusicLt/1.0 (https://musiclt.vercel.app)',
  'Lrclib-Client': 'music.lt',
}

function normalize(s: string): string {
  return (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim()
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin','super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }
  const trackId = Number(body?.track_id)
  if (!Number.isFinite(trackId)) return NextResponse.json({ error: 'track_id required' }, { status: 400 })

  const sb = createAdminClient()
  const { data: t } = await sb
    .from('tracks')
    .select('id, title, artist_id, type, lyrics, artists!tracks_artist_id_fkey(name)')
    .eq('id', trackId)
    .maybeSingle()
  if (!t) return NextResponse.json({ error: 'Track not found' }, { status: 404 })
  const track: any = t
  if (track.lyrics) {
    return NextResponse.json({ ok: true, found: false, skipReason: 'lyrics already present' })
  }
  if (track.type === 'instrumental') {
    return NextResponse.json({ ok: true, found: false, skipReason: 'instrumental' })
  }
  const artistName = track.artists?.name || ''
  const trackTitle = track.title || ''
  if (!artistName || !trackTitle) {
    return NextResponse.json({ ok: true, found: false, skipReason: 'missing artist or title' })
  }

  // Step 1: /api/search
  let plainLyrics: string | null = null
  let syncedLyrics: string | null = null
  let source: string = ''
  try {
    const searchUrl = new URL('https://lrclib.net/api/search')
    searchUrl.searchParams.set('artist_name', artistName)
    searchUrl.searchParams.set('track_name', trackTitle)
    const res = await fetch(searchUrl.toString(), {
      headers: LRCLIB_HEADERS,
      signal: AbortSignal.timeout(10_000),
    })
    if (res.ok) {
      const results: any[] = await res.json()
      // Filter to results where artistName matches (normalized)
      const aNorm = normalize(artistName)
      const tNorm = normalize(trackTitle)
      const matching = results.filter(r =>
        normalize(r.artistName || '').includes(aNorm) ||
        aNorm.includes(normalize(r.artistName || ''))
      )
      // Prefer exact title match, then any with lyrics
      const exactTitle = matching.find(r => normalize(r.trackName || '') === tNorm)
      const pick = exactTitle || matching.find(r => r.plainLyrics || r.syncedLyrics) || null
      if (pick) {
        plainLyrics = pick.plainLyrics || null
        syncedLyrics = pick.syncedLyrics || null
        source = 'search'
      }
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: `LRCLib fetch failed: ${e?.message || e}` }, { status: 500 })
  }

  if (!plainLyrics && !syncedLyrics) {
    return NextResponse.json({ ok: true, found: false, skipReason: 'no match in LRCLib' })
  }

  // Update tracks.lyrics — prefer plain, fall back to synced
  const finalLyrics = plainLyrics || syncedLyrics
  const { error: upErr } = await sb
    .from('tracks')
    .update({ lyrics: finalLyrics })
    .eq('id', trackId)
  if (upErr) {
    return NextResponse.json({ error: `Update failed: ${upErr.message}` }, { status: 500 })
  }
  return NextResponse.json({
    ok: true,
    found: true,
    source,
    plain_chars: plainLyrics?.length || 0,
    synced_chars: syncedLyrics?.length || 0,
  })
}
