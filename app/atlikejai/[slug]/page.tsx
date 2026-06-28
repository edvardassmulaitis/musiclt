// app/atlikejai/[slug]/page.tsx
import { notFound } from 'next/navigation'
import { Suspense, cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase'
import { getDiscoveriesByArtist } from '@/lib/discoveries'
import { getArtistRecordings } from '@/lib/concert-recordings'
import ArtistProfileClient from './artist-profile-client'
import ArtistSocialSection from '@/components/ArtistSocialSection'
import { PageLoader } from '@/components/PageLoader'
import type { Metadata } from 'next'

// ISR — atlikėjo puslapis cache'inamas Vercel edge'e + Vercel function memory'je
// `ARTIST_CACHE_TTL` sekundžių. Po admin edit'o (PATCH/PUT/DELETE) iškart
// iškviečiama `revalidateTag('artist')` → ALL artist'ai cache iškart išvalomas
// → kitas request'as gauna fresh duomenis.
//
// Anksčiau buvo `dynamic = 'force-dynamic'` (žr. git blame) — visi loads = full
// SSR + 18+ DB queries. Dabar: pirmas request po edit'o ar 5 min TTL'o pasibaigus
// = full SSR (~600-800ms); sekantys < 50ms iš edge cache'o.
export const revalidate = 300

const ARTIST_CACHE_TTL = 300

type Props = { params: Promise<{ slug: string }> }

// React cache() — request-scoped memoization. generateMetadata() ir pati
// page() kviečia getArtist(slug) su tuo pačiu argumentu; be cache'o tai buvo
// 2× select('*') per 57-stulpelių artists lentelę kiekvienam SSR render'iui.
const getArtist = cache(async (slug: string) => {
  const sb = createAdminClient()
  let { data } = await sb.from('artists').select('*').eq('slug', slug).single()
  if (!data) { const id = parseInt(slug); if (!isNaN(id)) { const r = await sb.from('artists').select('*').eq('id', id).single(); data = r.data } }
  return data
})

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
  const fields: Array<keyof any> = ['spotify', 'youtube', 'facebook', 'instagram', 'tiktok', 'twitter', 'soundcloud', 'bandcamp']
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
async function getAlbums(id: number) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('albums')
    .select('id, slug, title, year, month, cover_image_url, type_studio, type_compilation, type_ep, type_single, type_live, type_remix, type_soundtrack, type_demo, spotify_id, video_url, legacy_id, score')
    .eq('artist_id', id)
    // Pending review įrašai (sukurti per match_legacy_overlay) viešai
    // nematomi — admin pirma turi patvirtinti per /admin/import/pending.
    // NULL-safe: PostgREST `neq` neapima NULL eilučių (three-valued logic),
    // todėl OR.
    .or('source.is.null,source.neq.legacy_scrape_pending')
    .order('year', { ascending: false })
  const albums = (data || []) as any[]
  if (albums.length === 0) return albums
  // Attach album like counts.
  //
  // FAST PATH (po 20260501a_like_counts_rpc.sql migracijos): vienas RPC
  // call grąžina visus count'us — DB pusėje GROUP BY agregacija.
  // FALLBACK (jei migracija dar nepritaikyta): senas chunked pagination
  // loop'as. Tai apsaugo deploy'ą — kodas veikia ir prieš migraciją.
  const albumIds = albums.map(a => a.id)
  const byAlbum = await fetchLikeCounts(sb, 'album', albumIds)
  for (const a of albums) (a as any).like_count = byAlbum.get(a.id) || 0
  return albums
}

/**
 * Single batched fetch'as: like_count per entity_id naudojant Postgres RPC.
 * Pagrindinis pagreitinimo mechanizmas — viena round-trip vietoj N chunked.
 *
 * Mikutavičiui (~3000 track likes / 70 tracks): senas chunked loop ~3-5
 * round-trips × ~150ms = 450-750ms. RPC: 1 round-trip ~150ms. Speedup ~5x.
 */
