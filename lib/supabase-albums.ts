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
  let q = supabase.from('albums').select('*, artists(name)', { count: 'exact' })
  if (artistId) q = q.eq('artist_id', artistId)
  if (search) q = q.ilike('title', `%${search}%`)
  q = q.order('year', { ascending: false }).order('month', { ascending: false }).range(offset, offset + limit - 1)
  const { data, error, count } = await q
  if (error) throw error
  return { albums: data || [], total: count || 0 }
}

export async function getAlbumById(id: number): Promise<AlbumFull & { tracks: TrackInAlbum[] }> {
  const { data: album, error } = await supabase
    .from('albums').select('*, artists(name)').eq('id', id).single()
  if (error) throw error

  const { data: trackRows } = await supabase
    .from('album_tracks')
    .select('*, tracks(id, title, slug, type, video_url, spotify_id)')
    .eq('album_id', id)
    .order('disc_number').order('sort_order')

  return {
    ...album,
    tracks: (trackRows || []).map((r: any) => ({
      id: r.id,
      track_id: r.track_id,
      title: r.tracks?.title || '',
      slug: r.tracks?.slug || '',
      sort_order: r.sort_order,
      disc_number: r.disc_number || 1,
      duration: r.duration,
      type: r.tracks?.type || 'normal',
      video_url: r.tracks?.video_url || '',
      spotify_id: r.tracks?.spotify_id || '',
      is_single: r.is_single || false,
    }))
  }
}

export async function createAlbum(data: AlbumFull): Promise<number> {
  if (!data.artist_id) throw new Error('Atlikėjas privalomas')
  const slug = slugify(data.title) + (data.year ? `-${data.year}` : '')
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

async function syncAlbumTracks(albumId: number, artistId: number, tracks: TrackInAlbum[]) {
  await supabase.from('album_tracks').delete().eq('album_id', albumId)
  if (!tracks.length) return

  const trackRows = []
  for (const t of tracks) {
    let trackId = t.track_id
    if (!trackId) {
      const slug = slugify(t.title)
      const { data: existing } = await supabase
        .from('tracks').select('id').eq('artist_id', artistId).eq('slug', slug).maybeSingle()
      if (existing) {
        trackId = existing.id
      } else {
        const { data: newTrack } = await supabase.from('tracks').insert({
          title: t.title, slug, artist_id: artistId, type: t.type || 'normal',
          video_url: t.video_url || null, spotify_id: t.spotify_id || null,
        }).select('id').single()
        trackId = newTrack?.id
      }
    }
    if (trackId) {
      trackRows.push({
        album_id: albumId, track_id: trackId,
        sort_order: toInt(t.sort_order) || 1,
        ...(t.disc_number ? { disc_number: toInt(t.disc_number) || 1 } : {}),
        ...(t.duration ? { duration: t.duration } : {}),
        ...(t.is_single !== undefined ? { is_single: t.is_single } : {}),
      })
    }
  }
  if (trackRows.length) await supabase.from('album_tracks').insert(trackRows)
}

// ── Tracks ──────────────────────────────────────────────────────────────────

export async function getTracks(artistId?: number, limit = 50, offset = 0, search = '') {
  let q = supabase.from('tracks').select('*, artists(name)', { count: 'exact' })
  if (artistId) q = q.eq('artist_id', artistId)
  if (search) q = q.ilike('title', `%${search}%`)
  q = q.order('release_date', { ascending: false }).range(offset, offset + limit - 1)
  const { data, error, count } = await q
  if (error) throw error
  return { tracks: data || [], total: count || 0 }
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
