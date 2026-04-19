// app/atlikejai/[slug]/page.tsx
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'
import ArtistProfileClient from './artist-profile-client'
import type { Metadata } from 'next'

type Props = { params: Promise<{ slug: string }> }

async function getArtist(slug: string) {
  const sb = createAdminClient()
  let { data } = await sb.from('artists').select('*').eq('slug', slug).single()
  if (!data) { const id = parseInt(slug); if (!isNaN(id)) { const r = await sb.from('artists').select('*').eq('id', id).single(); data = r.data } }
  return data
}
async function getGenres(id: number) { const sb = createAdminClient(); const { data } = await sb.from('artist_genres').select('genre_id, genres(id, name)').eq('artist_id', id); return (data || []).map((g: any) => g.genres).filter(Boolean) }
async function getLinks(id: number) { const sb = createAdminClient(); const { data } = await sb.from('artist_links').select('platform, url').eq('artist_id', id); return data || [] }
async function getPhotos(id: number) { const sb = createAdminClient(); const { data } = await sb.from('artist_photos').select('id, url, caption, sort_order').eq('artist_id', id).order('sort_order'); return data || [] }
async function getAlbums(id: number) { const sb = createAdminClient(); const { data } = await sb.from('albums').select('id, slug, title, year, month, cover_image_url, type_studio, type_compilation, type_ep, type_single, type_live, type_remix, type_soundtrack, type_demo, spotify_id, video_url').eq('artist_id', id).order('year', { ascending: false }); return data || [] }
async function getTracks(id: number) { const sb = createAdminClient(); const { data } = await sb.from('tracks').select('id, slug, title, type, video_url, spotify_id, cover_url, release_date, lyrics, is_new, is_new_date, release_year, release_month').eq('artist_id', id).order('created_at', { ascending: false }).limit(40); return data || [] }
async function getMembers(id: number) { const sb = createAdminClient(); const { data } = await sb.from('artist_related').select('related_artist_id, year_from, year_until, artists:related_artist_id(id, slug, name, cover_image_url, type)').eq('artist_id', id); return (data || []).map((r: any) => ({ ...(r.artists || {}), member_from: r.year_from, member_until: r.year_until })).filter((m: any) => m.id) }
async function getFollowers(id: number) { const sb = createAdminClient(); const { count } = await sb.from('artist_follows').select('*', { count: 'exact', head: true }).eq('artist_id', id); return count || 0 }
async function getLikeCount(id: number) { const sb = createAdminClient(); const { count } = await sb.from('artist_likes').select('*', { count: 'exact', head: true }).eq('artist_id', id); return count || 0 }
async function getNews(id: number) { const sb = createAdminClient(); const { data } = await sb.from('news').select('id, slug, title, image_small_url, published_at, type').eq('artist_id', id).order('published_at', { ascending: false }).limit(4); return data || [] }
async function getEvents(id: number) {
  const sb = createAdminClient()
  const { data } = await sb.from('event_artists').select('event_id, events(id, slug, title, event_date, venue_custom, image_small_url, venues(name, city))').eq('artist_id', id)
  return (data || []).map((ea: any) => ea.events).filter((e: any) => e && new Date(e.event_date) >= new Date()).sort((a: any, b: any) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime()).slice(0, 6)
}
async function getSimilar(artistId: number, genreIds: number[]) {
  if (!genreIds.length) return []
  const sb = createAdminClient()
  const { data } = await sb.from('artist_genres').select('artist_id, artists:artist_id(id, slug, name, cover_image_url)').in('genre_id', genreIds).limit(80)
  const seen = new Set([artistId]); const out: any[] = []
  for (const r of (data || []) as any[]) { if (r.artists && !seen.has(r.artists.id)) { seen.add(r.artists.id); out.push(r.artists) } if (out.length >= 14) break }
  return out
}