async function fetchLikeCounts(
  sb: ReturnType<typeof createAdminClient>,
  entityType: 'track' | 'album' | 'artist',
  entityIds: number[],
): Promise<Map<number, number>> {
  const out = new Map<number, number>()
  if (entityIds.length === 0) return out

  // FAST PATH — RPC
  const { data: rpcRows, error: rpcErr } = await sb.rpc('like_counts_by_entity', {
    p_entity_type: entityType,
    p_entity_ids: entityIds,
  })
  if (!rpcErr && Array.isArray(rpcRows)) {
    for (const r of rpcRows as any[]) {
      out.set(Number(r.entity_id), Number(r.like_count))
    }
    return out
  }

  // FALLBACK — chunked pagination (kai RPC dar nesukurta DB).
  // PostgREST max-rows = 1000 per response. Chunk'inam ID'us po 40 +
  // PARALLEL Promise.all per chunks (anksčiau buvo sequential await loop).
  // Mikutavičius (70 tracks → 2 chunks): 2 parallel ~150ms vs 2 sequential
  // ~300ms. Speedup'as net be migracijos.
  const CHUNK = 40
  const PAGE = 1000
  const chunkPromises: Promise<{ entity_id: number }[]>[] = []
  for (let i = 0; i < entityIds.length; i += CHUNK) {
    const chunk = entityIds.slice(i, i + CHUNK)
    chunkPromises.push((async () => {
      const collected: { entity_id: number }[] = []
      let offset = 0
      while (true) {
        const { data: rows } = await sb
          .from('likes')
          .select('entity_id')
          .eq('entity_type', entityType)
          .in('entity_id', chunk)
          .order('id', { ascending: true })
          .range(offset, offset + PAGE - 1)
        const arr = (rows || []) as any[]
        collected.push(...arr)
        if (arr.length < PAGE) break
        offset += PAGE
      }
      return collected
    })())
  }
  const results = await Promise.all(chunkPromises)
  for (const arr of results) {
    for (const r of arr) out.set(r.entity_id, (out.get(r.entity_id) || 0) + 1)
  }
  return out
}
async function getTracks(id: number) {
  const sb = createAdminClient()
  // 2026-05-28 perf rewrite: 4 sequential batches → 1 SELECT + 1 parallel
  // batch. Mikutavičiui (~70 tracks): ~700-1100ms → ~300-400ms.
  // NOTE: album_id column doesn't exist on tracks (relationship via album_tracks
  // junction). NOTE: `duration` column dar nemigruota.
  // Limit'as panaikintas — populiarūs LT atlikėjai gali turėti daugiau nei
  // 500 tracks (Marijonas, DJ'ai, kompiliacijų autoriai). range() iki 9999.
  const { data } = await sb
    .from('tracks')
    .select('id, slug, title, type, video_url, spotify_id, cover_url, release_date, lyrics, is_new, is_new_date, is_single, release_year, release_month, release_day, legacy_id, score, video_views')
    .eq('artist_id', id)
    .or('source.is.null,source.neq.legacy_scrape_pending')
    .order('created_at', { ascending: false })
    .range(0, 9999)
  const tracks = (data || []) as any[]
  if (tracks.length === 0) return tracks

  const trackIds = tracks.map((t) => t.id)

  // ── PARALLEL BATCH ──
  // Likes, featuring chunks, album_tracks chunks — visi vienu metu.
  // featuring + album_tracks chunkinami po 200 — bet visi chunks paleidžiami
  // paraleliai per Promise.all, ne sequential `for…await`. Be šito 200 trackų
  // = ~100-150ms papildomo waterfall'o per kiekvieną pošeimą.
  const CHUNK = 200
  const trackIdChunks: number[][] = []
  for (let i = 0; i < trackIds.length; i += CHUNK) {
    trackIdChunks.push(trackIds.slice(i, i + CHUNK))
  }

  const featPromise = Promise.all(
    trackIdChunks.map(chunk =>
      sb.from('track_artists')
        .select('track_id, artists:artist_id(id, slug, name)')
        .in('track_id', chunk)
        .neq('artist_id', id)
        .then(r => r.data || [])
    )
  )
  const albumPromise = Promise.all(
    trackIdChunks.map(chunk =>
      sb.from('album_tracks')
        .select('track_id, albums:album_id(id, slug, title, cover_image_url, year)')
        .in('track_id', chunk)
        .then(r => r.data || [])
    )
  )
  const [byTrack, featRows, albumRows] = await Promise.all([
    fetchLikeCounts(sb, 'track', trackIds),
    featPromise,
    albumPromise,
  ])

  // ── POST-PROCESS ──
  for (const t of tracks) {
    t.like_count = byTrack.get(t.id) || 0
  }

  const featByTrack = new Map<number, Array<{ id: number; slug: string; name: string }>>()
  for (const rows of featRows) {
    for (const r of rows as any[]) {
      if (!r.artists) continue
      const list = featByTrack.get(r.track_id) || []
      list.push({ id: r.artists.id, slug: r.artists.slug, name: r.artists.name })
      featByTrack.set(r.track_id, list)
    }
  }
  const albumsByTrack = new Map<number, Array<{ id: number; slug: string; title: string; cover_image_url: string | null; year: number | null }>>()
  for (const rows of albumRows) {
    for (const r of rows as any[]) {
      if (!r.albums) continue
      const list = albumsByTrack.get(r.track_id) || []
      list.push({
        id: r.albums.id,
        slug: r.albums.slug,
        title: r.albums.title,
        cover_image_url: r.albums.cover_image_url,
        year: typeof r.albums.year === 'number' ? r.albums.year : null,
      })
      albumsByTrack.set(r.track_id, list)
    }
  }

  for (const t of tracks) {
    ;(t as any).featuring = featByTrack.get(t.id) || []
    const trackAlbums = albumsByTrack.get(t.id) || []
    // Public payload'as nepasiima `year` field'o per album — jis išskirtas
    // tik year-fallback'ui žemiau. Striname jį prieš grąžindami.
    ;(t as any).albums = trackAlbums.map(({ year, ...rest }) => rest)
    // Cover fallback: jei tracks.cover_url NULL, pakeičiam į pirmą album'o.
    if (!(t as any).cover_url && trackAlbums[0]?.cover_image_url) {
      ;(t as any).cover_url = trackAlbums[0].cover_image_url
    }
    // Release year fallback: jei track neturi datos, paimam seniausio albumo
    // year'į. Anksčiau buvo atskira RPC (4-ta sequential batch'a) — dabar
    // reuse'inam album_tracks duomenis kuriuos jau turim.
    if (!t.release_year && !t.release_date) {
      let oldestYear: number | null = null
      for (const a of trackAlbums) {
        if (a.year !== null && (oldestYear === null || a.year < oldestYear)) {
          oldestYear = a.year
        }
      }
      if (oldestYear !== null) t.release_year = oldestYear
    }
  }

  // Sort by popularity (likes desc, tiebreak by created_at desc which is
  // already the initial sort). UI „Top dainos" tab tikisi populiarumo sortavimo.
  tracks.sort((a, b) => (b.like_count || 0) - (a.like_count || 0))

  return tracks
}
async function getAllArtistTrackLegacyIds(id: number) { const sb = createAdminClient(); const { data } = await sb.from('tracks').select('legacy_id').eq('artist_id', id).not('legacy_id', 'is', null); return (data || []).map((t: any) => t.legacy_id).filter((x: any) => typeof x === 'number') }

/** Sumedžioja community info: visus likes artist + visiems jo albumams + tracks.
 * Grąžina suma, unikalūs vartotojai, top fans (su like_count).
 *
 * FAST PATH (po 20260501a_like_counts_rpc.sql): vienas RPC kvietimas
 * `artist_community_likes` — DB pusėje GROUP BY agregacija + JSONB return.
 * Mikutavičiui (~3000 likes) speedup'as ~5-10x.
 *
 * FALLBACK: senas chunked pagination kelis Promise.all batch'us. */
async function getLegacyCommunity(
  artistId: number,
  albumIds: number[],
  trackIds: number[],
) {
  const sb = createAdminClient()

  type LikeRow = { user_username: string; user_rank: string | null; user_avatar_url: string | null }
  type FanRow = LikeRow & { like_count: number }

  // ── FAST PATH — vienas RPC ──
  const { data: rpcRows, error: rpcErr } = await sb.rpc('artist_community_likes', {
    p_artist_id: artistId,
    p_album_ids: albumIds,
    p_track_ids: trackIds,
  })
  if (!rpcErr && Array.isArray(rpcRows) && rpcRows.length > 0) {
    const row = rpcRows[0] as any
    return {
      totalEvents: Number(row.total_events) || 0,
      distinctUsers: Number(row.distinct_users) || 0,
      artistLikes: (row.artist_fans || []).length,
      topFans: ((row.top_fans || []) as FanRow[]).map(f => ({
        user_username: f.user_username,
        user_rank: f.user_rank,
        user_avatar_url: f.user_avatar_url,
        like_count: Number(f.like_count),
      })),
      allArtistFans: (row.artist_fans || []) as LikeRow[],
    }
  }

  // ── FALLBACK — kai RPC dar neaplikuota DB ──
  // Artist-level likes — tai kas rodoma main ♥ button'e.
  // Albumų/tracks likes reikalingi tik aggregate distinctUsers stat'ui.
  // PostgREST max-rows 1000 — chunk'inam IN queries po 40 entities, kad
  // kiekvieno chunk'o response'as tilptų po cap'ą.
  // 2026-05-29 fix: user_rank/user_avatar_url DROP'inti iš likes (Phase 2c).
  // Imam iš profiles JOIN'u (rank — VIP/null; avatar_url). Be šito — query
  // fail'indavo (column does not exist) → 0 likes ant atlikėjo page'o.
  const mapLikeRow = (r: any): LikeRow => ({
    user_username: r.user_username,
    user_rank: r.profiles?.rank ?? null,
    user_avatar_url: r.profiles?.avatar_url ?? null,
  })
  async function fetchAllByIn(table: 'likes', entityType: string, ids: number[]): Promise<LikeRow[]> {
    if (ids.length === 0) return []
    const out: LikeRow[] = []
    const CHUNK = 40
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK)
      const { data } = await sb.from(table)
        .select('user_username, user_id, profiles:user_id(rank, avatar_url)')
        .eq('entity_type', entityType)
        .in('entity_id', chunk)
        .range(0, 9999)
      if (data) out.push(...(data as any[]).map(mapLikeRow))
    }
    return out
  }

  const artistLikesP = sb
    .from('likes')
    .select('user_username, user_id, profiles:user_id(rank, avatar_url)')
    .eq('entity_type', 'artist')
    .eq('entity_id', artistId)
    .range(0, 9999)

  const [a, al, tr] = await Promise.all([
    artistLikesP,
    fetchAllByIn('likes', 'album', albumIds),
    fetchAllByIn('likes', 'track', trackIds),
  ])
  const artistRows = (((a as any).data || []) as any[]).map(mapLikeRow)
  const all = [...artistRows, ...al, ...tr]

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
    artistLikes: allArtistFans.length,
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
  // Po canonical pipeline'os (forum_lib.upsert_discussion) — query'inam
  // tiesiai discussions table su artist_id FK. legacy_kind='discussion'
  // (legacy_kind='news' atskirai per getLegacyNewsThreads).
  const { data } = await sb
    .from('discussions')
    .select('id, legacy_id, slug, source_url, legacy_kind, title, comment_count, last_comment_at')
    .eq('artist_id', artistId)
    .eq('legacy_kind', 'discussion')
    .eq('is_legacy', true)
    .order('last_comment_at', { ascending: false, nullsFirst: false })
    .limit(limit)
  // Map į UI-expected shape: kortelės jau turi `slug` (canonical) tiesiogiai,
  // bet pridedam `canonical_slug` field'ą backward-compat su DiscussionRow.
  return ((data || []) as any[]).map((d: any) => ({
    id: d.id,  // Modern discussions.id — naudojamas EntityCommentsBlock entityId
    legacy_id: d.legacy_id,
    slug: d.slug,
    source_url: d.source_url,
    kind: d.legacy_kind,
    title: d.title,
    post_count: d.comment_count,
    last_post_at: d.last_comment_at,
    canonical_slug: d.slug,
  }))
}

