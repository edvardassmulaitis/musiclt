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

/** music.lt authoritative count nuo artist page label. Scrape metu paimtas. */
function getAuthoritativeLegacyCount(artist: any): number {
  return artist?.legacy_like_count ?? 0
}
async function getGenres(id: number) { const sb = createAdminClient(); const { data } = await sb.from('artist_genres').select('genre_id, genres(id, name)').eq('artist_id', id); return (data || []).map((g: any) => g.genres).filter(Boolean) }
async function getLinks(id: number) { const sb = createAdminClient(); const { data } = await sb.from('artist_links').select('platform, url').eq('artist_id', id); return data || [] }
async function getPhotos(id: number) { const sb = createAdminClient(); const { data } = await sb.from('artist_photos').select('id, url, caption, sort_order').eq('artist_id', id).order('sort_order'); return data || [] }
async function getAlbums(id: number) { const sb = createAdminClient(); const { data } = await sb.from('albums').select('id, slug, title, year, month, cover_image_url, type_studio, type_compilation, type_ep, type_single, type_live, type_remix, type_soundtrack, type_demo, spotify_id, video_url, legacy_id').eq('artist_id', id).order('year', { ascending: false }); return data || [] }
async function getTracks(id: number) { const sb = createAdminClient(); const { data } = await sb.from('tracks').select('id, slug, title, type, video_url, spotify_id, cover_url, release_date, lyrics, is_new, is_new_date, release_year, release_month, legacy_id').eq('artist_id', id).order('created_at', { ascending: false }).limit(40); return data || [] }
async function getAllArtistTrackLegacyIds(id: number) { const sb = createAdminClient(); const { data } = await sb.from('tracks').select('legacy_id').eq('artist_id', id).not('legacy_id', 'is', null); return (data || []).map((t: any) => t.legacy_id).filter((x: any) => typeof x === 'number') }

/** Sumedžioja legacy community info: visus likes artist + visiems jo albumams + tracks.
 * Grąžina suma, unikalūs vartotojai, top fans (su like_count). */
async function getLegacyCommunity(
  artistLegacyId: number | null,
  albumLegacyIds: number[],
  trackLegacyIds: number[],
) {
  if (!artistLegacyId) {
    return {
      totalEvents: 0,
      distinctUsers: 0,
      artistLikes: 0,
      topFans: [] as { user_username: string; user_rank: string | null; user_avatar_url: string | null; like_count: number }[],
      allArtistFans: [] as { user_username: string; user_rank: string | null; user_avatar_url: string | null }[],
    }
  }
  const sb = createAdminClient()

  // Artist-level likes — tai kas rodoma main ♥ button'e (match'ina music.lt UI).
  // Albumų/tracks likes reikalingi tik aggregate distinctUsers stat'ui (modal'o info).
  const artistLikesP = sb
    .from('legacy_likes')
    .select('user_username, user_rank, user_avatar_url')
    .eq('entity_type', 'artist')
    .eq('entity_legacy_id', artistLegacyId)
    .range(0, 9999)

  const albumLikesP = albumLegacyIds.length > 0
    ? sb.from('legacy_likes')
        .select('user_username, user_rank, user_avatar_url')
        .eq('entity_type', 'album')
        .in('entity_legacy_id', albumLegacyIds)
        .range(0, 9999)
    : Promise.resolve({ data: [] as any[] })

  const trackLikesP = trackLegacyIds.length > 0
    ? sb.from('legacy_likes')
        .select('user_username, user_rank, user_avatar_url')
        .eq('entity_type', 'track')
        .in('entity_legacy_id', trackLegacyIds)
        .range(0, 9999)
    : Promise.resolve({ data: [] as any[] })

  const [a, al, tr] = await Promise.all([artistLikesP, albumLikesP, trackLikesP])
  const artistRows = ((a as any).data || []) as { user_username: string; user_rank: string | null; user_avatar_url: string | null }[]
  const all = [...artistRows, ...((al as any).data || []), ...((tr as any).data || [])] as typeof artistRows

  // Artist fans — unique, sort by rank priority + alpha
  const seenArtist = new Set<string>()
  const allArtistFans = artistRows
    .filter(r => { if (seenArtist.has(r.user_username)) return false; seenArtist.add(r.user_username); return true })
    .sort((a, b) => rankPriority(b.user_rank) - rankPriority(a.user_rank) || a.user_username.localeCompare(b.user_username))

  // Aggregate tally (for distinctUsers stat)
  const tally = new Map<string, { count: number; rank: string | null; avatar: string | null }>()
  for (const l of all) {
    const ex = tally.get(l.user_username) || { count: 0, rank: null, avatar: null }
    tally.set(l.user_username, {
      count: ex.count + 1,
      rank: ex.rank || l.user_rank,
      avatar: ex.avatar || l.user_avatar_url,
    })
  }

  const topFans = Array.from(tally.entries())
    .map(([u, v]) => ({ user_username: u, user_rank: v.rank, user_avatar_url: v.avatar, like_count: v.count }))
    .sort((a, b) => b.like_count - a.like_count || a.user_username.localeCompare(b.user_username))
    .slice(0, 30)

  return {
    totalEvents: all.length,
    distinctUsers: tally.size,
    artistLikes: allArtistFans.length,  // <- match'ina music.lt UI skaičių
    topFans,
    allArtistFans,
  }
}

