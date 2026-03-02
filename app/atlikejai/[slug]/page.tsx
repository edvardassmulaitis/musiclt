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
    if (!isNaN(id)) { const r = await supabase.from('artists').select('*').eq('id', id).single(); data = r.data }
  }
  return data
}
async function getGenres(id: number) {
  const sb = createAdminClient()
  const { data } = await sb.from('artist_genres').select('genre_id, genres(id, name)').eq('artist_id', id)
  return (data || []).map((g: any) => g.genres).filter(Boolean)
}
async function getLinks(id: number) {
  const sb = createAdminClient()
  const { data } = await sb.from('artist_links').select('platform, url').eq('artist_id', id)
  return data || []
}
async function getPhotos(id: number) {
  const sb = createAdminClient()
  const { data } = await sb.from('artist_photos').select('id, url, caption, sort_order').eq('artist_id', id).order('sort_order')
  return data || []
}
async function getAlbums(id: number) {
  const sb = createAdminClient()
  const { data } = await sb.from('albums')
    .select('id, slug, title, year, month, cover_image_url, type_studio, type_compilation, type_ep, type_single, type_live, type_remix, type_soundtrack, type_demo, spotify_id, video_url')
    .eq('artist_id', id).order('year', { ascending: false })
  return data || []
}
async function getTracks(id: number, limit = 30) {
  const sb = createAdminClient()
  const { data } = await sb.from('tracks')
    .select('id, slug, title, type, video_url, spotify_id, cover_url, release_date, lyrics, is_new, is_new_date, release_year, release_month')
    .eq('artist_id', id).order('created_at', { ascending: false }).limit(limit)
  return data || []
}
async function getMembers(id: number) {
  const sb = createAdminClient()
  const { data } = await sb.from('artist_related')
    .select('related_artist_id, year_from, year_until, artists:related_artist_id(id, slug, name, cover_image_url, type)')
    .eq('artist_id', id)
  return (data || []).map((r: any) => ({ ...(r.artists || {}), member_from: r.year_from, member_until: r.year_until })).filter((m: any) => m.id)
}
async function getFollowers(id: number) {
  const sb = createAdminClient()
  const { count } = await sb.from('artist_follows').select('*', { count: 'exact', head: true }).eq('artist_id', id)
  return count || 0
}
async function getNews(id: number, limit = 4) {
  const sb = createAdminClient()
  const { data } = await sb.from('news').select('id, slug, title, image_small_url, published_at, type').eq('artist_id', id).order('published_at', { ascending: false }).limit(limit)
  return data || []
}
async function getEvents(id: number) {
  const sb = createAdminClient()
  const { data } = await sb.from('event_artists')
    .select('event_id, events(id, slug, title, event_date, venue_custom, image_small_url, venues(name, city))')
    .eq('artist_id', id)
  return (data || []).map((ea: any) => ea.events).filter((e: any) => e && new Date(e.event_date) >= new Date())
    .sort((a: any, b: any) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime()).slice(0, 5)
}
async function getSimilarArtists(artistId: number, genreIds: number[], limit = 12) {
  const sb = createAdminClient()
  if (genreIds.length === 0) return []
  const { data } = await sb.from('artist_genres').select('artist_id, artists:artist_id(id, slug, name, cover_image_url, type)').in('genre_id', genreIds).limit(60)
  const seen = new Set<number>()
  seen.add(artistId)
  const similar: any[] = []
  for (const row of (data || []) as any[]) {
    if (row.artists && !seen.has(row.artists.id)) { seen.add(row.artists.id); similar.push(row.artists) }
    if (similar.length >= limit) break
  }
  return similar
}

function stripColors(html: string): string {
  if (!html) return ''
  return html.replace(/style="[^"]*"/gi, '').replace(/style='[^']*'/gi, '')
}
function extractPlain(html: string): string {
  return (html || '').replace(/<[^>]+>/g, '').slice(0, 200)
}

