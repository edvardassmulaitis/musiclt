import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function toInt(v: any): number | null {
  if (v === null || v === undefined || v === '' || v === 0) return null
  const n = typeof v === 'number' ? v : parseInt(String(v))
  return isNaN(n) || n === 0 ? null : n
}

function slugify(text: string): string {
  return text.toLowerCase()
    .replace(/[ąčęėįšųūž]/g, c => ({ ą:'a',č:'c',ę:'e',ė:'e',į:'i',š:'s',ų:'u',ū:'u',ž:'z' }[c] || c))
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export type AlbumFull = {
  id?: number
  slug?: string
  title: string
  artist_id: number
  year?: number | null
  month?: number | null
  day?: number | null
  type_studio: boolean
  type_compilation: boolean
  type_ep: boolean
  type_single: boolean
  type_live: boolean
  type_remix: boolean
  type_covers: boolean
  type_holiday: boolean
  type_soundtrack: boolean
  type_demo: boolean
  cover_image_url?: string
  spotify_id?: string
  video_url?: string
  show_artist_name?: boolean
  show_player?: boolean
  is_upcoming?: boolean
  tracks?: TrackInAlbum[]
}

export type TrackInAlbum = {
  id?: number
  track_id?: number
  title: string
  slug?: string
  sort_order: number
  disc_number?: number
  duration?: string
  type: 'normal' | 'remix' | 'live' | 'mashup' | 'instrumental'
  video_url?: string
  spotify_id?: string
  is_single?: boolean
  // Featuring artists parsed from title e.g. "Song (featuring Jenny Lewis)"
  featuring?: string[]
}

export type TrackFull = {
  id?: number
  slug?: string
  title: string
  artist_id: number
  type: 'normal' | 'remix' | 'live' | 'mashup' | 'instrumental'
  release_date?: string | null
  is_new?: boolean
  video_url?: string
  lyrics?: string
  chords?: string
  description?: string
  spotify_id?: string
  show_player?: boolean
}

// ── Albums ──────────────────────────────────────────────────────────────────

export async function getAlbums(artistId?: number, limit = 50, offset = 0, search = '') {
  let q = supabase.from('albums').select('*, artists!albums_artist_id_fkey(name)', { count: 'exact' })
  if (artistId) q = q.eq('artist_id', artistId)
  if (search) q = q.ilike('title', `%${search}%`)
  q = q.order('year', { ascending: false }).order('month', { ascending: false }).range(offset, offset + limit - 1)
  const { data, error, count } = await q
  if (error) throw error
  return { albums: data || [], total: count || 0 }
}

export async function getAlbumById(id: number): Promise<AlbumFull & { tracks: TrackInAlbum[] }> {
  const { data: album, error } = await supabase
    .from('albums').select('*, artists!albums_artist_id_fkey(name)').eq('id', id).single()
  if (error) throw error

  const { data: trackRows } = await supabase
    .from('album_tracks')
    .select('*, tracks(id, title, slug, type, video_url, spotify_id)')
    .eq('album_id', id)
    .order('position')

  return {
    ...album,
    tracks: (trackRows || []).map((r: any) => ({
      track_id: r.track_id,
      title: r.tracks?.title || '',
      slug: r.tracks?.slug || '',
      sort_order: r.position || 1,
      disc_number: 1,
      duration: '',
      type: r.tracks?.type || 'normal',
      video_url: r.tracks?.video_url || '',
      spotify_id: r.tracks?.spotify_id || '',
      is_single: r.is_primary || false,
    }))
  }
}

export async function createAlbum(data: AlbumFull): Promise<number> {
  if (!data.artist_id) throw new Error('Atlikėjas privalomas')
  const slug = slugify(data.title) + (data.year ? `-${data.year}` : '')

  const { data: existing } = await supabase
    .from('albums').select('id').eq('artist_id', Number(data.artist_id)).eq('slug', slug).maybeSingle()
  if (existing) {
    await updateAlbum(existing.id, data)
    return existing.id
  }
  const { data: row, error } = await supabase.from('albums').insert({
    title: data.title, slug, artist_id: Number(data.artist_id),
    year: toInt(data.year), month: toInt(data.month), day: toInt(data.day),
    type_studio: data.type_studio, type_compilation: data.type_compilation,
    type_ep: data.type_ep, type_single: data.type_single, type_live: data.type_live,
    type_remix: data.type_remix, type_covers: data.type_covers,
    type_holiday: data.type_holiday, type_soundtrack: data.type_soundtrack,
    type_demo: data.type_demo,
    cover_image_url: data.cover_image_url || null,
    spotify_id: data.spotify_id || null,
    video_url: data.video_url || null,
    show_artist_name: data.show_artist_name ?? false,
    show_player: data.show_player ?? false,
    is_upcoming: data.is_upcoming ?? false,
  }).select('id').single()
  if (error) throw error
  if (data.tracks?.length) await syncAlbumTracks(row.id, data.artist_id, data.tracks)
  return row.id
}

export async function updateAlbum(id: number, data: AlbumFull): Promise<void> {
  const slug = slugify(data.title) + (data.year ? `-${data.year}` : '')
  const { error } = await supabase.from('albums').update({
    title: data.title, slug, artist_id: Number(data.artist_id),
    year: toInt(data.year), month: toInt(data.month), day: toInt(data.day),
    type_studio: data.type_studio, type_compilation: data.type_compilation,
    type_ep: data.type_ep, type_single: data.type_single, type_live: data.type_live,
    type_remix: data.type_remix, type_covers: data.type_covers,
    type_holiday: data.type_holiday, type_soundtrack: data.type_soundtrack,
    type_demo: data.type_demo,
    cover_image_url: data.cover_image_url || null,
    spotify_id: data.spotify_id || null,
    video_url: data.video_url || null,
    show_artist_name: data.show_artist_name ?? false,
    show_player: data.show_player ?? false,
    is_upcoming: data.is_upcoming ?? false,
  }).eq('id', id)
  if (error) throw error
  if (data.tracks !== undefined) await syncAlbumTracks(id, data.artist_id, data.tracks || [])
}

export async function deleteAlbum(id: number): Promise<void> {
  await supabase.from('album_tracks').delete().eq('album_id', id)
  const { error } = await supabase.from('albums').delete().eq('id', id)
  if (error) throw error
}

// Find or create an artist by name (used for featuring artists)
async function findOrCreateArtist(name: string): Promise<number | null> {
  const slug = slugify(name)
  // Try to find existing
  const { data: existing } = await supabase
    .from('artists').select('id').eq('slug', slug).maybeSingle()
  if (existing) return existing.id

  // Create new artist (minimal data, can be enriched later)
  const { data: newArtist, error } = await supabase.from('artists').insert({
    name,
    slug,
    type: 'solo',
  }).select('id').single()

  if (error) {
    console.error('Failed to create featuring artist:', name, error)
    return null
  }
  return newArtist?.id || null
}

async function syncAlbumTracks(albumId: number, artistId: number, tracks: TrackInAlbum[]) {
  // Delete existing album_tracks rows
  await supabase.from('album_tracks').delete().eq('album_id', albumId)
  if (!tracks.length) return

  const trackRows = []

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i]
    let trackId = t.track_id

    if (!trackId) {
      // Use cleaned title (without "featuring ...") for the slug/DB title
      const cleanTitle = t.title
        .replace(/\s*\(feat(?:uring)?\.?\s+[^)]+\)/gi, '')
        .replace(/\s*\[feat(?:uring)?\.?\s+[^\]]+\]/gi, '')
        .trim()

      const slug = slugify(cleanTitle)

      const { data: existing } = await supabase
        .from('tracks').select('id').eq('artist_id', artistId).eq('slug', slug).maybeSingle()

      if (existing) {
        trackId = existing.id
      } else {
        const { data: newTrack, error: trackError } = await supabase.from('tracks').insert({
          title: cleanTitle,
          slug,
          artist_id: artistId,
          type: t.type || 'normal',
          video_url: t.video_url || null,
          spotify_id: t.spotify_id || null,
        }).select('id').single()

        if (trackError) {
          console.error('Failed to insert track:', cleanTitle, trackError)
          continue
        }
        trackId = newTrack?.id

        // Handle featuring artists: parse from original title
        if (trackId && t.featuring && t.featuring.length > 0) {
          for (const featName of t.featuring) {
            const featArtistId = await findOrCreateArtist(featName.trim())
            if (featArtistId) {
              await supabase.from('track_artists').upsert({
                track_id: trackId,
                artist_id: featArtistId,
                is_primary: false,
              }, { onConflict: 'track_id,artist_id' })
            }
          }
        }
      }
    }

    if (trackId) {
      trackRows.push({
        album_id: albumId,
        track_id: trackId,
        position: toInt(t.sort_order) || i + 1,
        is_primary: t.is_single || false,
      })
    }
  }

  if (trackRows.length) {
    const { error } = await supabase.from('album_tracks').insert(trackRows)
    if (error) console.error('album_tracks insert error:', error)
  }
}