/** Rank priority — aukštesni statusai (VIP, Super) sort'ui į viršų. */
function rankPriority(rank: string | null | undefined): number {
  if (!rank) return 0
  const r = rank.toLowerCase()
  if (r.includes('super')) return 100
  if (r.includes('ultra')) return 90
  if (r.includes('vip')) return 80
  if (r.includes('įsibėgėjantis') || r.includes('isibegejantis')) return 70
  if (r.includes('aktyvus narys')) return 60
  if (r.includes('narys')) return 50
  if (r.includes('aktyvus naujokas')) return 40
  if (r.includes('naujokas')) return 30
  return 10
}

/** Randame forum_threads, kurie surišti su šiuo atlikėju per URL/slug.
 * Music.lt diskusijos patternai:
 *  - /lt/diskusijos/tema/{id}/{slug}/   (naujesnis)
 *  - /lt/diskusijos/{slug}-diskusijosg-{id}.html  (legacy)
 * Kadangi `title`/`post_count`/`last_post_at` scrape'e netrimti (visi null),
 * rendering'e title deriviname iš `slug`, o sort'us darome pagal legacy_id desc
 * (music.lt ID'ai monotoniški — didesnis = naujesnis thread). */
async function getLegacyForumThreads(artist: { name: string; slug: string }, limit = 6) {
  if (!artist.slug) return []
  const sb = createAdminClient()
  // Sanitize slug — tik a-z/0-9/- (ILIKE yra case-insensitive, saugu)
  const needle = artist.slug.toLowerCase().replace(/[^a-z0-9-]/g, '')
  if (!needle || needle.length < 3) return []
  const pat = `%${needle}%`
  const { data } = await sb
    .from('forum_threads')
    .select('legacy_id, slug, source_url, kind, title, post_count, last_post_at')
    .eq('kind', 'discussion')
    .or(`source_url.ilike.${pat},slug.ilike.${pat}`)
    .order('last_post_at', { ascending: false, nullsFirst: false })
    .limit(limit)
  return data || []
}

/** Atskirai paimam news — naudoja tokį patį URL pattern, bet kind='news' */
async function getLegacyNewsThreads(artist: { name: string; slug: string }, limit = 12) {
  if (!artist.slug) return []
  const sb = createAdminClient()
  const needle = artist.slug.toLowerCase().replace(/[^a-z0-9-]/g, '')
  if (!needle || needle.length < 3) return []
  const pat = `%${needle}%`
  const { data } = await sb
    .from('forum_threads')
    .select('legacy_id, slug, source_url, kind, title, post_count, first_post_at, last_post_at')
    .eq('kind', 'news')
    .or(`source_url.ilike.${pat},slug.ilike.${pat}`)
    .order('first_post_at', { ascending: false, nullsFirst: false })
    .limit(limit)
  return data || []
}
/** Members — admin saves to artist_members (group_id + member_id pair).
 * When this artist IS the group, rows where group_id = artistId; join artists
 * on member_id to get the member's profile. */
async function getMembers(id: number) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('artist_members')
    .select('member_id, year_from, year_to, is_current, artists:member_id(id, slug, name, cover_image_url, type)')
    .eq('group_id', id)
  return (data || [])
    .map((r: any) => ({ ...(r.artists || {}), member_from: r.year_from, member_until: r.is_current ? null : r.year_to }))
    .filter((m: any) => m.id)
}