type PostInfo = { body: string; author_username: string | null; author_avatar_url: string | null; created_at: string | null }

/** For a set of thread legacy_ids, fetch the most recent forum posts (up to
 *  PER_THREAD per thread). Returns a Map keyed by thread_legacy_id → PostInfo[].
 *  UI rodo 1-2 paskutinius komentarus kortelėje; archyvas modal'e — viską
 *  pagal click.
 *
 *  Avatarus pasiimam iš `likes` lentelės — forum_posts skraperis avatar
 *  URL'ų netraukė, bet likes scraping'e jie užfiksuoti. Username'a yra
 *  bendras raktas. Single SELECT su IN(distinct usernames). */
async function getLastPostsByThread(threadIds: number[], perThread = 2): Promise<Map<number, PostInfo[]>> {
  const out = new Map<number, PostInfo[]>()
  if (threadIds.length === 0) return out
  const sb = createAdminClient()
  try {
    // Canonical: comments table su legacy_thread_legacy_id field'u — bridge'as
    // su forum_threads.legacy_id. JOIN su profiles per author_id avatarui.
    // Po 2026-05-28c content_html drop'as — naudojam tik body field'ą.
    const { data } = await sb
      .from('comments')
      .select('legacy_thread_legacy_id, body, author_id, created_at, profiles:author_id(username, avatar_url)')
      .in('legacy_thread_legacy_id', threadIds)
      .order('created_at', { ascending: false })
      .limit(Math.min(1000, threadIds.length * perThread * 4))
    for (const c of (data || []) as any[]) {
      const tid = c.legacy_thread_legacy_id
      const arr = out.get(tid) || []
      if (arr.length >= perThread) continue
      const text = (c.body && String(c.body).trim()) || ''
      arr.push({
        body: text,
        author_username: c.profiles?.username || null,
        author_avatar_url: c.profiles?.avatar_url || null,
        created_at: c.created_at || null,
      })
      out.set(tid, arr)
    }
  } catch {
    // Schema variation — silently return empty map
  }
  return out
}

/** Atskirai paimam news per artist_id (kind='news').
 * limit padidintas iki 200 — music.lt populiariems atlikėjams gali būti 80+
 * naujienų thread'ų. UI client'as patys suskirsto į recent + archyvą. */
async function getLegacyNewsThreads(artistId: number, limit = 200) {
  if (!artistId) return []
  const sb = createAdminClient()
  // Po canonical pipeline'os — query'inam discussions table (legacy_kind='news').
  // Sort: pirma pagal first_post_at desc (real news date kai žinom), NULL'us
  // atidedam pabaigai, ir tarp jų sort'inam pagal legacy_id desc (proxy
  // "naujausiai importuota viršuje", kol bus paleistas backfill_news_batch).
  const { data } = await sb
    .from('discussions')
    .select('id, legacy_id, slug, source_url, legacy_kind, title, comment_count, like_count, first_post_at, last_comment_at')
    .eq('artist_id', artistId)
    .eq('legacy_kind', 'news')
    .eq('is_legacy', true)
    .order('first_post_at', { ascending: false, nullsFirst: false })
    .order('legacy_id', { ascending: false })
    .limit(limit)

  // Like counts iš canonical likes table (entity_type='news', entity_id=discussions.id)
  const ids = (data || []).map((d: any) => d.id).filter(Boolean)
  const likeCounts = new Map<number, number>()
  if (ids.length > 0) {
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200)
      const { data: likes } = await sb
        .from('likes')
        .select('entity_id')
        .eq('entity_type', 'news')
        .in('entity_id', chunk)
      for (const l of (likes || []) as any[]) {
        likeCounts.set(l.entity_id, (likeCounts.get(l.entity_id) || 0) + 1)
      }
    }
  }

  return ((data || []) as any[]).map((d: any) => ({
    legacy_id: d.legacy_id,
    slug: d.slug,
    source_url: d.source_url,
    kind: d.legacy_kind,
    title: d.title,
    post_count: d.comment_count,
    like_count: likeCounts.get(d.id) || d.like_count || 0,
    first_post_at: d.first_post_at,
    last_post_at: d.last_comment_at,
    canonical_slug: d.slug,
  }))
}
/** Members — admin saves to artist_members (group_id + member_id pair).
 * When this artist IS the group, rows where group_id = artistId; join artists
 * on member_id to get the member's profile.
 *
 * 2026-05-20: pridėtas like_count enrichment + sort. Pirma sort'inam pagal
 * is_current (esami priekyje), tada pagal like_count desc — populiariausi
 * grupes nariai svarbesni „virš fold'o" priežiūrai.
 */
async function getMembers(id: number) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('artist_members')
    .select('member_id, year_from, year_to, is_current, artists:member_id(id, slug, name, cover_image_url, type)')
    .eq('group_id', id)
  const members = (data || [])
    // Pridedam is_current explicit'ai — kitaip past narys be year_to (Wiki
    // past_members be metų) display'us traktuoja kaip dabartinį.
    .map((r: any) => ({
      ...(r.artists || {}),
      member_from: r.year_from,
      member_until: r.is_current ? null : r.year_to,
      is_current: r.is_current !== false,
    }))
    .filter((m: any) => m.id)
  // Like-based ranking — populiariausi nariai pirmiausia visose grupėse
  const memberIds = members.map((m: any) => m.id).filter((x: any) => typeof x === 'number')
  const counts = await fetchLikeCounts(sb, 'artist', memberIds)
  for (const m of members) (m as any).like_count = counts.get((m as any).id) || 0
  members.sort((a: any, b: any) => {
    if (a.is_current !== b.is_current) return a.is_current ? -1 : 1
    return (b.like_count || 0) - (a.like_count || 0)
  })
  return members
}

