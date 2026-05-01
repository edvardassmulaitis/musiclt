// app/albumai/[slugId]/page.tsx
//
// URL pattern: /albumai/{artist-slug}-{album-slug}-{id}
//   pvz. /albumai/atlanta-vejas-man-pasake-12345
//
// Slug verifikacija po DB lookup'o; jei neatitinka — 301 redirect į canonical
// (su artist prefix'u). Apsaugo nuo legacy URL'ų be artist + spelling renames.
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'
import { createAdminClient } from '@/lib/supabase'
import AlbumPageClient from '@/app/lt/albumas/[slug]/[id]/album-page-client'
import { PageLoader } from '@/components/PageLoader'
import type { Metadata } from 'next'

type Props = { params: Promise<{ slugId: string }> }

function parseSlugId(slugId: string): { slug: string; id: number } | null {
  const m = slugId.match(/^(.+)-(\d+)$/)
  if (!m) return null
  const id = parseInt(m[2], 10)
  if (isNaN(id)) return null
  return { slug: m[1], id }
}

async function getAlbum(id: number) {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('albums')
    .select('*, artists!albums_artist_id_fkey(id, name, slug, cover_image_url, country)')
    .eq('id', id)
    .single()
  if (error || !data) return null
  return data
}

async function getAlbumTracks(albumId: number) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('album_tracks')
    .select('position, is_primary, tracks(id, slug, title, type, video_url, spotify_id, lyrics, is_new, track_artists(is_primary, artists(id, name, slug)))')
    .eq('album_id', albumId)
    .order('position')
  return (data || []).map((r: any) => {
    const featuring = (r.tracks?.track_artists || [])
      .filter((ta: any) => !ta.is_primary)
      .map((ta: any) => ta.artists?.name)
      .filter(Boolean)
    return {
      id: r.tracks?.id,
      slug: r.tracks?.slug,
      title: r.tracks?.title || '',
      type: r.tracks?.type || 'normal',
      video_url: r.tracks?.video_url || null,
      is_new: r.tracks?.is_new || false,
      is_single: r.is_primary || false,
      position: r.position || 1,
      featuring,
    }
  }).filter((t: any) => t.id)
}

async function getOtherAlbums(artistId: number, currentId: number) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('albums')
    .select('id, slug, title, year, cover_image_url, type_studio, type_ep, type_single, type_live, type_compilation, type_remix, type_soundtrack, type_demo')
    .eq('artist_id', artistId)
    .neq('id', currentId)
    .order('year', { ascending: false })
    .limit(8)
  return data || []
}

async function getSimilarAlbums(artistId: number, currentId: number) {
  const sb = createAdminClient()
  // Get genres of artist
  const { data: genreRows } = await sb
    .from('artist_genres')
    .select('genre_id')
    .eq('artist_id', artistId)
  const genreIds = (genreRows || []).map((g: any) => g.genre_id)
  if (!genreIds.length) return []

  // Find artists with same genres
  const { data: artistRows } = await sb
    .from('artist_genres')
    .select('artist_id')
    .in('genre_id', genreIds)
    .neq('artist_id', artistId)
    .limit(30)
  const artistIds = [...new Set((artistRows || []).map((r: any) => r.artist_id))]
  if (!artistIds.length) return []

  // Get albums from those artists
  const { data } = await sb
    .from('albums')
    .select('id, slug, title, year, cover_image_url, artists!albums_artist_id_fkey(id, name, slug)')
    .in('artist_id', artistIds)
    .not('cover_image_url', 'is', null)
    .order('year', { ascending: false })
    .limit(10)
  return (data || []).filter((a: any) => a.id !== currentId)
}

async function getAlbumLikes(albumId: number) {
  const sb = createAdminClient()
  // Unified likes table: count auth + legacy_scrape + anon likes for this album
  const { count } = await sb
    .from('likes')
    .select('*', { count: 'exact', head: true })
    .eq('entity_type', 'album')
    .eq('entity_id', albumId)
  return count || 0
}

async function getLegacyAlbumLikes(albumLegacyId: number | null) {
  if (!albumLegacyId) return { count: 0, users: [] as { user_username: string; user_rank: string | null }[] }
  const sb = createAdminClient()
  // Query unified likes table for legacy_scrape + auth users who liked via music.lt legacy
  const [cntRes, usersRes] = await Promise.all([
    sb.from('likes')
      .select('*', { count: 'exact', head: true })
      .eq('entity_type', 'album')
      .eq('entity_legacy_id', albumLegacyId),
    sb.from('likes')
      .select('user_username, user_rank, user_avatar_url')
      .eq('entity_type', 'album')
      .eq('entity_legacy_id', albumLegacyId)
      .order('id', { ascending: true })
      .limit(30),
  ])
  return {
    count: cntRes.count || 0,
    users: (usersRes.data as any[]) || [],
  }
}

