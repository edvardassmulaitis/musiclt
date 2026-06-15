// Atlikėjo zona → „Visa muzika": dainų ir albumų valdymas.
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveProfile } from '@/lib/profile-resolve'
import { getTeamArtists, pickActiveArtist } from '@/lib/artist-studio'
import { createAdminClient } from '@/lib/supabase'
import EmptyStudio from '../EmptyStudio'
import MusicClient from './MusicClient'

export const dynamic = 'force-dynamic'

const ALBUM_TYPES: [string, string][] = [
  ['type_studio', 'studio'], ['type_ep', 'ep'], ['type_single', 'single'], ['type_live', 'live'],
  ['type_compilation', 'compilation'], ['type_remix', 'remix'], ['type_covers', 'covers'],
  ['type_holiday', 'holiday'], ['type_soundtrack', 'soundtrack'], ['type_demo', 'demo'],
]

export default async function StudioMusic({ searchParams }: { searchParams: Promise<{ a?: string }> }) {
  const sp = await searchParams
  const session = await getServerSession(authOptions)
  const profile = await resolveProfile(session)
  const artists = profile?.id ? await getTeamArtists(profile.id) : []
  const active = pickActiveArtist(artists, sp.a)
  if (!active) return <EmptyStudio />

  const sb = createAdminClient()
  const [tracksRes, albumsRes] = await Promise.all([
    sb.from('tracks')
      .select('id, title, slug, video_url, video_uploaded_at, video_views, is_pinned, legacy_id, release_year, release_month, release_day')
      .eq('artist_id', active.id)
      .order('is_pinned', { ascending: false })
      .order('video_uploaded_at', { ascending: false, nullsFirst: false })
      .order('release_year', { ascending: false, nullsFirst: false })
      .limit(500),
    sb.from('albums')
      .select('id, slug, title, year, month, day, cover_image_url, description, legacy_id, track_count, is_upcoming, ' + ALBUM_TYPES.map((t) => t[0]).join(', '))
      .eq('artist_id', active.id)
      .order('year', { ascending: false, nullsFirst: false })
      .limit(300),
  ])

  const tracks = (tracksRes.data || []) as any[]
  const albums = (albumsRes.data || []) as any[]

  // album_tracks visiems šio atlikėjo albumams
  const albumIds = albums.map((a) => a.id)
  let atByAlbum: Record<number, number[]> = {}
  if (albumIds.length) {
    const { data: at } = await sb.from('album_tracks').select('album_id, track_id, position').in('album_id', albumIds).order('position')
    for (const r of (at || []) as any[]) {
      (atByAlbum[r.album_id] ||= []).push(r.track_id)
    }
  }

  const songs = tracks.map((t) => ({
    id: t.id, title: t.title, slug: t.slug, video_url: t.video_url,
    video_uploaded_at: t.video_uploaded_at, video_views: t.video_views,
    is_pinned: !!t.is_pinned, is_legacy: t.legacy_id != null,
    year: t.release_year ?? null, month: t.release_month ?? null, day: t.release_day ?? null,
  }))

  const albumsOut = albums.map((a) => {
    const typeCol = ALBUM_TYPES.find((t) => a[t[0]])
    return {
      id: a.id, slug: a.slug, title: a.title,
      year: a.year ?? null, month: a.month ?? null, day: a.day ?? null,
      cover_image_url: a.cover_image_url, description: a.description,
      is_legacy: a.legacy_id != null, is_upcoming: !!a.is_upcoming,
      type: typeCol ? typeCol[1] : 'studio',
      trackIds: atByAlbum[a.id] || [],
    }
  })

  return (
    <MusicClient
      artist={{ id: active.id, slug: active.slug, name: active.name }}
      songs={songs}
      albums={albumsOut}
    />
  )
}