/** Member of — reverse lookup: kuriose grupėse šis atlikėjas yra narys.
 * Pvz. Mikutavičius → LT United, Bovy. Užpildoma per backfill_artist_members.py
 * (parsina iš live music.lt artist page'o `<a href="X-grupe-N.html">` link'us). */
async function getMemberOf(id: number) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('artist_members')
    .select('group_id, year_from, year_to, is_current, artists:group_id(id, slug, name, cover_image_url, type)')
    .eq('member_id', id)
  return (data || [])
    .map((r: any) => ({ ...(r.artists || {}), member_from: r.year_from, member_until: r.is_current ? null : r.year_to, is_current: r.is_current !== false }))
    .filter((g: any) => g.id)
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

/** Sritys — solo atlikėjo occupation+instrument iš Wiki (artists.roles[]).
 *  Pritaikom role_translations LT vertimus + hidden filter'į + dedupe pagal
 *  resultinį label'į (kad „guitar" + „guitarist" + „bass guitar" + „bass
 *  guitarist" netaptų 4× „Gitara" — paliekam 1 iš jų). Canonical'us, kurie
 *  neturi vertimo, rodom kaip yra (capitalized first letter).
 *
 *  Returns array of display labels in canonical insertion order (stabilus
 *  per render'ius), atfilter'inant hidden ir dedup'inant.
 */