// getRelatedNews removed — was unused (never called from the page render).

function albumType(a: any) {
  if (a.type_ep) return 'EP'
  if (a.type_single) return 'Singlas'
  if (a.type_live) return 'Live'
  if (a.type_compilation) return 'Rinkinys'
  if (a.type_remix) return 'Remix'
  if (a.type_soundtrack) return 'OST'
  if (a.type_demo) return 'Demo'
  return 'Albumas'
}

function formatDate(year?: number, month?: number, day?: number) {
  if (!year) return null
  const MONTHS = ['sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio', 'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio']
  if (month && day) return `${year} ${MONTHS[month - 1]} ${day}`
  if (month) return `${year} ${MONTHS[month - 1]}`
  return `${year}`
}

function plain(html: string) {
  return (html || '').replace(/<[^>]+>/g, '').slice(0, 200)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slugId } = await params
  const parsed = parseSlugId(slugId)
  if (!parsed) return { title: 'Nerastas' }

  const album = await getAlbum(parsed.id)
  if (!album) return { title: 'Nerastas' }
  const artist = album.artists
  return {
    title: `${album.title} — ${artist?.name} — music.lt`,
    description: `${album.title} albumas. ${artist?.name}. ${album.year || ''}`,
    openGraph: {
      title: `${album.title} — ${artist?.name}`,
      images: album.cover_image_url ? [album.cover_image_url] : [],
    },
  }
}

// SUSPENSE PATTERN — žr. /atlikejai/[slug]/page.tsx komentarą. parseSlugId
// pati nieko neužklauisa (URL parse), todėl iškart grąžinam Suspense
// wrapper'į ir slow queries vykdom <AlbumContent> viduje (stream'ina į
// fallback slot'ą). Naudotojas iš karto mato PageLoader'į vietoj balto ekrano.
export default async function AlbumPage({ params }: Props) {
  const { slugId } = await params
  const parsed = parseSlugId(slugId)
  if (!parsed) notFound()

  return (
    <Suspense fallback={<PageLoader variant="album" />}>
      <AlbumContent slugFromUrl={parsed.slug} albumId={parsed.id} />
    </Suspense>
  )
}

async function AlbumContent({ slugFromUrl, albumId }: { slugFromUrl: string; albumId: number }) {
  const slug = slugFromUrl

  const [album, tracks, likes] = await Promise.all([
    getAlbum(albumId),
    getAlbumTracks(albumId),
    getAlbumLikes(albumId),
  ])
  if (!album) notFound()

  const artist = album.artists

  // Canonical: /albumai/{artist-slug}-{album-slug}-{id}
  if (artist?.slug) {
    const canonicalSlug = `${artist.slug}-${album.slug}`
    if (slug !== canonicalSlug) {
      redirect(`/albumai/${canonicalSlug}-${albumId}`)
    }
  } else if (album.slug !== slug) {
    notFound()
  }

  const [otherAlbums, similarAlbums, legacyLikes] = await Promise.all([
    getOtherAlbums(artist.id, albumId),
    getSimilarAlbums(artist.id, albumId),
    getLegacyAlbumLikes(album.legacy_id ?? null),
  ])

  return (
    <AlbumPageClient
      album={{
        id: album.id,
        slug: album.slug,
        title: album.title,
        type: albumType(album),
        year: album.year,
        month: album.month,
        day: album.day,
        dateFormatted: formatDate(album.year, album.month, album.day),
        cover_image_url: album.cover_image_url || null,
        video_url: album.video_url || null,
        show_player: album.show_player || false,
        is_upcoming: album.is_upcoming || false,
        type_studio: album.type_studio || false,
        legacy_id: album.legacy_id ?? null,
      }}
      artist={{
        id: artist.id,
        slug: artist.slug,
        name: artist.name,
        cover_image_url: artist.cover_image_url || null,
      }}
      tracks={tracks}
      otherAlbums={otherAlbums.map((a: any) => ({ ...a, type: albumType(a) }))}
      similarAlbums={similarAlbums}
      likes={likes}
    />
  )
}
