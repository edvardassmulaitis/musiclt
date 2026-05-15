// Shared helper — computes album + per-track completeness state.
// Naudojama PATCH /api/albums/[id]/enrich (return state po update'o) IR
// GET /api/albums/[id]/completeness (read-only check be modifikacijų).
//
// Track "complete" definicija (admin perspective):
//   - has video_url   (be jo player neveiks)
//   - has release_year (be datos sort'inimas/timeline'ai sulūš)
//   - has lyrics      (jei ne instrumental)
//
// Album "complete" definicija:
//   - has cover_image_url
//   - has year
//   - bent 1 substyle (žanras)
//   - VISOS jo dainos individualiai complete

import type { SupabaseClient } from '@supabase/supabase-js'

export type TrackCompleteness = {
  id: number
  title: string
  type: string
  complete: boolean
  missing: string[]
}

export type AlbumCompleteness = {
  has_cover: boolean
  has_year: boolean
  has_full_date: boolean
  has_peak: boolean
  has_certifications: boolean
  substyles_count: number
  tracks_count: number
  tracks: TrackCompleteness[]
  /** Visos linked dainos individualiai complete (video_url + release_year + lyrics/instrumental). */
  all_tracks_complete: boolean
  /** Album'as fully complete: meta + visi tracks. Frontend rodo žalią ✓ tik šitą TRUE. */
  fully_complete: boolean
}

export async function computeAlbumCompleteness(
  sb: SupabaseClient,
  albumId: number
): Promise<AlbumCompleteness | null> {
  const { data: album } = await sb
    .from('albums')
    .select('cover_image_url, year, month, day, peak_chart_position, certifications')
    .eq('id', albumId)
    .single()
  if (!album) return null

  const { data: subRows } = await sb
    .from('album_substyles')
    .select('substyle_id')
    .eq('album_id', albumId)

  const { data: trackRows } = await sb
    .from('album_tracks')
    .select('track_id, position, tracks(id, title, type, video_url, lyrics, release_year)')
    .eq('album_id', albumId)
    .order('position', { ascending: true })

  const tracks: TrackCompleteness[] = []
  for (const r of (trackRows || []) as any[]) {
    const t = r.tracks
    if (!t) continue
    const missing: string[] = []
    if (!t.video_url) missing.push('video')
    if (!t.release_year) missing.push('data')
    // Instrumental dainos lyrics nereikalingos pagal default'ą.
    if (!t.lyrics && t.type !== 'instrumental') missing.push('lyrics')
    tracks.push({
      id: t.id,
      title: t.title || '',
      type: t.type || 'normal',
      complete: missing.length === 0,
      missing,
    })
  }

  const has_cover = !!album.cover_image_url
  const has_year = !!album.year
  const substyles_count = (subRows || []).length
  const tracks_count = tracks.length
  const all_tracks_complete = tracks_count > 0 && tracks.every(t => t.complete)
  const fully_complete = has_cover && has_year && substyles_count > 0 && all_tracks_complete

  return {
    has_cover,
    has_year,
    has_full_date: !!(album.year && album.month && album.day),
    has_peak: album.peak_chart_position != null,
    has_certifications: Array.isArray(album.certifications) && album.certifications.length > 0,
    substyles_count,
    tracks_count,
    tracks,
    all_tracks_complete,
    fully_complete,
  }
}