async function getDisplayRoles(rawRoles: string[] | null | undefined): Promise<string[]> {
  if (!rawRoles || rawRoles.length === 0) return []
  const canonicals = rawRoles.map(r => String(r || '').trim().toLowerCase()).filter(Boolean)
  if (!canonicals.length) return []
  const sb = createAdminClient()
  const { data } = await sb
    .from('role_translations')
    .select('canonical, lt, hidden')
    .in('canonical', canonicals)
  const trMap = new Map<string, { lt: string | null; hidden: boolean }>()
  for (const t of (data || [])) trMap.set(t.canonical, { lt: t.lt, hidden: !!t.hidden })

  const result: string[] = []
  const seenLower = new Set<string>()
  for (const raw of rawRoles) {
    const c = String(raw || '').trim().toLowerCase()
    if (!c) continue
    const tr = trMap.get(c)
    if (tr?.hidden) continue
    const label = tr?.lt && tr.lt.trim()
      ? tr.lt.trim()
      : (raw.charAt(0).toUpperCase() + raw.slice(1))
    const key = label.toLowerCase()
    if (seenLower.has(key)) continue
    seenLower.add(key)
    result.push(label)
  }
  return result
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

  // Attendee counts (event_attendees table) + comment counts (comments table)
  const eventIds = events.map((e: any) => e.id).filter(Boolean)
  const attendeeCounts = new Map<string, number>()
  const commentCounts = new Map<string, number>()
  if (eventIds.length > 0) {
    const { data: attendees } = await sb
      .from('event_attendees')
      .select('event_id')
      .in('event_id', eventIds)
    for (const a of (attendees || []) as any[]) {
      attendeeCounts.set(a.event_id, (attendeeCounts.get(a.event_id) || 0) + 1)
    }
    const { data: comments } = await sb
      .from('comments')
      .select('event_id')
      .in('event_id', eventIds)
      .eq('is_deleted', false)
    for (const c of (comments || []) as any[]) {
      if (c.event_id) commentCounts.set(c.event_id, (commentCounts.get(c.event_id) || 0) + 1)
    }
    for (const e of events) {
      e.attendee_count = attendeeCounts.get(e.id) || 0
      e.comment_count = commentCounts.get(e.id) || 0
    }
  }

  // Upcoming (asc) first, then past (desc). Cap at 12 combined.
  const upcoming = events
    .filter((e: any) => new Date(e.start_date).getTime() >= now)
    .sort((a: any, b: any) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
  const past = events
    .filter((e: any) => new Date(e.start_date).getTime() < now)
    .sort((a: any, b: any) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())
  return [...upcoming, ...past].slice(0, 12)
}
async function getSimilar(artistId: number, genreIds: number[], substyleIds: number[] = [], country: string | null = null, activeFrom: number | string | null = null, activeUntil: number | string | null = null) {
  if (!genreIds.length && !substyleIds.length) return []
  const sb = createAdminClient()
  // Veiklos laikotarpio (eros) helper — active_from/until gali būti year arba data.
  const _yr = (v: any): number | null => {
    if (v == null) return null
    const n = parseInt(String(v).slice(0, 4), 10)
    return Number.isFinite(n) && n > 1900 && n < 2100 ? n : null
  }
  const _NOW = new Date().getFullYear()
  const myFrom = _yr(activeFrom)
  const myUntil = _yr(activeUntil) ?? (myFrom != null ? _NOW : null)
  // „Panaši muzika" relevancija (anksčiau buvo paprasčiausiai pirmi 14 atlikėjų
  // dalijančių BET KOKĮ platų žanrą → random'as). Dabar reitinguojam pagal:
  //   1) substilių persidengimą (Experimental rock, Pop rock ir kt.) — STIPRUS
  //      panašumo signalas (×100 už kiekvieną bendrą substilį);
  //   2) plataus žanro persidengimą (Roko/Pop muzika) — silpnesnis (×20);
  //   3) tą pačią šalį (+30) — LT atlikėjui rodom LT panašius;
  //   4) populiarumą (score) — kaip tiebreaker'į (žinomesni viršuje).
  type Cand = { artist: any; sub: number; gen: number }
  const cand = new Map<number, Cand>()
  const add = (a: any, kind: 'sub' | 'gen') => {
    if (!a || a.id === artistId) return
    const e = cand.get(a.id) || { artist: a, sub: 0, gen: 0 }
    e[kind]++
    cand.set(a.id, e)
  }
  if (substyleIds.length) {
    const { data } = await sb.from('artist_substyles')
      .select('substyle_id, artists:artist_id(id, slug, name, cover_image_url, country, score, active_from, active_until)')
      .in('substyle_id', substyleIds).limit(500)
    for (const r of (data || []) as any[]) add(r.artists, 'sub')
  }
  if (genreIds.length) {
    const { data } = await sb.from('artist_genres')
      .select('genre_id, artists:artist_id(id, slug, name, cover_image_url, country, score, active_from, active_until)')
      .in('genre_id', genreIds).limit(500)
    for (const r of (data || []) as any[]) add(r.artists, 'gen')
  }
  const scored = [...cand.values()].map((e) => {
    const sameCountry = country && e.artist.country === country ? 1 : 0
    const pop = Math.min(Number(e.artist.score) || 0, 1000) / 1000
    // Eros persidengimas — veiklos langas [from, until||dabar]. MINKŠTAS:
    // trūkstant active_from (savo ar kandidato) → 0 (neutralu, ne bauda).
    // Kuo labiau persidengia aktyvumo laikotarpiai, tuo aukščiau (maks +40),
    // kad „logiškas pagal stilių, bet iš kito laikmečio" kristų žemiau.
    let era = 0
    const cf = _yr(e.artist.active_from)
    const ct = _yr(e.artist.active_until) ?? (cf != null ? _NOW : null)
    if (myFrom != null && myUntil != null && cf != null && ct != null) {
      const overlap = Math.max(0, Math.min(myUntil, ct) - Math.max(myFrom, cf))
      const span = Math.max(myUntil, ct) - Math.min(myFrom, cf)
      era = (span > 0 ? overlap / span : 1) * 40
    }
    const sim = e.sub * 100 + e.gen * 20 + sameCountry * 30 + era + pop * 5
    return { artist: e.artist, sim }
  }).sort((a, b) => b.sim - a.sim)
  const out: any[] = scored.slice(0, 14).map((s) => s.artist)
  // Cover image strategy — PIRMA cover_image_url (atlikėjo official profile
  // foto, dažniausiai Wiki-imported HD). Tik jei jos nėra ARBA ji yra mažas
  // music.lt thumbnail (legacy URL signature) — fallback'inam į newest active
  // gallery photo. Anksciau buvo blanket swap: ALWAYS gallery foto, dėl ko
  // 'Panaši muzika' rodydavo random gallery photos (paskutinė įkelta —
  // koncerto vaizdas, etc.) vietoj atlikėjo profile.
  const needsFallback = (url?: string | null) => {
    if (!url) return true
    // Music.lt legacy: small profile thumb (.lt domain, paths like /atlikejai/NN/images/)
    return /music\.lt.*\/(atlikejai|artists)\/.+\d+\.(jpg|png|jpeg)/i.test(url)
  }
  const fallbackNeeded = out.filter(a => needsFallback(a.cover_image_url))
  if (fallbackNeeded.length > 0) {
    const ids = fallbackNeeded.map(a => a.id)
    const { data: photoRows } = await sb
      .from('artist_photos')
      .select('artist_id, url, taken_at, id')
      .in('artist_id', ids)
      .eq('is_active', true)
      .order('taken_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
    const newest = new Map<number, string>()
    for (const p of (photoRows || []) as any[]) {
      if (!newest.has(p.artist_id) && p.url) newest.set(p.artist_id, p.url)
    }
    for (const a of fallbackNeeded) {
      const big = newest.get(a.id)
      if (big) (a as any).cover_image_url = big
    }
  }
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

  // ── PERF: vienas RPC call (migracija 20260529c_artist_rank_rpc) ─────
  // Anksčiau: 2 country counts + (1+N pages + 2*(chunks)) genre + 2 global
  // = 8-18 query'ų. Su 3000+ atlikėjų žanre (Roko muzika) → 14+ queries
  // × ~30ms = 400-500ms total.
  //
  // Dabar: SECURITY DEFINER RPC su CTE / window functions — viskas viena
  // PostgreSQL planner pass'u, partial index'u `idx_artists_score` paremta.
  // Total: ~50ms (10× pagreitis).
  const { data: rpcRows, error: rpcErr } = await sb.rpc('artist_rank', {
    p_artist_id: artistId,
    p_score:     artistScore,
    p_country:   country ?? null,
  })

  if (rpcErr) {
    console.error('[artist_rank] RPC failed, returning empty:', rpcErr.message)
    return []
  }

  return (rpcRows || []) as { category: string; rank: number; total: number; scope: 'country' | 'genre' | 'global' }[]
}

/** Score-based PopBar level (1..5). Percentile tarp VISŲ atlikėjų su
 *  score > 0. Logika: top 20% gauna 5, 60-80% gauna 4, 40-60% gauna 3,
 *  20-40% gauna 2, rest gauna 1. Žemo score'o (≤0) atlikėjams grąžinam 0
 *  → frontend'as bar'o nerodys.
 *
 *  Dvi count() head queries (~30ms total) — pigiau nei pilnas list +
 *  in-memory sort. Cache'inama ARTIST_CACHE_TTL kartu su kitais
 *  artist'o duomenimis (fetchArtistData wrapper'is).
 *
 *  Kodėl ne global rank? Rank tampa overpowering — top atlikėjas gauna
 *  „#1", visi kiti atrodo „nereikšmingi". PopBar yra qualitative signal
 *  („populiarus", „vidutiniškas") — naujam atlikėjui su gerais YT views
 *  jau pakanka 2-3 dot'ų. */
/** RECENT_SINCE_YEAR — paskutinių 2 metų cutoff'as recent metrikoms. */
const RECENT_SINCE_YEAR = new Date().getFullYear() - 2  // pvz. 2024 jei dabartiniai yra 2026

/** Recent performance PopBar (mėlynas) — atskira metrika nuo cumulative
 *  score'o. Sumuoja:
 *    - tracks score'us iš releases per pastaruosius 2 metus
 *    - albums score'us iš releases per pastaruosius 2 metus
 *    - awards (50 pts už kiekvieną nominaciją; daugiau ateityje, jei reikės
 *      atskirti won vs nominated)
 *
 *  Kodėl 2 metai: trumpesnis langas (30d) buvo nepatikimas — atlikėjas su
 *  hit'u prieš 2 mėnesius bet jokios naujos like aktyvumos atrodė neaktyvus.
 *  2 metų performance gerai atspindi „recent relevance" net jei naujos
 *  release wave jau praėjo, bet hit'as dar trinasi.
 *
 *  Thresholds (recent_score):
 *    0       → 0 (bar'as nerodomas — naujas/be naujų release'ų atlikėjas)
 *    1-99    → 1
 *    100-499 → 2
 *    500-1999 → 3
 *    2000-9999 → 4
 *    10000+   → 5
 *
 *  Vėliau galim:
 *    - Pridėti YouTube views year-over-year delta
 *    - Atskirti won vs nominated svorius (won = 200pt, nominated = 50pt)
 *    - Recency boost'as: 2026 metų track score svorį x2 vs 2024 (svarbiau
 *      naujesni hit'ai)
 *
 *  Implementacija: 3 parallel queries. Per atlikėją ~50-150ms.
 */
async function getRecentPopBarLevel(artistId: number): Promise<number> {
  const sb = createAdminClient()
  const sinceYear = RECENT_SINCE_YEAR

  const [tRes, aRes, awRes] = await Promise.all([
    // Tracks released last 2y — sum scores
    sb.from('tracks').select('score').eq('artist_id', artistId).gte('release_year', sinceYear).range(0, 9999),
    // Albums released last 2y — sum scores
    sb.from('albums').select('score').eq('artist_id', artistId).gte('year', sinceYear).range(0, 9999),
    // Awards (voting_participants joined to editions.year)
    sb.from('voting_participants')
      .select('id, voting_events!inner(voting_editions!inner(year))')
      .eq('artist_id', artistId)
      .gte('voting_events.voting_editions.year', sinceYear)
      .range(0, 999),
  ])

  let total = 0
  for (const t of (tRes.data || []) as any[]) total += Number(t.score) || 0
  for (const a of (aRes.data || []) as any[]) total += Number(a.score) || 0
  total += ((awRes.data || []) as any[]).length * 50

  if (total >= 10000) return 5
  if (total >= 2000) return 4
  if (total >= 500) return 3
  if (total >= 100) return 2
  if (total >= 1) return 1
  return 0
}

async function getScorePopBarLevel(artistScore: number): Promise<number> {
  if (!artistScore || artistScore <= 0) return 0
  const sb = createAdminClient()
  const [{ count: total }, { count: below }] = await Promise.all([
    sb.from('artists').select('id', { count: 'exact', head: true }).gt('score', 0),
    sb.from('artists').select('id', { count: 'exact', head: true }).gt('score', 0).lt('score', artistScore),
  ])
  if (!total || total < 5) return 5  // Per mažas pool'as — duodam max
  const pct = (below || 0) / total
  if (pct >= 0.80) return 5
  if (pct >= 0.60) return 4
  if (pct >= 0.40) return 3
  if (pct >= 0.20) return 2
  return 1
}

/** Custom eras for an artist (Push 3b, 2026-05-13).
 *  Returns rows ordered by sort_order ASC. Convention: newest era first
 *  (lowest sort_order). Frontend falls back to auto-decade grouping when
 *  this is empty AND albums.length >= 10 AND ≥3 decades have ≥2 albums. */
async function getArtistEras(artistId: number) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('artist_eras')
    .select('id, sort_order, title, subtitle, year_start, year_end, description, featured_album_ids, source')
    .eq('artist_id', artistId)
    .order('sort_order', { ascending: true })
  return (data || []) as Array<{
    id: number; sort_order: number; title: string; subtitle: string | null
    year_start: number; year_end: number | null
    description: string | null
    featured_album_ids: number[] | null
    source: string | null
  }>
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
  // Title format'as optimizuotas long-tail SEO: '{name} – dainos, albumai,
  // biografija | music.lt'. Google rezultatuose vartotojui aiškiai matosi,
  // kas yra šiame puslapyje (vs anksciau buvęs neutralus '{name} — music.lt').
  const title = `${a.name} – dainos, albumai, biografija | music.lt`
  const description = plain(a.description)
    || `${a.name} profilis music.lt: populiariausios dainos, albumai, biografija, vaizdo klipai, nuotraukos ir naujienų archyvas.`
  const canonical = `https://music.lt/atlikejai/${a.slug}`
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'profile',
      images: a.cover_image_url ? [a.cover_image_url] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: a.cover_image_url ? [a.cover_image_url] : [],
    },
  }
}