// Generate mock performance data (replace with real YouTube stats later)
function genMockChart(albums: any[]) {
  const currentYear = new Date().getFullYear()
  const points: { year: number; value: number }[] = []
  for (let y = Math.max(1990, (albums[albums.length - 1]?.year || 2000) - 2); y <= currentYear; y++) {
    const hasAlbum = albums.some(a => a.year === y)
    const base = 20 + Math.random() * 30
    const boost = hasAlbum ? 40 + Math.random() * 30 : 0
    points.push({ year: y, value: Math.round(base + boost) })
  }
  return points
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const artist = await getArtist(slug)
  if (!artist) return { title: 'Atlikėjas nerastas' }
  return {
    title: `${artist.name} — music.lt`,
    description: extractPlain(artist.description) || `${artist.name} profilis music.lt`,
    openGraph: { title: `${artist.name} — music.lt`, images: artist.cover_image_url ? [artist.cover_image_url] : [] },
  }
}

export default async function ArtistPage({ params }: Props) {
  const { slug } = await params
  const artist = await getArtist(slug)
  if (!artist) notFound()

  const [genres, links, dbPhotos, albums, tracks, members, followers, news, events] = await Promise.all([
    getGenres(artist.id), getLinks(artist.id), getPhotos(artist.id),
    getAlbums(artist.id), getTracks(artist.id), getMembers(artist.id),
    getFollowers(artist.id), getNews(artist.id), getEvents(artist.id),
  ])

  const genreIds = genres.map((g: any) => g.id)
  const similar = await getSimilarArtists(artist.id, genreIds)

  // Merge photos
  let photos: { url: string; caption?: string }[] = dbPhotos.map((p: any) => ({ url: p.url, caption: p.caption }))
  if (artist.photos && Array.isArray(artist.photos)) {
    for (const p of artist.photos as any[]) {
      if (p.url && !photos.some(ap => ap.url === p.url)) photos.push({ url: p.url, caption: p.caption || '' })
    }
  }

  // Determine "new music" (last 16 months)
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 16)
  const cutoffYear = cutoff.getFullYear()
  const cutoffMonth = cutoff.getMonth() + 1

  const newAlbums = albums.filter((a: any) => {
    if (a.year && a.month) return a.year > cutoffYear || (a.year === cutoffYear && a.month >= cutoffMonth)
    if (a.year) return a.year >= cutoffYear
    return false
  })

  const newTracks = tracks.filter((t: any) => {
    if (t.is_new) return true
    if (t.is_new_date) return new Date(t.is_new_date) >= cutoff
    if (t.release_date) return new Date(t.release_date) >= cutoff
    if (t.release_year && t.release_month) return t.release_year > cutoffYear || (t.release_year === cutoffYear && t.release_month >= cutoffMonth)
    if (t.release_year) return t.release_year >= cutoffYear
    return false
  })

  const hasNewMusic = newAlbums.length > 0 || newTracks.length > 0
  const topVideos = tracks.filter((t: any) => t.video_url).slice(0, 6)
  const chartData = genMockChart(albums)

  // Mock events if none exist
  const mockEvents = events.length > 0 ? events : []

  const artistData: any = {
    id: artist.id, slug: artist.slug, name: artist.name,
    type: artist.type || 'group', country: artist.country,
    active_from: artist.active_from, active_until: artist.active_until,
    description: stripColors(artist.description || ''),
    cover_image_url: artist.cover_image_url,
    cover_image_wide_url: artist.cover_image_wide_url,
    website: artist.website, spotify_id: artist.spotify_id,
    is_verified: artist.is_verified, gender: artist.gender,
    birth_date: artist.birth_date, death_date: artist.death_date,
  }

  return (
    <ArtistProfileClient
      artist={artistData} genres={genres} links={links} photos={photos}
      albums={albums as any} tracks={tracks as any} members={members}
      followers={followers} news={news as any} events={mockEvents}
      similar={similar} hasNewMusic={hasNewMusic}
      newAlbums={newAlbums as any} newTracks={newTracks as any}
      topVideos={topVideos as any} chartData={chartData}
    />
  )
}
