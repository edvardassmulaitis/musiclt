// app/atlikejai/[slug]/page.tsx
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'
import ArtistProfileClient from './artist-profile-client'
import type { Metadata } from 'next'

type Props = { params: Promise<{ slug: string }> }

async function getArtist(slug: string) {
  const supabase = createAdminClient()
  let { data } = await supabase.from('artists').select('*').eq('slug', slug).single()
  if (!data) {
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
  const { data } = await supabase.from('artist_genres').select('genre_id, genres(id, name)').eq('artist_id', artistId)
  return (data || []).map((g: any) => g.genres).filter(Boolean)
}

async function getArtistLinks(artistId: number) {
  const supabase = createAdminClient()
  const { data } = await supabase.from('artist_links').select('platform, url').eq('artist_id', artistId)
  return data || []
}

async function getArtistPhotos(artistId: number) {
  const supabase = createAdminClient()
  const { data } = await supabase.from('artist_photos').select('id, url, caption, sort_order').eq('artist_id', artistId).order('sort_order')
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

async function getTracks(artistId: number, limit = 20) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('tracks')
    .select('id, slug, title, type, video_url, spotify_id, cover_url, release_date, lyrics')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data || []
}

async function getMembers(artistId: number) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('artist_related')
    .select('related_artist_id, year_from, year_until, artists:related_artist_id(id, slug, name, cover_image_url, type, active_from, active_until)')
    .eq('artist_id', artistId)
  return (data || []).map((r: any) => ({
    ...(r.artists || {}),
    member_from: r.year_from,
    member_until: r.year_until,
  })).filter((m: any) => m.id)
}

async function getArtistBreaks(artistId: number) {
  const supabase = createAdminClient()
  const { data } = await supabase.from('artist_breaks').select('year_from, year_until').eq('artist_id', artistId).order('year_from')
  return data || []
}

async function getFollowerCount(artistId: number) {
  const supabase = createAdminClient()
  const { count } = await supabase.from('artist_follows').select('*', { count: 'exact', head: true }).eq('artist_id', artistId)
  return count || 0
}

async function getLatestNews(artistId: number, limit = 3) {
  const supabase = createAdminClient()
  const { data } = await supabase.from('news').select('id, slug, title, image_small_url, published_at, type').eq('artist_id', artistId).order('published_at', { ascending: false }).limit(limit)
  return data || []
}

async function getUpcomingEvents(artistId: number) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('event_artists')
    .select('event_id, events(id, slug, title, event_date, venue_custom, image_small_url, venues(name, city))')
    .eq('artist_id', artistId)
  const events = (data || []).map((ea: any) => ea.events).filter((e: any) => e && new Date(e.event_date) >= new Date())
    .sort((a: any, b: any) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
  return events.slice(0, 5)
}

function stripInlineColors(html: string): string {
  if (!html) return ''
  // Remove inline color styles that cause black-on-dark issues
  return html
    .replace(/style="[^"]*color:\s*rgb\([^)]*\)[^"]*"/gi, '')
    .replace(/style="[^"]*color:\s*#[0-9a-f]+[^"]*"/gi, '')
    .replace(/style="[^"]*font-family:[^"]*"/gi, '')
    .replace(/style="[^"]*font-size:[^"]*"/gi, '')
    .replace(/style="\s*"/g, '')
}

function extractPlain(html: string): string {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, '').slice(0, 200)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const artist = await getArtist(slug)
  if (!artist) return { title: 'Atlikėjas nerastas' }
  return {
    title: `${artist.name} — music.lt`,
    description: extractPlain(artist.description) || `${artist.name} profilis music.lt platformoje`,
    openGraph: {
      title: `${artist.name} — music.lt`,
      description: extractPlain(artist.description) || `${artist.name} profilis music.lt`,
      images: artist.cover_image_url ? [artist.cover_image_url] : [],
    },
  }
}

export default async function ArtistPage({ params }: Props) {
  const { slug } = await params
  const artist = await getArtist(slug)
  if (!artist) notFound()

  const [genres, links, dbPhotos, albums, tracks, members, breaks, followers, news, events] = await Promise.all([
    getArtistGenres(artist.id),
    getArtistLinks(artist.id),
    getArtistPhotos(artist.id),
    getAlbums(artist.id),
    getTracks(artist.id),
    getMembers(artist.id),
    getArtistBreaks(artist.id),
    getFollowerCount(artist.id),
    getLatestNews(artist.id),
    getUpcomingEvents(artist.id),
  ])

  // Merge photos from artist_photos table + photos JSONB
  let photos: { url: string; caption?: string }[] = dbPhotos.map((p: any) => ({ url: p.url, caption: p.caption }))
  if (artist.photos && Array.isArray(artist.photos)) {
    for (const p of artist.photos as any[]) {
      if (p.url && !photos.some(ap => ap.url === p.url)) {
        photos.push({ url: p.url, caption: p.caption || '' })
      }
    }
  }

  // Clean bio HTML
  const cleanDescription = stripInlineColors(artist.description || '')

  // Find first track with video for hero player
  const heroTrack = tracks.find((t: any) => t.video_url) || null

  const artistData: any = {
    id: artist.id, slug: artist.slug, name: artist.name,
    type: artist.type || 'group', country: artist.country,
    active_from: artist.active_from, active_until: artist.active_until,
    description: cleanDescription,
    cover_image_url: artist.cover_image_url,
    cover_image_wide_url: artist.cover_image_wide_url,
    website: artist.website, spotify_id: artist.spotify_id,
    youtube_channel_id: artist.youtube_channel_id,
    is_verified: artist.is_verified, gender: artist.gender,
  }

  return (
    <ArtistProfileClient
      artist={artistData}
      genres={genres}
      links={links}
      photos={photos}
      albums={albums as any}
      tracks={tracks as any}
      members={members}
      breaks={breaks}
      followers={followers}
      news={news as any}
      events={events}
      heroTrack={heroTrack as any}
    />
  )
}
