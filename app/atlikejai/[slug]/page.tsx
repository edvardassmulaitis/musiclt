// app/atlikejai/[slug]/page.tsx
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'
import ArtistProfileClient from './artist-profile-client'
import type { Metadata } from 'next'

type Props = { params: Promise<{ slug: string }> }

async function getArtist(slug: string) {
  const supabase = createAdminClient()

  // Try slug first, then try as ID for backwards compat
  let query = supabase
    .from('artists')
    .select('*')
    .eq('slug', slug)
    .single()

  let { data, error } = await query
  if (error || !data) {
    // Try by ID
    const id = parseInt(slug)
    if (!isNaN(id)) {
      const r = await supabase.from('artists').select('*').eq('id', id).single()
      data = r.data
    }
  }
  return data
}

async function getArtistGenres(artistId: number) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('artist_genres')
    .select('genre_id, genres(id, name)')
    .eq('artist_id', artistId)
  return (data || []).map((g: any) => g.genres).filter(Boolean)
}

async function getArtistLinks(artistId: number) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('artist_links')
    .select('platform, url')
    .eq('artist_id', artistId)
  return data || []
}

async function getArtistPhotos(artistId: number) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('artist_photos')
    .select('id, url, caption, sort_order')
    .eq('artist_id', artistId)
    .order('sort_order')
  return data || []
}

async function getAlbums(artistId: number) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('albums')
    .select('id, slug, title, year, month, cover_image_url, type_studio, type_compilation, type_ep, type_single, type_live, type_remix, type_soundtrack, type_demo, spotify_id, video_url')
    .eq('artist_id', artistId)
    .order('year', { ascending: false })
  return data || []
}

async function getPopularTracks(artistId: number, limit = 10) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('tracks')
    .select('id, slug, title, type, video_url, spotify_id, cover_url, release_date, lyrics')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data || []
}

async function getRelatedArtists(artistId: number) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('artist_related')
    .select('related_artist_id, year_from, year_until, artists:related_artist_id(id, slug, name, cover_image_url, type)')
    .eq('artist_id', artistId)
  return (data || []).map((r: any) => ({ ...r.artists, year_from: r.year_from, year_until: r.year_until })).filter(Boolean)
}

async function getArtistBreaks(artistId: number) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('artist_breaks')
    .select('year_from, year_until')
    .eq('artist_id', artistId)
    .order('year_from')
  return data || []
}

async function getFollowerCount(artistId: number) {
  const supabase = createAdminClient()
  const { count } = await supabase
    .from('artist_follows')
    .select('*', { count: 'exact', head: true })
    .eq('artist_id', artistId)
  return count || 0
}

async function getLatestNews(artistId: number, limit = 3) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('news')
    .select('id, slug, title, image_small_url, published_at, type')
    .eq('artist_id', artistId)
    .order('published_at', { ascending: false })
    .limit(limit)
  return data || []
}

async function getUpcomingEvents(artistId: number) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('event_artists')
    .select('event_id, events(id, slug, title, event_date, venue_custom, image_small_url, venues(name, city))')
    .eq('artist_id', artistId)
    .order('sort_order')
  const events = (data || [])
    .map((ea: any) => ea.events)
    .filter((e: any) => e && new Date(e.event_date) >= new Date())
    .sort((a: any, b: any) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
  return events.slice(0, 5)
}

function extractDescription(desc?: string | null): string {
  if (!desc) return ''
  return desc.replace(/<[^>]+>/g, '').slice(0, 200)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const artist = await getArtist(slug)
  if (!artist) return { title: 'Atlikėjas nerastas' }
  const img = artist.cover_image_url || artist.cover_image_wide_url
  return {
    title: `${artist.name} — music.lt`,
    description: extractDescription(artist.description) || `${artist.name} profilis music.lt platformoje`,
    openGraph: {
      title: `${artist.name} — music.lt`,
      description: extractDescription(artist.description) || `${artist.name} profilis music.lt`,
      images: img ? [img] : [],
    },
  }
}

export default async function ArtistPage({ params }: Props) {
  const { slug } = await params
  const artist = await getArtist(slug)
  if (!artist) notFound()

  const [genres, links, photos, albums, tracks, related, breaks, followers, news, events] = await Promise.all([
    getArtistGenres(artist.id),
    getArtistLinks(artist.id),
    getArtistPhotos(artist.id),
    getAlbums(artist.id),
    getPopularTracks(artist.id),
    getRelatedArtists(artist.id),
    getArtistBreaks(artist.id),
    getFollowerCount(artist.id),
    getLatestNews(artist.id),
    getUpcomingEvents(artist.id),
  ])

  // Merge artist_photos table + photos jsonb field
  let allPhotos = photos.map((p: any) => ({ url: p.url, caption: p.caption }))
  if (artist.photos && Array.isArray(artist.photos)) {
    for (const p of artist.photos as any[]) {
      if (p.url && !allPhotos.some((ap: any) => ap.url === p.url)) {
        allPhotos.push({ url: p.url, caption: p.caption || '' })
      }
    }
  }

  const artistData: any = {
    id: artist.id,
    slug: artist.slug,
    name: artist.name,
    type: artist.type || 'group',
    country: artist.country,
    active_from: artist.active_from,
    active_until: artist.active_until,
    description: artist.description,
    cover_image_url: artist.cover_image_url,
    cover_image_wide_url: artist.cover_image_wide_url,
    website: artist.website,
    spotify_id: artist.spotify_id,
    youtube_channel_id: artist.youtube_channel_id,
    is_verified: artist.is_verified,
    gender: artist.gender,
    birth_date: artist.birth_date,
    death_date: artist.death_date,
    subdomain: artist.subdomain,
  }

  return (
    <ArtistProfileClient
      artist={artistData}
      genres={genres}
      links={links}
      photos={allPhotos}
      albums={albums}
      tracks={tracks}
      related={related}
      breaks={breaks}
      followers={followers}
      news={news}
      events={events}
    />
  )
}