/** Substyles — admin saves additional music styles to artist_substyles. */
async function getSubstyles(id: number): Promise<{ id: number; name: string }[]> {
  const sb = createAdminClient()
  const { data } = await sb
    .from('artist_substyles')
    .select('substyle_id, substyles:substyle_id(id, name)')
    .eq('artist_id', id)
  return (data || []).map((r: any) => r.substyles).filter(Boolean)
}
async function getFollowers(id: number) { const sb = createAdminClient(); const { count } = await sb.from('artist_follows').select('*', { count: 'exact', head: true }).eq('artist_id', id); return count || 0 }
async function getLikeCount(id: number) { const sb = createAdminClient(); const { count } = await sb.from('artist_likes').select('*', { count: 'exact', head: true }).eq('artist_id', id); return count || 0 }
async function getNews(id: number) { const sb = createAdminClient(); const { data } = await sb.from('news').select('id, slug, title, image_small_url, published_at, type').eq('artist_id', id).order('published_at', { ascending: false }).limit(4); return data || [] }
async function getEvents(id: number) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('event_artists')
    .select('event_id, events(id, slug, title, start_date, end_date, venue_name, city, cover_image_url, status)')
    .eq('artist_id', id)
  const now = Date.now()
  const events = (data || [])
    .map((ea: any) => ea.events)
    .filter((e: any) => e && e.start_date)
  // Upcoming (asc) first, then past (desc). Cap at 12 combined.
  const upcoming = events
    .filter((e: any) => new Date(e.start_date).getTime() >= now)
    .sort((a: any, b: any) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
  const past = events
    .filter((e: any) => new Date(e.start_date).getTime() < now)
    .sort((a: any, b: any) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())
  return [...upcoming, ...past].slice(0, 12)
}
async function getSimilar(artistId: number, genreIds: number[]) {
  if (!genreIds.length) return []
  const sb = createAdminClient()
  const { data } = await sb.from('artist_genres').select('artist_id, artists:artist_id(id, slug, name, cover_image_url)').in('genre_id', genreIds).limit(80)
  const seen = new Set([artistId]); const out: any[] = []
  for (const r of (data || []) as any[]) { if (r.artists && !seen.has(r.artists.id)) { seen.add(r.artists.id); out.push(r.artists) } if (out.length >= 14) break }
  return out
}

/** Simple rank snapshot.
 * Country: position among artists of same country by legacy_like_count (when available)
 * Genre: position in top genre by like count.
 * These are coarse approximations — they use legacy_like_count as proxy for popularity.
 * Real rank (by plays) will come once we have listening-session data.
 * Returns the set of ranks that make sense to show. */
