/**
 * POST /api/admin/tracks/merge/preview
 *
 * Given { winner_id, loser_id }, returns a full side-by-side diff payload for
 * the merge UI. Does NOT mutate — purely read.
 *
 * Response shape:
 *   {
 *     winner: { ...track, featuring: [...], albums: [...] },
 *     loser:  { ...track, featuring: [...], albums: [...] },
 *     diff:   [{ field, winner, loser, same }],
 *     unions: {
 *       featuring_after_merge: [{ artist_id, name, from: 'winner'|'loser'|'both'|'loser_main' }],
 *       albums_after_merge:    [{ album_id, title, year, position, from: 'winner'|'loser'|'both' }],
 *     },
 *     warnings: string[]  // e.g. "same main artist — are these really duplicates?"
 *   }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SCALAR_FIELDS = [
  'title', 'type', 'is_single',
  'release_date', 'release_year', 'release_month', 'release_day',
  'video_url', 'spotify_id', 'lyrics', 'chords', 'cover_url', 'description',
] as const

async function loadTrackWithLinks(id: number) {
  const { data: track, error } = await supabase
    .from('tracks')
    .select('*, artists!tracks_artist_id_fkey(id, name, slug)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!track) return null

  const { data: featRows } = await supabase
    .from('track_artists')
    .select('artist_id, is_primary, artists(id, name, slug)')
    .eq('track_id', id)

  const featuring = (featRows || []).map((r: any) => ({
    artist_id: r.artist_id,
    name: r.artists?.name || '',
    slug: r.artists?.slug || '',
    is_primary: !!r.is_primary,
  }))

  const { data: albumRows } = await supabase
    .from('album_tracks')
    .select('position, is_primary, albums(id, title, year)')
    .eq('track_id', id)
    .order('position')

  const albums = (albumRows || [])
    .map((r: any) => r.albums ? {
      album_id: r.albums.id,
      album_title: r.albums.title || '',
      album_year: r.albums.year || null,
      position: r.position || 0,
      is_primary: !!r.is_primary,
    } : null)
    .filter(Boolean) as Array<{
      album_id: number; album_title: string; album_year: number | null; position: number; is_primary: boolean
    }>

  return { ...track, featuring, albums }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const winnerId = Number(body.winner_id)
  const loserId  = Number(body.loser_id)
  if (!winnerId || !loserId) return NextResponse.json({ error: 'winner_id and loser_id required' }, { status: 400 })
  if (winnerId === loserId)   return NextResponse.json({ error: 'winner and loser must differ' }, { status: 400 })

  const [winner, loser] = await Promise.all([
    loadTrackWithLinks(winnerId),
    loadTrackWithLinks(loserId),
  ])
  if (!winner) return NextResponse.json({ error: `winner track ${winnerId} not found` }, { status: 404 })
  if (!loser)  return NextResponse.json({ error: `loser track ${loserId} not found`   }, { status: 404 })

  // Scalar-field diff
  const diff = SCALAR_FIELDS.map(field => ({
    field,
    winner: (winner as any)[field] ?? null,
    loser:  (loser  as any)[field] ?? null,
    same:   (winner as any)[field] === (loser as any)[field],
  }))

  // Featuring union preview
  const featMap = new Map<number, any>()
  for (const f of winner.featuring) featMap.set(f.artist_id, { ...f, from: 'winner' })
  for (const f of loser.featuring) {
    if (featMap.has(f.artist_id)) featMap.get(f.artist_id).from = 'both'
    else featMap.set(f.artist_id, { ...f, from: 'loser' })
  }
  // Loser's main artist becomes featuring on winner (unless already main/featuring)
  if (loser.artist_id !== winner.artist_id && !featMap.has(loser.artist_id)) {
    featMap.set(loser.artist_id, {
      artist_id: loser.artist_id,
      name: loser.artists?.name || '',
      slug: loser.artists?.slug || '',
      is_primary: false,
      from: 'loser_main',
    })
  }
  const featuring_after_merge = [...featMap.values()]

  // Album union preview (ON CONFLICT DO NOTHING — winner's position wins on collision)
  const albumMap = new Map<number, any>()
  for (const a of winner.albums) albumMap.set(a.album_id, { ...a, from: 'winner' })
  for (const a of loser.albums) {
    if (albumMap.has(a.album_id)) albumMap.get(a.album_id).from = 'both'
    else albumMap.set(a.album_id, { ...a, from: 'loser' })
  }
  const albums_after_merge = [...albumMap.values()]

  // Sanity warnings for the UI
  const warnings: string[] = []
  if (winner.artist_id === loser.artist_id) {
    warnings.push('Abi dainos turi tą patį main atlikėją — įsitikink, kad tai tikrai dublikatas, o ne, pvz., remix ar live versija.')
  }
  if ((winner.type || 'normal') !== (loser.type || 'normal')) {
    warnings.push(`Skirtingi dainos tipai (${winner.type || 'normal'} vs ${loser.type || 'normal'}). Paprastai skirtingi tipai (remix/live) NEturi būti suliejami — tai atskiros versijos.`)
  }
  const loserHasLyrics = !!(loser.lyrics && loser.lyrics.trim())
  const winnerHasLyrics = !!(winner.lyrics && winner.lyrics.trim())
  if (loserHasLyrics && !winnerHasLyrics) {
    warnings.push('Tik loser turi lyrics — nepamiršk pažymėti „lyrics: loser", kad neprarastum teksto.')
  }

  return NextResponse.json({
    winner,
    loser,
    diff,
    unions: { featuring_after_merge, albums_after_merge },
    warnings,
  })
}
