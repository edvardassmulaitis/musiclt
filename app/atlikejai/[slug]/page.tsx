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

// (legacy_like_count cache buvo pašalintas — visus likes count'us imam tiesiai
// iš `likes` lentelės. Šis helper'is liko tik komentaru, kad būtų aišku
// kodėl nebėra fallback'o.)
async function getGenres(id: number) { const sb = createAdminClient(); const { data } = await sb.from('artist_genres').select('genre_id, genres(id, name)').eq('artist_id', id); return (data || []).map((g: any) => g.genres).filter(Boolean) }
async function getLinks(id: number) {
  const sb = createAdminClient()
  const { data } = await sb.from('artist_links').select('platform, url').eq('artist_id', id)
  return data || []
}

/** Admin stores social URLs as columns on the artists table (spotify, youtube,
 *  facebook, tiktok, twitter, soundcloud, bandcamp). The artist_links junction
 *  isn't used by the current admin form, so pull socials from the artist row
 *  and merge with any legacy artist_links rows — deduped by platform. */
function buildSocialLinks(
  artist: any,
  tableLinks: { platform: string; url: string }[],
): { platform: string; url: string }[] {
  const fromCols: { platform: string; url: string }[] = []
  const fields: Array<keyof any> = ['spotify', 'youtube', 'facebook', 'tiktok', 'twitter', 'soundcloud', 'bandcamp']
  for (const f of fields) {
    const val = (artist as any)[f]
    if (val && typeof val === 'string' && val.trim()) {
      fromCols.push({ platform: f as string, url: val.trim() })
    }
  }
  const seen = new Set<string>()
  const out: { platform: string; url: string }[] = []
  for (const l of [...fromCols, ...tableLinks]) {
    if (!l.platform || !l.url) continue
    if (seen.has(l.platform)) continue
    seen.add(l.platform)
    out.push(l)
  }
  return out
}

/** Set of track ids that ARE linked to any album of this artist.
 *  Tracks not in this set = "kitos dainos" (orphan tracks). */