// ──────────────────────────────────────────────────────────────────────
// SUSPENSE PATTERN: artist'ą paimam greitai (1 query ~150ms), tada
// tuoj pat grąžinam <Suspense> wrapper'į su PageLoader fallback'u.
// SSR atsako early bytes turi loader'į → naudotojas iš karto mato
// skeleton'ą. Visi 20+ likę queries paleidžiami <ArtistContent> viduje,
// kuris stream'inasi į Suspense slot'ą kai tik Promise.all baigia.
// Be šito buvo: full HTML buffer'inamas 2-3s → naudotojas mato tuščią
// puslapį su top menu kelias sekundes.
// ──────────────────────────────────────────────────────────────────────
export default async function ArtistPage({ params }: Props) {
  const { slug } = await params
  const artist = await getArtist(slug)
  if (!artist) notFound()
  return (
    <Suspense fallback={<PageLoader variant="artist" />}>
      <ArtistContent artist={artist} />
    </Suspense>
  )
}

/**
 * Visi artist'o duomenys vienu cache'inamu wrapper'iu. unstable_cache
 * cache'ina rezultatą Vercel function memory + edge per ARTIST_CACHE_TTL
 * sekundžių, neatsižvelgiant į vidinį Supabase no-store fetch'us.
 *
 * Vercel CDN gali serve'inti SSR'intą HTML iš cache'o (kai page'as
 * naudoja unstable_cache, Next aptinka, kad rezultatas cache'inamas, ir
 * ISR mode aktyvuojasi). Pirmas request: pilnas SSR. Sekantys per 60s:
 * <50ms iš cache'o.
 */
const fetchArtistData = unstable_cache(
  async (artistId: number, country: string | null, score: number, rawRoles: string[] | null, activeFrom: number | string | null = null, activeUntil: number | string | null = null) => {
    const [genres, substyles, tableLinks, dbPhotos, albums, tracks, members, memberOf, followers, likeCount, news, rawEvents, _allTrackLegacyIds, legacyThreads, legacyNews, linkedTrackIdSet, awards, eras, displayRoles, discoveries] = await Promise.all([
      getGenres(artistId), getSubstyles(artistId), getLinks(artistId), getPhotos(artistId), getAlbums(artistId), getTracks(artistId),
      getMembers(artistId), getMemberOf(artistId), getFollowers(artistId), getLikeCount(artistId), getNews(artistId), getEvents(artistId),
      getAllArtistTrackLegacyIds(artistId),
      getLegacyForumThreads(artistId),
      getLegacyNewsThreads(artistId),
      getLinkedTrackIds(artistId),
      getArtistAwards(artistId),
      getArtistEras(artistId),
      getDisplayRoles(rawRoles),
      getDiscoveriesByArtist(artistId),
    ])
    const linkedTrackIds = Array.from(linkedTrackIdSet)
    const albumIds = (albums as any[]).map((a: any) => a.id).filter((x: any) => typeof x === 'number')
    const allTrackIds = (tracks as any[]).map((t: any) => t.id).filter((x: any) => typeof x === 'number')
    const allThreadIds = [
      ...(legacyThreads as any[]).map((t) => t.legacy_id),
      ...(legacyNews as any[]).map((t) => t.legacy_id),
    ]
    const [similar, legacyCommunity, ranks, lastPosts, popBarLevel, recentPopBarLevel, concertRecordings] = await Promise.all([
      getSimilar(artistId, genres.map((g: any) => g.id), (substyles as any[]).map((s: any) => s.id), country, activeFrom, activeUntil),
      getLegacyCommunity(artistId, albumIds, allTrackIds),
      getArtistRanks(artistId, country, genres as { id: number; name: string }[], score),
      getLastPostsByThread(allThreadIds, 2),
      getScorePopBarLevel(score),
      getRecentPopBarLevel(artistId),
      getArtistRecordings(artistId, 24),
    ])
    // Convert Map<number, PostInfo[]> to array for serialization
    const lastPostsArr = Array.from(lastPosts.entries()).map(([k, v]) => [k, v] as [number, typeof v])
    return {
      genres, substyles, tableLinks, dbPhotos, albums, tracks, members, memberOf, followers, likeCount,
      news, rawEvents, legacyThreads, legacyNews, linkedTrackIds, awards, eras,
      similar, legacyCommunity, ranks, lastPostsArr, displayRoles, popBarLevel, recentPopBarLevel,
      discoveries, concertRecordings,
    }
  },
  // v10 — 2026-06-10 bump: +discoveries („Muzikos atradimai" kortelė Diskusijose).
  // v9 — 2026-05-24 bump: cached v8 nelaikė substyles/genres array'us
  // šviežiai INTL atlikėjams po backfill'o (cache hit grąžindavo stale empty
  // tuplus). v9 priverčia full refetch — visi artist'ai gauna fresh data.
  ['artist-full-data-v12'],
  { revalidate: ARTIST_CACHE_TTL, tags: ['artist'] },
)