async function getArtistRanks(
  artistId: number,
  country: string | null,
  genres: { id: number; name: string }[],
  legacyLikeCount: number,
): Promise<{ category: string; rank: number; total: number; scope: 'country' | 'genre' | 'global' }[]> {
  if (legacyLikeCount <= 0) return []
  const sb = createAdminClient()
  const out: { category: string; rank: number; total: number; scope: 'country' | 'genre' | 'global' }[] = []

  // Country rank
  if (country) {
    const { data: peers } = await sb
      .from('artists')
      .select('id, legacy_like_count')
      .eq('country', country)
      .not('legacy_like_count', 'is', null)
    const rows = (peers || []).filter((p: any) => p.id !== artistId)
    const higher = rows.filter((p: any) => (p.legacy_like_count ?? 0) > legacyLikeCount).length
    out.push({ category: country, rank: higher + 1, total: rows.length + 1, scope: 'country' })
  }

  // Genre rank (top genre only)
  if (genres.length > 0) {
    const g = genres[0]
    const { data: gpeers } = await sb
      .from('artist_genres')
      .select('artist_id, artists!inner(id, legacy_like_count)')
      .eq('genre_id', g.id)
    const rows = (gpeers || [])
      .map((r: any) => r.artists)
      .filter((a: any) => a && a.id !== artistId && a.legacy_like_count != null)
    const higher = rows.filter((a: any) => (a.legacy_like_count ?? 0) > legacyLikeCount).length
    if (rows.length + 1 >= 2) {
      out.push({ category: g.name, rank: higher + 1, total: rows.length + 1, scope: 'genre' })
    }
  }

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
  const [genres, substyles, links, dbPhotos, albums, tracks, members, followers, likeCount, news, rawEvents, allTrackLegacyIds, legacyThreads, legacyNews] = await Promise.all([
    getGenres(artist.id), getSubstyles(artist.id), getLinks(artist.id), getPhotos(artist.id), getAlbums(artist.id), getTracks(artist.id),
    getMembers(artist.id), getFollowers(artist.id), getLikeCount(artist.id), getNews(artist.id), getEvents(artist.id),
    getAllArtistTrackLegacyIds(artist.id),
    getLegacyForumThreads({ name: artist.name, slug: artist.slug }),
    getLegacyNewsThreads({ name: artist.name, slug: artist.slug }, 12),
  ])
  const similar = await getSimilar(artist.id, genres.map((g: any) => g.id))

  // Legacy community — aggregated likes (artist + all his albums + tracks)
  const albumLegacyIds = (albums as any[])
    .map((a) => a.legacy_id)
    .filter((x) => typeof x === 'number')
  const legacyCommunity = await getLegacyCommunity(
    (artist as any).legacy_id ?? null,
    albumLegacyIds,
    allTrackLegacyIds,
  )

  let photos: { url: string; caption?: string }[] = dbPhotos.map((p: any) => ({ url: p.url, caption: p.caption }))
  if (artist.photos && Array.isArray(artist.photos)) { for (const p of artist.photos as any[]) { if (p.url && !photos.some(x => x.url === p.url)) photos.push({ url: p.url, caption: p.caption || '' }) } }

  // Hero image preference:
  //  1. Explicitly set wide cover (admin-chosen)
  //  2. First photo from gallery — typically higher-res than the small square cover
  //  3. Standard cover_image_url (often a low-res profile square) as last resort
  // TODO: add hero_photo_id FK so admin can pick a specific gallery photo.
  const galleryFirst = photos.length > 0 ? photos[0].url : null
  const heroImage = artist.cover_image_wide_url
    || (galleryFirst && galleryFirst !== artist.cover_image_url ? galleryFirst : null)
    || artist.cover_image_url
    || galleryFirst

  // Trending — tracks released in last 24 months (2 years)
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 24)
  const cutY = cutoff.getFullYear(); const cutM = cutoff.getMonth() + 1
  const newTracks = tracks.filter((t: any) => {
    if (t.is_new) return true; if (t.is_new_date) return new Date(t.is_new_date) >= cutoff
    if (t.release_date) return new Date(t.release_date) >= cutoff
    if (t.release_year && t.release_month) return t.release_year > cutY || (t.release_year === cutY && t.release_month >= cutM)
    if (t.release_year) return t.release_year >= cutY; return false
  })
  const topVideos = tracks.filter((t: any) => t.video_url).slice(0, 8)

  const events = rawEvents

  // Compute ranks (country, genre) using legacy_like_count as proxy
  const ranks = await getArtistRanks(
    artist.id,
    artist.country || null,
    genres as { id: number; name: string }[],
    (artist as any).legacy_like_count ?? 0,
  )

  return (
    <ArtistProfileClient
      artist={{ id: artist.id, slug: artist.slug, name: artist.name, type: artist.type || 'group', country: artist.country, active_from: artist.active_from, active_until: artist.active_until, description: stripStyles(artist.description || ''), cover_image_url: artist.cover_image_url, cover_image_position: artist.cover_image_position, website: artist.website, spotify_id: artist.spotify_id, is_verified: artist.is_verified, gender: artist.gender, birth_date: artist.birth_date, death_date: artist.death_date, legacy_id: (artist as any).legacy_id ?? null, source: (artist as any).source ?? null, legacy_like_count: (artist as any).legacy_like_count ?? 0 }}
      heroImage={heroImage} genres={genres} links={links} photos={photos} albums={albums as any} tracks={tracks as any}
      members={members} followers={followers} likeCount={likeCount} news={news as any} events={events}
      similar={similar} newTracks={newTracks as any} topVideos={topVideos as any}
      chartData={mockChart(albums)} hasNewMusic={newTracks.length > 0}
      legacyCommunity={legacyCommunity} legacyThreads={legacyThreads as any} legacyNews={legacyNews as any}
      ranks={ranks}
      substyles={substyles}
    />
  )
}