async function getLinkedTrackIds(artistId: number): Promise<Set<number>> {
  const sb = createAdminClient()
  const linked = new Set<number>()
  try {
    const { data: albums } = await sb.from('albums').select('id').eq('artist_id', artistId)
    const albumIds = (albums || []).map((a: any) => a.id).filter((n: any) => typeof n === 'number')
    if (albumIds.length === 0) return linked
    const { data: rows } = await sb
      .from('album_tracks')
      .select('track_id')
      .in('album_id', albumIds)
    for (const r of (rows || []) as any[]) {
      if (typeof r.track_id === 'number') linked.add(r.track_id)
    }
  } catch {
    // album_tracks query failed — return empty set (no orphan detection possible)
  }
  return linked
}
async function getPhotos(id: number) {
  const sb = createAdminClient()
  // Try the enriched query first (requires 20260424c_photographers +
  // 20260424d_photo_taken_at migrations). If the join fails because either
  // migration hasn't landed in this environment, fall back to the plain
  // shape so the gallery never stops rendering.
  const enriched = await sb
    .from('artist_photos')
    .select('id, url, caption, sort_order, taken_at, source_url, license, is_active, photographer:photographers(id, slug, name)')
    .eq('artist_id', id)
    .order('sort_order')
  if (!enriched.error && enriched.data) {
    return (enriched.data as any[]).map((r) => ({
      id: r.id,
      url: r.url,
      caption: r.caption,
      sort_order: r.sort_order,
      taken_at: r.taken_at || null,
      source_url: r.source_url || null,
      license: r.license || null,
      is_active: r.is_active,
      photographer_slug: r.photographer?.slug || null,
      photographer_name: r.photographer?.name || null,
    }))
  }
  const { data } = await sb.from('artist_photos').select('id, url, caption, sort_order, is_active').eq('artist_id', id).order('sort_order')
  return data || []
}
async function getAlbums(id: number) { const sb = createAdminClient(); const { data } = await sb.from('albums').select('id, slug, title, year, month, cover_image_url, type_studio, type_compilation, type_ep, type_single, type_live, type_remix, type_soundtrack, type_demo, spotify_id, video_url, legacy_id').eq('artist_id', id).order('year', { ascending: false }); return data || [] }
async function getTracks(id: number) {
  const sb = createAdminClient()
  // NOTE: album_id column doesn't exist on tracks (relationship is via
  // album_tracks junction table or similar). Keeping select without it so
  // the query doesn't fail. "Kitos dainos" orphan tab disabled client-side
  // until we resolve the correct relationship.
  // NOTE: `duration` column isn't in the public.tracks table yet (only in
  // lib/supabase-albums.ts TrackFull type + admin album form). Once the
  // migration lands, add it back here and the player will pick it up
  // automatically because the column is already optional on the Track type.
  // Limit'as panaikintas — populiarūs LT atlikėjai gali turėti daugiau nei
  // 500 tracks (Marijonas, DJ'ai, kompiliacijų autoriai). Naudojam range()
  // iki 9999 — Supabase grąžina tiek, kiek yra. Jokios prasmės cap'inti
  // public puslapyje, geriau matyti viską.
  const { data } = await sb
    .from('tracks')
    .select('id, slug, title, type, video_url, spotify_id, cover_url, release_date, lyrics, is_new, is_new_date, release_year, release_month, legacy_id')
    .eq('artist_id', id)
    .order('created_at', { ascending: false })
    .range(0, 9999)
  const tracks = (data || []) as any[]
  if (tracks.length === 0) return tracks

  // Attach like counts iš unified `likes` lentelės. Vienas SELECT — visi
  // tracks vienu šūviu (entity_type='track' AND entity_id IN (...)).
  // SVARBU: range(0, 99999) — be jo Supabase default cap'ina 1000 rows,
  // todėl mažiau populiarūs tracks pamesdavo savo likes (e.g. Mamontovas
  // 4454 track likes total, top-1000 cut'ino visus žemesnius).
  const trackIds = tracks.map((t) => t.id)
  const { data: likeRows } = await sb
    .from('likes')
    .select('entity_id')
    .eq('entity_type', 'track')
    .in('entity_id', trackIds)
    .range(0, 99999)
  const byTrack = new Map<number, number>()
  for (const r of (likeRows || []) as any[]) {
    byTrack.set(r.entity_id, (byTrack.get(r.entity_id) || 0) + 1)
  }
  for (const t of tracks) {
    t.like_count = byTrack.get(t.id) || 0
  }

  // Sort by popularity (likes desc, tiebreak by created_at desc which is
  // already the initial sort). UI's "Top dainos" tab assumes the list is
  // popularity-sorted — anksčiau buvo created_at desc, todėl seniausi liko
  // viršuje.
  tracks.sort((a, b) => (b.like_count || 0) - (a.like_count || 0))

  return tracks
}
async function getAllArtistTrackLegacyIds(id: number) { const sb = createAdminClient(); const { data } = await sb.from('tracks').select('legacy_id').eq('artist_id', id).not('legacy_id', 'is', null); return (data || []).map((t: any) => t.legacy_id).filter((x: any) => typeof x === 'number') }

/** Sumedžioja community info: visus likes artist + visiems jo albumams + tracks.
 * Grąžina suma, unikalūs vartotojai, top fans (su like_count).
 *
 * Naudoja unified `likes` lentelę su entity_id (modern PK, ne legacy_id).
 * Anksčiau buvo legacy_likes su entity_legacy_id — dabar viskas vienoje vietoje. */