function stripStyles(html: string) { return (html || '').replace(/style="[^"]*"/gi, '').replace(/style='[^']*'/gi, '') }
function plain(html: string) { return (html || '').replace(/<[^>]+>/g, '').slice(0, 200) }
function mockChart(albums: any[]) {
  const cy = new Date().getFullYear(); const pts: { year: number; value: number }[] = []
  const start = Math.max(1985, (albums[albums.length - 1]?.year || 2000) - 2)
  for (let y = start; y <= cy; y++) { const has = albums.some((a: any) => a.year === y); pts.push({ year: y, value: Math.round(20 + Math.random() * 30 + (has ? 40 + Math.random() * 30 : 0)) }) }
  return pts
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params; const a = await getArtist(slug)
  if (!a) return { title: 'Nerastas' }
  return { title: `${a.name} — music.lt`, description: plain(a.description) || `${a.name} music.lt`, openGraph: { title: `${a.name} — music.lt`, images: a.cover_image_url ? [a.cover_image_url] : [] } }
}

export default async function ArtistPage({ params }: Props) {
  const { slug } = await params; const artist = await getArtist(slug); if (!artist) notFound()
  const [genres, links, dbPhotos, albums, tracks, members, followers, likeCount, news, rawEvents] = await Promise.all([
    getGenres(artist.id), getLinks(artist.id), getPhotos(artist.id), getAlbums(artist.id), getTracks(artist.id),
    getMembers(artist.id), getFollowers(artist.id), getLikeCount(artist.id), getNews(artist.id), getEvents(artist.id),
  ])
  const similar = await getSimilar(artist.id, genres.map((g: any) => g.id))

  let photos: { url: string; caption?: string }[] = dbPhotos.map((p: any) => ({ url: p.url, caption: p.caption }))
  if (artist.photos && Array.isArray(artist.photos)) { for (const p of artist.photos as any[]) { if (p.url && !photos.some(x => x.url === p.url)) photos.push({ url: p.url, caption: p.caption || '' }) } }

  const heroImage = artist.cover_image_wide_url || artist.cover_image_url || (photos.length > 0 ? photos[0].url : null)

  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 16)
  const cutY = cutoff.getFullYear(); const cutM = cutoff.getMonth() + 1
  const newTracks = tracks.filter((t: any) => {
    if (t.is_new) return true; if (t.is_new_date) return new Date(t.is_new_date) >= cutoff
    if (t.release_date) return new Date(t.release_date) >= cutoff
    if (t.release_year && t.release_month) return t.release_year > cutY || (t.release_year === cutY && t.release_month >= cutM)
    if (t.release_year) return t.release_year >= cutY; return false
  })
  const topVideos = tracks.filter((t: any) => t.video_url).slice(0, 8)

  const events = rawEvents.length > 0 ? rawEvents : [
    { id: 901, slug: 'mock', title: `${artist.name} koncertas Vilniuje`, event_date: new Date(Date.now() + 30 * 86400000).toISOString(), venue_custom: 'Compensa koncertų salė', venues: { name: 'Compensa', city: 'Vilnius' } },
    { id: 902, slug: 'mock2', title: `${artist.name} @ Kauno arena`, event_date: new Date(Date.now() + 60 * 86400000).toISOString(), venues: { name: 'Žalgirio arena', city: 'Kaunas' } },
  ]

  return (
    <ArtistProfileClient
      artist={{ id: artist.id, slug: artist.slug, name: artist.name, type: artist.type || 'group', country: artist.country, active_from: artist.active_from, active_until: artist.active_until, description: stripStyles(artist.description || ''), cover_image_url: artist.cover_image_url, cover_image_position: artist.cover_image_position, website: artist.website, spotify_id: artist.spotify_id, is_verified: artist.is_verified, gender: artist.gender, birth_date: artist.birth_date, death_date: artist.death_date }}
      heroImage={heroImage} genres={genres} links={links} photos={photos} albums={albums as any} tracks={tracks as any}
      members={members} followers={followers} likeCount={likeCount} news={news as any} events={events}
      similar={similar} newTracks={newTracks as any} topVideos={topVideos as any}
      chartData={mockChart(albums)} hasNewMusic={newTracks.length > 0}
    />
  )
}