/** Pagrindinė atlikėjo diskusijų tema — į ją keliauja inline komentaras iš
 *  atlikėjo puslapio Diskusijų sekcijos. Senoji music.lt sistema kiekvienai
 *  grupei buvo sukūrusi pagrindinę temą (title == atlikėjo vardas). Get-or-create:
 *    1) tema, kurios title == vardas (case-insensitive);
 *    2) daugiausiai komentarų turinti tema;
 *    3) jei nė vienos — sukuriam naują pagrindinę temą (is_legacy=false).
 *  Grąžina modern discussions.id arba null. Niekada nemeta — klaida tik paslepia
 *  inline composer'į, puslapio nelaužo. NB: NEšaukti iš unstable_cache (rašymas). */
async function getOrCreateArtistMainDiscussionId(
  artistId: number,
  artistName: string,
  existing: Array<{ id?: number; title?: string | null; post_count?: number | null }>,
): Promise<number | null> {
  if (!artistId) return null
  const norm = (s?: string | null) => (s || '').trim().toLowerCase()
  const nameNorm = norm(artistName)
  const byName = existing.find((t) => t.id && norm(t.title) === nameNorm)
  if (byName?.id) return byName.id
  const mostCommented = existing
    .filter((t) => t.id)
    .sort((a, b) => (b.post_count || 0) - (a.post_count || 0))[0]
  if (mostCommented?.id) return mostCommented.id
  // Nėra nė vienos temos — sukuriam pagrindinę (idempotentiškai).
  try {
    const sb = createAdminClient()
    const { data: ex } = await sb
      .from('discussions')
      .select('id')
      .eq('artist_id', artistId)
      .eq('legacy_kind', 'discussion')
      .order('comment_count', { ascending: false })
      .limit(1)
    if (ex && ex[0]?.id) return ex[0].id
    const base = (artistName || 'tema')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'tema'
    const { data: created } = await sb
      .from('discussions')
      .insert({
        artist_id: artistId,
        title: artistName,
        // body — NOT NULL + CHECK char_length>=10. Trumpas auto įvadas
        // pagrindinei atlikėjo temai.
        body: `Bendra diskusija apie atlikėją ${artistName}.`,
        slug: `${base}-a${artistId}`,
        tag: 'Kita',
        legacy_kind: 'discussion',
        is_legacy: false,
        comment_count: 0,
      })
      .select('id')
      .single()
    return created?.id ?? null
  } catch {
    return null
  }
}

/** Komentaro kūnas saugomas kaip HTML (Tiptap composer output, pvz.
 *  `<p style="text-align:left">♥</p>`). Preview kortelėms paverčiam į gryną
 *  tekstą — kitaip React parodytų raw HTML žymes. */
function stripCommentHtml(html?: string | null): string {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>(?=)/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Pagrindinės temos detalė inline blokui: meta + TOP komentarai (pagal
 *  patiktukus). Kai yra komentarų — UI rodo gražias korteles + CTA; kai nėra —
 *  įvedimo formą. */
async function getArtistMainDiscussionDetail(id: number) {
  try {
    const sb = createAdminClient()
    const { data: disc } = await sb
      .from('discussions')
      .select('id, legacy_id, slug, title, comment_count')
      .eq('id', id)
      .single()
    if (!disc) return null
    const { data: cs } = await sb
      .from('comments')
      .select('id, body, like_count, created_at, author_id, profiles:author_id(username, avatar_url)')
      .eq('discussion_id', id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false }) // NAUJAUSI viršuje (kaip drawer'yje)
      .limit(3)
    const topComments = ((cs || []) as any[]).map((c: any) => ({
      id: c.id,
      body: stripCommentHtml(c.body),
      like_count: c.like_count || 0,
      created_at: c.created_at || null,
      author_username: c.profiles?.username || null,
      author_avatar: c.profiles?.avatar_url || null,
    })).filter((c: any) => c.body)
    return {
      id: disc.id,
      legacy_id: (disc as any).legacy_id ?? null,
      slug: (disc as any).slug ?? null,
      title: disc.title || '',
      comment_count: Math.max((disc as any).comment_count || 0, topComments.length),
      topComments,
    }
  } catch {
    return null
  }
}