// ── Tracks ──────────────────────────────────────────────────────────────────

export async function getTracks(artistId?: number, limit = 50, offset = 0, search = '') {
  let q = supabase
    .from('tracks')
    .select(
      '*, artists!tracks_artist_id_fkey(name), track_artists(artist_id), album_tracks(position, is_primary, albums(id, title, year))',
      { count: 'exact' }
    )
  if (artistId) q = q.eq('artist_id', artistId)
  if (search) q = q.ilike('title', `%${search}%`)
  q = q.order('title', { ascending: true }).range(offset, offset + limit - 1)
  const { data, error, count } = await q
  if (error) throw error
  const tracks = (data || []).map((t: any) => ({
    ...t,
    featuring_count: (t.track_artists || []).length,
    album_count: (t.album_tracks || []).length,
    // First album's year for display
    release_year: t.release_date
      ? new Date(t.release_date).getFullYear()
      : (t.album_tracks?.[0]?.albums?.year || null),
    albums_list: (t.album_tracks || []).map((at: any) => ({
      id: at.albums?.id,
      title: at.albums?.title,
      year: at.albums?.year,
      position: at.position,
      is_single: at.is_primary,
    })),
    track_artists: undefined,
    album_tracks: undefined,
  }))
  return { tracks, total: count || 0 }
}