async function getLegacyCommunity(
  artistId: number,
  albumIds: number[],
  trackIds: number[],
) {
  const sb = createAdminClient()

  // Artist-level likes — tai kas rodoma main ♥ button'e.
  // Albumų/tracks likes reikalingi tik aggregate distinctUsers stat'ui.
  const artistLikesP = sb
    .from('likes')
    .select('user_username, user_rank, user_avatar_url')
    .eq('entity_type', 'artist')
    .eq('entity_id', artistId)
    .range(0, 9999)

  const albumLikesP = albumIds.length > 0
    ? sb.from('likes')
        .select('user_username, user_rank, user_avatar_url')
        .eq('entity_type', 'album')
        .in('entity_id', albumIds)
        .range(0, 9999)
    : Promise.resolve({ data: [] as any[] })

  const trackLikesP = trackIds.length > 0
    ? sb.from('likes')
        .select('user_username, user_rank, user_avatar_url')
        .eq('entity_type', 'track')
        .in('entity_id', trackIds)
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
/** Rank priority — actual music.lt point-based hierarchy:
 *    0–100     Naujokas
 *    100–300   Aktyvus naujokas
 *    300–500   Įsibėgėjantis narys
 *    500–1000  Narys
 *    1000–2000 Aktyvus narys
 *    2000–3000 Ultra narys
 *    3000–5000 Super narys
 *    5000+     VIP narys          ← top */
function rankPriority(rank: string | null | undefined): number {
  if (!rank) return 0
  const r = rank.toLowerCase()
  if (r.includes('vip')) return 100
  if (r.includes('super')) return 90
  if (r.includes('ultra')) return 80
  if (r.includes('aktyvus narys')) return 70
  // Check "įsibėgėjantis" BEFORE plain "narys" — it contains the substring "narys"
  if (r.includes('įsibėgėjantis') || r.includes('isibegejantis')) return 50
  if (r.includes('narys')) return 60
  if (r.includes('aktyvus naujokas')) return 40
  if (r.includes('naujokas')) return 30
  return 10
}

/** Randame forum_threads, kurie surišti su šiuo atlikėju per artist_id.
 * Anksčiau buvo slug-pattern matching (`source_url.ilike.%slug%`) — bet jis
 * praleisdavo song-level diskusijas, kurių slug'as gali turėti tik artist'o
 * vardo deklinaciją (pvz. „Atlantos" vs slug „atlanta"). Dabar scrape'e
 * forum_threads.artist_id pildomas tiesiogiai, todėl query'inam tiesiai per
 * FK. */
async function getLegacyForumThreads(artistId: number, limit = 200) {
  if (!artistId) return []
  const sb = createAdminClient()
  const { data } = await sb
    .from('forum_threads')
    .select('legacy_id, slug, source_url, kind, title, post_count, last_post_at')
    .eq('artist_id', artistId)
    .eq('kind', 'discussion')
    .order('last_post_at', { ascending: false, nullsFirst: false })
    .limit(limit)
  return data || []
}

/** For a set of thread legacy_ids, fetch the most recent forum post body + author.
 *  Returns a Map keyed by thread_legacy_id → { body, author_username, created_at }.
 *  Used to enrich thread cards with a teaser of the last comment so the UI can
 *  show what people are saying instead of a bare row. */
async function getLastPostsByThread(threadIds: number[]): Promise<Map<number, { body: string; author_username: string | null; created_at: string | null }>> {
  const out = new Map<number, { body: string; author_username: string | null; created_at: string | null }>()
  if (threadIds.length === 0) return out
  const sb = createAdminClient()
  try {
    // Latest-first; first occurrence per thread wins as the "last post".
    // NOTE: forum_posts stores the body in `content_text` / `content_html`
    // (not `body`). The client-facing field is named `body` so we map here.
    const { data } = await sb
      .from('forum_posts')
      .select('thread_legacy_id, content_text, content_html, author_username, created_at')
      .in('thread_legacy_id', threadIds)
      .order('created_at', { ascending: false })
      .limit(500)
    for (const p of (data || []) as any[]) {
      if (!out.has(p.thread_legacy_id)) {
        const text = (p.content_text && String(p.content_text).trim())
          || (p.content_html && String(p.content_html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
          || ''
        out.set(p.thread_legacy_id, {
          body: text,
          author_username: p.author_username || null,
          created_at: p.created_at || null,
        })
      }
    }
  } catch {
    // If forum_posts schema varies, silently return empty map
  }
  return out
}

/** Atskirai paimam news per artist_id (kind='news').
 * limit padidintas iki 200 — music.lt populiariems atlikėjams gali būti 80+
 * naujienų thread'ų. UI client'as patys suskirsto į recent + archyvą. */
async function getLegacyNewsThreads(artistId: number, limit = 200) {
  if (!artistId) return []
  const sb = createAdminClient()
  const { data } = await sb
    .from('forum_threads')
    .select('legacy_id, slug, source_url, kind, title, post_count, first_post_at, last_post_at')
    .eq('artist_id', artistId)
    .eq('kind', 'news')
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
async function getLikeCount(id: number) {
  const sb = createAdminClient()
  const { count } = await sb
    .from('likes')
    .select('*', { count: 'exact', head: true })
    .eq('entity_type', 'artist')
    .eq('entity_id', id)
  return count || 0
}
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
 * Country: position among artists of same country by like count.
 * Genre: position in top genre by like count.
 * These are coarse approximations — they use total likes as proxy for popularity.
 * Real rank (by plays) will come once we have listening-session data.
 *
 * Naudoja unified `likes` lentelę. Anksčiau buvo `legacy_like_count` cache
 * kolumna ant artists, bet po unified migracijos count'inam tiesiai.
 * Returns the set of ranks that make sense to show. */
async function getArtistRanks(
  artistId: number,
  country: string | null,
  genres: { id: number; name: string }[],
  artistScore: number,
): Promise<{ category: string; rank: number; total: number; scope: 'country' | 'genre' | 'global' }[]> {
  if (!artistScore || artistScore <= 0) return []
  const sb = createAdminClient()
  const out: { category: string; rank: number; total: number; scope: 'country' | 'genre' | 'global' }[] = []

  // Score'as yra unifikuotas popularity metric'as — surenka likes, awards,
  // tracks, albums, comments, threads ir kt. Score=0 reiškia placeholder
  // atlikėją be jokio scrape'o, kuris natūraliai iškrenta iš pool'o.
  // Rank'inam tarp peerių su score > 0.

  // Country rank
  if (country) {
    const { data: peers } = await sb
      .from('artists')
      .select('id, score')
      .eq('country', country)
      .gt('score', 0)
    const peerScores = (peers || []) as { id: number; score: number }[]
    const others = peerScores.filter(p => p.id !== artistId)
    const higher = others.filter(p => (p.score || 0) > artistScore).length
    out.push({ category: country, rank: higher + 1, total: others.length + 1, scope: 'country' })
  }

  // Genre rank (top genre only)
  if (genres.length > 0) {
    const g = genres[0]
    const { data: gpeers } = await sb
      .from('artist_genres')
      .select('artist_id, artists:artist_id(id, score)')
      .eq('genre_id', g.id)
    const peerScores = (gpeers || [])
      .map((r: any) => r.artists)
      .filter(Boolean)
      .filter((a: any) => (a.score || 0) > 0) as { id: number; score: number }[]
    const others = peerScores.filter(p => p.id !== artistId)
    const higher = others.filter(p => (p.score || 0) > artistScore).length
    out.push({ category: g.name, rank: higher + 1, total: others.length + 1, scope: 'genre' })
  }

  return out
}

/** Awards for this artist — joined view from voting_participants ↔ events/editions/channels.
 *  Each row represents one nomination/win at a specific ceremony.
 *  `participants_in_event` is the # of participants in same event (1 = ceremony partially imported). */
async function getArtistAwards(artistId: number) {
  const sb = createAdminClient()
  const { data: parts } = await sb
    .from('voting_participants')
    .select('id, event_id, album_id, track_id, display_subtitle, metadata, voting_events!inner(id, name, slug, edition_id, voting_editions!inner(id, year, channel_id, voting_channels!inner(id, name, slug)))')
    .eq('artist_id', artistId)
  const rows: any[] = (parts || []) as any[]
  // Filter to award-imported only (metadata.imported_from_award)
  const awardRows = rows.filter(r => r.metadata?.imported_from_award)
  if (awardRows.length === 0) return []

  // Count participants per event (for completeness indicator)
  const eventIds = [...new Set(awardRows.map(r => r.event_id))]
  const partCounts = new Map<number, number>()
  if (eventIds.length > 0) {
    const { data: countRows } = await sb
      .from('voting_participants')
      .select('event_id')
      .in('event_id', eventIds)
    for (const r of (countRows || []) as any[]) {
      partCounts.set(r.event_id, (partCounts.get(r.event_id) || 0) + 1)
    }
  }

  return awardRows.map(r => {
    const ev = r.voting_events
    const ed = ev?.voting_editions
    const ch = ed?.voting_channels
    return {
      id: r.id,
      result: r.metadata?.result || 'other',
      work: r.display_subtitle || null,
      album_id: r.album_id ?? null,
      track_id: r.track_id ?? null,
      event_id: r.event_id,
      event_name: ev?.name || '',
      event_slug: ev?.slug || '',
      edition_id: ed?.id,
      edition_year: ed?.year,
      channel_id: ch?.id,
      channel_name: ch?.name || '',
      channel_slug: ch?.slug || '',
      participants_in_event: partCounts.get(r.event_id) || 0,
    }
  })
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
  const [genres, substyles, tableLinks, dbPhotos, albums, tracks, members, followers, likeCount, news, rawEvents, allTrackLegacyIds, legacyThreads, legacyNews, linkedTrackIdSet, awards] = await Promise.all([
    getGenres(artist.id), getSubstyles(artist.id), getLinks(artist.id), getPhotos(artist.id), getAlbums(artist.id), getTracks(artist.id),
    getMembers(artist.id), getFollowers(artist.id), getLikeCount(artist.id), getNews(artist.id), getEvents(artist.id),
    getAllArtistTrackLegacyIds(artist.id),
    getLegacyForumThreads(artist.id),
    getLegacyNewsThreads(artist.id),
    getLinkedTrackIds(artist.id),
    getArtistAwards(artist.id),
  ])
  const links = buildSocialLinks(artist, tableLinks as { platform: string; url: string }[])
  const linkedTrackIds = Array.from(linkedTrackIdSet)
  const similar = await getSimilar(artist.id, genres.map((g: any) => g.id))

  // Community — aggregated likes (artist + all his albums + tracks).
  // Naudoja modern PK'us (entity_id), ne legacy_id.
  const albumIds = (albums as any[]).map((a: any) => a.id).filter((x: any) => typeof x === 'number')
  const allTrackIds = (tracks as any[]).map((t: any) => t.id).filter((x: any) => typeof x === 'number')
  const legacyCommunity = await getLegacyCommunity(artist.id, albumIds, allTrackIds)

  // Photos shown publicly — TIK is_active=true. artist_photos lentelė yra
  // kanoninis šaltinis; legacy `artists.photos` JSON kolumna jau nebenaudojama
  // (anksčiau čia būdavo merge'inama be is_active filter'io ir todėl rodėsi
  // hidden nuotraukos viešai).
  const photos: { url: string; caption?: string }[] = dbPhotos
    .filter((p: any) => p.is_active === true)
    .map((p: any) => ({ url: p.url, caption: p.caption }))

  // Hero image preference (NEVER cover_image_url — that's a small profile thumb):
  //  1. Explicitly set wide cover (admin-chosen)
  //  2. First active photo from gallery — typically higher-res
  //  3. null → no hero shown (better than blurry small thumb)
  const galleryFirst = photos.length > 0 ? photos[0].url : null
  const heroImage = artist.cover_image_wide_url
    || galleryFirst
    || null

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

  // Compute ranks (country, genre) — naudoja unified `score` kaip popularity
  // metric'ą. Score apskaičiuojamas iš likes + tracks + albums + awards +
  // comments + threads — pilnas portretas, ne tik likes.
  const ranks = await getArtistRanks(
    artist.id,
    artist.country || null,
    genres as { id: number; name: string }[],
    (artist as any).score || 0,
  )

  // Enrich forum threads with last post preview so the UI can show a teaser
  const allThreadIds = [
    ...(legacyThreads as any[]).map((t) => t.legacy_id),
    ...(legacyNews as any[]).map((t) => t.legacy_id),
  ]
  const lastPosts = await getLastPostsByThread(allThreadIds)
  const legacyThreadsWithPosts = (legacyThreads as any[]).map((t) => ({
    ...t,
    last_post: lastPosts.get(t.legacy_id) || null,
  }))
  const legacyNewsWithPosts = (legacyNews as any[]).map((t) => ({
    ...t,
    last_post: lastPosts.get(t.legacy_id) || null,
  }))

  // Score breakdown — public artist puslapis NIEKADA jo nerodo, net jei
  // žiūri admin'as. Score'ą redaguoji per /admin/artists/[id] (atskiras puslapis,
  // ten yra full Reitingas modalas). Public — tik catalog metadata.
  return (
    <ArtistProfileClient
      artist={{ id: artist.id, slug: artist.slug, name: artist.name, type: artist.type || 'group', country: artist.country, active_from: artist.active_from, active_until: artist.active_until,
        // description fallback: jei `description` (Wiki canonical) tuščia
        // arba placeholder (<20 ch), naudojam `description_legacy` (music.lt
        // scrape). Mamontovas ir kt. artistai dar neturi Wiki bio — bet
        // music.lt scrape parsina jų aprašymus.
        description: stripStyles(((artist.description || '').trim().length >= 20 ? artist.description : (artist as any).description_legacy) || ''),
        cover_image_url: artist.cover_image_url, cover_image_position: artist.cover_image_position, website: artist.website, spotify_id: artist.spotify_id, is_verified: artist.is_verified, gender: artist.gender, birth_date: artist.birth_date, death_date: artist.death_date, legacy_id: (artist as any).legacy_id ?? null, source: (artist as any).source ?? null, score: null, score_breakdown: null, score_updated_at: null }}
      heroImage={heroImage} genres={genres} links={links} photos={photos} albums={albums as any} tracks={tracks as any}
      members={members} followers={followers} likeCount={likeCount} news={news as any} events={events}
      similar={similar} newTracks={newTracks as any} topVideos={topVideos as any}
      chartData={mockChart(albums)} hasNewMusic={newTracks.length > 0}
      legacyCommunity={legacyCommunity} legacyThreads={legacyThreadsWithPosts as any} legacyNews={legacyNewsWithPosts as any}
      ranks={ranks}
      substyles={substyles}
      linkedTrackIds={linkedTrackIds}
      awards={awards}
    />
  )
}