async function ArtistContent({ artist }: { artist: any }) {
  const data = await fetchArtistData(
    artist.id,
    artist.country || null,
    (artist as any).score || 0,
    (artist as any).roles || null,
    (artist as any).active_from ?? null,
    (artist as any).active_until ?? null,
  )
  const {
    genres, substyles, tableLinks, dbPhotos, albums, tracks, members, followers, likeCount,
    news, rawEvents, legacyThreads, legacyNews, linkedTrackIds, awards, eras,
    similar, legacyCommunity, ranks, lastPostsArr, displayRoles, popBarLevel, recentPopBarLevel,
  } = data
  const memberOf = (data as any).memberOf || []
  const discoveries = (data as any).discoveries || []
  const concertRecordings = (data as any).concertRecordings || []
  const links = buildSocialLinks(artist, tableLinks as { platform: string; url: string }[])
  const lastPosts = new Map(lastPostsArr)

  // Photos shown publicly — TIK is_active=true. artist_photos lentelė yra
  // kanoninis šaltinis; legacy `artists.photos` JSON kolumna jau nebenaudojama
  // (anksčiau čia būdavo merge'inama be is_active filter'io ir todėl rodėsi
  // hidden nuotraukos viešai).
  // PRESERVE'INAM visus metadata fields'us — gallery year badge, lightbox
  // author link, source_url visi reikalauja šių fields'ų. Anksciau buvo
  // map'inta tik {url, caption} — todėl public side metai/autorius nematėsi.
  const photos: any[] = dbPhotos
    .filter((p: any) => p.is_active === true)
    .map((p: any) => ({
      url: p.url,
      caption: p.caption,
      taken_at: p.taken_at || null,
      source_url: p.source_url || null,
      license: p.license || null,
      photographer_slug: p.photographer_slug || null,
      photographer_name: p.photographer_name || null,
    }))

  // Hero image preference (NEVER cover_image_url — that's a small profile thumb):
  //  1. Explicitly set wide cover (admin-chosen)
  //  2. First active photo from gallery — typically higher-res
  //  3. null → no hero shown (better than blurry small thumb)
  // 2026-05-24: SĄMONINGAI nedarom YT thumb fallback'o hero'ui — low-res
  // 480px image'o ištempimas į 1920px atrodo blurry. Geriau jokio hero,
  // nei prastas hero. YT thumbnail naudojamas TIK mažoms thumb pozicijoms
  // (search, kortelės) per cover_image_url fallback'ą.
  const galleryFirst = photos.length > 0 ? photos[0].url : null
  const heroImage = artist.cover_image_wide_url
    || galleryFirst
    || null

  // „Nauja daina" = išleista einamaisiais metais (2026) ARBA per paskutinius
  // 12 mėn. nuo šiandienos. Tikslią datą imam iš YouTube įkėlimo datos
  // (is_new_date), tada iš release_date, tada iš release_year+month(+day).
  // Slankus 12 mėn. langas (ne kalendorinis „pernai") — kad pvz. daina
  // išleista 2025-04-18, kai šiandien 2026-06-19 (>12 mėn.), NEBŪTŲ laikoma
  // nauja. Tik metai (be mėn.) → naujumą laikom tik einamaisiais metais.
  const _now = new Date()
  const _nowYear = _now.getFullYear()
  const _cutoff = new Date(_now); _cutoff.setFullYear(_nowYear - 1) // prieš 12 mėn.
  const _effDate = (t: any): Date | null => {
    if (t.is_new_date) { const d = new Date(t.is_new_date); if (!isNaN(d.getTime())) return d }
    if (t.release_date) { const d = new Date(t.release_date); if (!isNaN(d.getTime())) return d }
    if (t.release_year && t.release_month) {
      const d = new Date(t.release_year, (t.release_month as number) - 1, (t.release_day as number) || 1)
      if (!isNaN(d.getTime())) return d
    }
    return null
  }
  const newTracks = tracks.filter((t: any) => {
    if (t.is_new) return true
    const d = _effDate(t)
    if (d) return d >= _cutoff
    // Tik metai (be tikslios datos) → naujumą laikom tik einamaisiais metais.
    if (t.release_year) return t.release_year >= _nowYear
    return false
  })
  const topVideos = tracks.filter((t: any) => t.video_url).slice(0, 8)

  const events = rawEvents

  // Enrich forum threads with last post preview so the UI can show a teaser.
  // similar/legacyCommunity/ranks/lastPosts jau apskaičiuoti aukštyn antrame
  // batch'e (Promise.all) — čia tik post-process.
  const legacyThreadsWithPosts = (legacyThreads as any[]).map((t) => {
    const recent = lastPosts.get(t.legacy_id) || []
    return {
      ...t,
      last_post: recent[0] || null,
      recent_posts: recent,
    }
  })
  // Pagrindinė diskusijų tema inline komentarui (žr. helper'į aukščiau).
  const mainDiscussionId = await getOrCreateArtistMainDiscussionId(
    artist.id, artist.name, legacyThreadsWithPosts as any,
  )
  const mainDiscussion = mainDiscussionId
    ? await getArtistMainDiscussionDetail(mainDiscussionId)
    : null
  const legacyNewsWithPosts = (legacyNews as any[]).map((t) => {
    const recent = lastPosts.get(t.legacy_id) || []
    return {
      ...t,
      last_post: recent[0] || null,
      recent_posts: recent,
    }
  })

  // JSON-LD structured data — Person ar MusicGroup priklauso nuo type.
  // Google rich results + AI scrapers naudoja šitą, ne meta tags.
  // Image, URL, sameAs (Spotify/YouTube/website) — visi pridedami jei yra.
  const isGroup = (artist.type || 'group') !== 'solo'
  const sameAs: string[] = []
  if (artist.website) sameAs.push(artist.website)
  if (artist.spotify_id) sameAs.push(`https://open.spotify.com/artist/${artist.spotify_id}`)
  if ((artist as any).youtube_channel_id) sameAs.push(`https://www.youtube.com/channel/${(artist as any).youtube_channel_id}`)
  for (const l of tableLinks as any[]) {
    if (l?.url && !sameAs.includes(l.url)) sameAs.push(l.url)
  }
  const jsonLd: any = {
    '@context': 'https://schema.org',
    '@type': isGroup ? 'MusicGroup' : 'Person',
    name: artist.name,
    url: `https://music.lt/atlikejai/${artist.slug}`,
    ...(artist.cover_image_url ? { image: artist.cover_image_url } : {}),
    ...(genres.length > 0 ? { genre: genres.map((g: any) => g.name) } : {}),
    ...(artist.birth_date && !isGroup ? { birthDate: artist.birth_date } : {}),
    ...(artist.death_date && !isGroup ? { deathDate: artist.death_date } : {}),
    ...(artist.active_from && isGroup ? { foundingDate: String(artist.active_from) } : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  }

  // Score breakdown — public artist puslapis NIEKADA jo nerodo, net jei
  // žiūri admin'as. Score'ą redaguoji per /admin/artists/[id] (atskiras puslapis,
  // ten yra full Reitingas modalas). Public — tik catalog metadata.
  const _accent = (artist as any).accent_color
  const _theme = (artist as any).profile_theme === 'light' ? 'light' : null
  const inner = (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    <ArtistProfileClient
      artist={{ id: artist.id, slug: artist.slug, name: artist.name, type: artist.type || 'group', country: artist.country, active_from: artist.active_from, active_until: artist.active_until,
        // description fallback: jei `description` (Wiki canonical) tuščia
        // arba placeholder (<20 ch), naudojam `description_legacy` (music.lt
        // scrape). Mamontovas ir kt. artistai dar neturi Wiki bio — bet
        // music.lt scrape parsina jų aprašymus.
        description: stripStyles(((artist.description || '').trim().length >= 20 ? artist.description : (artist as any).description_legacy) || ''),
        cover_image_url: artist.cover_image_url, cover_image_position: artist.cover_image_position, website: artist.website, spotify_id: artist.spotify_id, is_verified: artist.is_verified, gender: artist.gender, birth_date: artist.birth_date, death_date: artist.death_date, legacy_id: (artist as any).legacy_id ?? null, source: (artist as any).source ?? null, score: null, score_breakdown: null, score_updated_at: null }}
      heroImage={heroImage} genres={genres} links={links} photos={photos} albums={albums as any} tracks={tracks as any}
      members={members} memberOf={memberOf} followers={followers} likeCount={likeCount} news={news as any} events={events}
      similar={similar} newTracks={newTracks as any} topVideos={topVideos as any}
      chartData={mockChart(albums)} hasNewMusic={newTracks.length > 0}
      legacyCommunity={legacyCommunity} legacyThreads={legacyThreadsWithPosts as any} legacyNews={legacyNewsWithPosts as any}
      discoveries={discoveries as any}
      ranks={ranks}
      substyles={substyles}
      linkedTrackIds={linkedTrackIds}
      awards={awards}
      eras={eras as any}
      displayRoles={displayRoles}
      popBarLevel={popBarLevel}
      recentPopBarLevel={recentPopBarLevel}
      concertRecordings={concertRecordings}
      mainDiscussionId={mainDiscussionId}
      mainDiscussion={mainDiscussion}
    />
    <ArtistSocialSection artistId={artist.id} slug={artist.slug} name={artist.name} isClaimed={(artist as any).is_claimed} />
    </>
  )
  if (!_accent && !_theme) return inner
  const _wrapStyle: any = { minHeight: '100vh' }
  if (_theme) _wrapStyle.background = 'var(--bg-body)'
  if (_accent) { _wrapStyle['--accent-orange'] = _accent; _wrapStyle['--accent-link'] = _accent }
  return <div data-theme={_theme || undefined} style={_wrapStyle}>{inner}</div>
}