export async function getTrackById(id: number): Promise<TrackFull> {
  const { data, error } = await supabase.from('tracks').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function createTrack(data: TrackFull): Promise<number> {
  const slug = slugify(data.title)
  const { data: row, error } = await supabase.from('tracks').insert({
    title: data.title, slug, artist_id: Number(data.artist_id), type: data.type,
    release_date: data.release_date || null, is_new: data.is_new ?? false,
    video_url: data.video_url || null, lyrics: data.lyrics || null,
    chords: data.chords || null, description: data.description || null,
    spotify_id: data.spotify_id || null, show_player: data.show_player ?? false,
  }).select('id').single()
  if (error) throw error
  return row.id
}

export async function updateTrack(id: number, data: TrackFull): Promise<void> {
  const { error } = await supabase.from('tracks').update({
    title: data.title, artist_id: data.artist_id, type: data.type,
    release_date: data.release_date || null, is_new: data.is_new ?? false,
    video_url: data.video_url || null, lyrics: data.lyrics || null,
    chords: data.chords || null, description: data.description || null,
    spotify_id: data.spotify_id || null, show_player: data.show_player ?? false,
  }).eq('id', id)
  if (error) throw error
}

export async function deleteTrack(id: number): Promise<void> {
  await supabase.from('album_tracks').delete().eq('track_id', id)
  const { error } = await supabase.from('tracks').delete().eq('id', id)
  if (error) throw error
}
