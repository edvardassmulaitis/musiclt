// lib/music-import.ts
// ───────────────────────────────────────────────────────────────────────────
// Mėgstamos muzikos importas iš išorinių platformų į „Mano muziką".
//
// Šaltiniai (source adapters → raw items):
//   • Last.fm   — username (be OAuth, reikia LASTFM_API_KEY)
//   • Spotify   — „Download your data" YourLibrary.json (parse'inamas kliente)
//   • YouTube   — viešo playlisto nuoroda (YOUTUBE_API_KEY, be OAuth)
//
// Visi šaltiniai gamina vienodus RawItems, kurie per search-core.ts
// sumečiami (match) su music.lt baze → staged preview (matched/unmatched).
// Patvirtinus, commitInto() masiškai įdeda per profile_favorite_*.
// ───────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase'
import { searchArtistsCore, searchTracksCore, searchAlbumsCore, normLt } from '@/lib/search-core'
import { addFavorite, type FavKind } from '@/lib/mano-muzika'

// ── Raw / staged tipai ─────────────────────────────────────────────────────
export type RawArtist = { name: string; meta?: any }
export type RawTrackish = { artist: string; title: string; meta?: any } // track arba album
export type RawItems = { artists?: RawArtist[]; tracks?: RawTrackish[]; albums?: RawTrackish[] }

export type StagedHit = {
  raw: string                 // originalas iš šaltinio (rodymui)
  rawArtist?: string
  matched: boolean
  confidence: 'high' | 'low'
  id?: number                 // music.lt entity id
  name?: string               // music.lt pavadinimas
  slug?: string
  cover?: string | null
  artist?: string | null      // dainoms/albumams
}
export type StagedResult = {
  artists: StagedHit[]
  tracks: StagedHit[]
  albums: StagedHit[]
  counts: { matched: number; unmatched: number; total: number }
}

// ── Util: concurrency-ribotas map (kad neperkrautume Supabase) ─────────────
async function mapLimit<T, R>(arr: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(arr.length)
  let i = 0
  const workers = Array.from({ length: Math.min(limit, arr.length) }, async () => {
    while (i < arr.length) {
      const idx = i++
      out[idx] = await fn(arr[idx])
    }
  })
  await Promise.all(workers)
  return out
}

// ── Util: ar atitiktis „patikima" ──────────────────────────────────────────
function nameMatches(query: string, result: string): boolean {
  const a = normLt(query), b = normLt(result)
  if (!a || !b) return false
  return a === b || b.includes(a) || a.includes(b)
}

// ── MATCHER ────────────────────────────────────────────────────────────────
export async function matchItems(items: RawItems, opts: { perKindLimit?: number } = {}): Promise<StagedResult> {
  const sb = createAdminClient()
  const cap = opts.perKindLimit ?? 100

  const artists = (items.artists || []).slice(0, cap)
  const tracks = (items.tracks || []).slice(0, cap)
  const albums = (items.albums || []).slice(0, cap)

  // ARTISTS — top-1 per searchArtistsCore (concurrency 6)
  const artistHits: StagedHit[] = await mapLimit(artists, 6, async (a) => {
    const res = await searchArtistsCore(sb, a.name, { limit: 1, select: 'id, name, slug, cover_image_url, score' })
    const top = res[0]
    if (!top) return { raw: a.name, matched: false, confidence: 'low' as const }
    return {
      raw: a.name, matched: true, confidence: nameMatches(a.name, top.name) ? 'high' : 'low',
      id: top.id, name: top.name, slug: top.slug, cover: top.cover_image_url ?? null,
    }
  })

  // TRACKS — compound „artist title" → searchTracksCore → hydrate
  const trackHits = await matchTrackish(sb, tracks, 'track')
  // ALBUMS
  const albumHits = await matchTrackish(sb, albums, 'album')

  const all = [...artistHits, ...trackHits, ...albumHits]
  const matched = all.filter(h => h.matched).length
  return {
    artists: artistHits, tracks: trackHits, albums: albumHits,
    counts: { matched, unmatched: all.length - matched, total: all.length },
  }
}

async function matchTrackish(sb: any, items: RawTrackish[], kind: 'track' | 'album'): Promise<StagedHit[]> {
  return mapLimit(items, 6, async (it) => {
    const q = `${it.artist} ${it.title}`.trim()
    const raw = it.title
    const ids = kind === 'track'
      ? await searchTracksCore(sb, q, { limit: 1 })
      : await searchAlbumsCore(sb, q, { limit: 1 })
    const id = ids[0]
    if (!id) return { raw, rawArtist: it.artist, matched: false, confidence: 'low' as const }
    // hydrate
    const table = kind === 'track' ? 'tracks' : 'albums'
    const coverCol = kind === 'track' ? 'cover_url' : 'cover_image_url'
    const { data } = await sb.from(table)
      .select(`id, slug, title, ${coverCol}, artists:artist_id(name, slug)`)
      .eq('id', id).maybeSingle()
    if (!data) return { raw, rawArtist: it.artist, matched: false, confidence: 'low' as const }
    const artistObj = Array.isArray(data.artists) ? data.artists[0] : data.artists
    return {
      raw, rawArtist: it.artist, matched: true,
      confidence: nameMatches(it.title, data.title) ? 'high' : 'low',
      id: data.id, name: data.title, slug: data.slug, cover: data[coverCol] ?? null,
      artist: artistObj?.name ?? null,
    }
  })
}

// ── COMMIT — masinis įdėjimas į „Mano muziką" ──────────────────────────────
export async function commitInto(userId: string, sel: { artists?: number[]; albums?: number[]; tracks?: number[] }) {
  const jobs: Promise<any>[] = []
  const push = (kind: FavKind, ids?: number[]) => {
    for (const id of (ids || [])) jobs.push(addFavorite(userId, kind, id).catch(() => null))
  }
  push('artist', sel.artists)
  push('album', sel.albums)
  push('track', sel.tracks)
  await Promise.all(jobs)
  return { ok: true, added: { artists: sel.artists?.length || 0, albums: sel.albums?.length || 0, tracks: sel.tracks?.length || 0 } }
}

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE ADAPTERS
// ═══════════════════════════════════════════════════════════════════════════

// ── Last.fm ────────────────────────────────────────────────────────────────
export function lastfmConfigured(): boolean { return !!process.env.LASTFM_API_KEY }

export async function fetchLastfm(username: string): Promise<RawItems> {
  const key = process.env.LASTFM_API_KEY
  if (!key) throw new Error('Last.fm importas nesukonfigūruotas (trūksta LASTFM_API_KEY)')
  const user = username.trim().replace(/^@/, '')
  if (!user) throw new Error('Įvesk Last.fm vartotojo vardą')
  const base = 'https://ws.audioscrobbler.com/2.0/'
  const call = async (method: string, extra: string) => {
    const url = `${base}?method=${method}&user=${encodeURIComponent(user)}&api_key=${key}&format=json&${extra}`
    const r = await fetch(url, { headers: { 'User-Agent': 'music.lt-import/1.0' } })
    if (!r.ok) {
      if (r.status === 404) throw new Error('Last.fm vartotojas nerastas')
      throw new Error(`Last.fm klaida (${r.status})`)
    }
    return r.json()
  }
  const [topArt, lovedT, topT] = await Promise.all([
    call('user.gettopartists', 'limit=60&period=overall').catch(() => null),
    call('user.getlovedtracks', 'limit=80').catch(() => null),
    call('user.gettoptracks', 'limit=60&period=overall').catch(() => null),
  ])

  const artists: RawArtist[] = (topArt?.topartists?.artist || []).map((a: any) => ({ name: a.name, meta: { playcount: Number(a.playcount) || 0 } }))
  const trackMap = new Map<string, RawTrackish>()
  for (const t of (lovedT?.lovedtracks?.track || [])) {
    const artist = t.artist?.name || t.artist?.['#text'] || ''
    if (t.name && artist) trackMap.set(`${artist}|${t.name}`.toLowerCase(), { artist, title: t.name, meta: { loved: true } })
  }
  for (const t of (topT?.toptracks?.track || [])) {
    const artist = t.artist?.name || t.artist?.['#text'] || ''
    const k = `${artist}|${t.name}`.toLowerCase()
    if (t.name && artist && !trackMap.has(k)) trackMap.set(k, { artist, title: t.name, meta: { playcount: Number(t.playcount) || 0 } })
  }
  return { artists, tracks: [...trackMap.values()] }
}

// ── Spotify „Download your data" (YourLibrary.json) ────────────────────────
// Parse'inama kliente; čia – normalizatorius, jei reikėtų server-side.
export function parseSpotifyLibrary(json: any): RawItems {
  const artists: RawArtist[] = (json?.artists || []).map((a: any) => ({ name: a.name || a.artistName || '' })).filter((a: RawArtist) => a.name)
  const tracks: RawTrackish[] = (json?.tracks || []).map((t: any) => ({ artist: t.artist || t.artistName || '', title: t.track || t.trackName || '' })).filter((t: RawTrackish) => t.artist && t.title)
  const albums: RawTrackish[] = (json?.albums || []).map((a: any) => ({ artist: a.artist || a.artistName || '', title: a.album || a.albumName || '' })).filter((a: RawTrackish) => a.artist && a.title)
  return { artists, tracks, albums }
}

// ── YouTube viešas playlistas ──────────────────────────────────────────────
export function extractYoutubePlaylistId(input: string): string | null {
  const s = input.trim()
  const m = s.match(/[?&]list=([A-Za-z0-9_-]+)/)
  if (m) return m[1]
  if (/^[A-Za-z0-9_-]{12,}$/.test(s)) return s   // gali būti tiesiog ID
  return null
}

// Išvalo YouTube video pavadinimą iki „Artist - Title".
export function parseYoutubeTitle(title: string, channel?: string): RawTrackish | null {
  let t = (title || '')
    .replace(/\([^)]*\)/g, ' ')                  // (Official Video) ...
    .replace(/\[[^\]]*\]/g, ' ')                 // [Lyrics] ...
    .replace(/\b(official|video|audio|lyric[s]?|hd|hq|mv|m\/v|visualizer|live|remaster(ed)?)\b/gi, ' ')
    .replace(/[|｜].*/, ' ')                       // viskas po | atmesti
    .replace(/\s+/g, ' ').trim()
  // „Artist - Title"
  const dash = t.split(/\s[-–—]\s/)
  if (dash.length >= 2) {
    const artist = dash[0].trim()
    const titleP = dash.slice(1).join(' - ').trim()
    if (artist && titleP) return { artist, title: titleP }
  }
  // Be brūkšnio — naudoti kanalą kaip atlikėją (nuimam „- Topic")
  const ch = (channel || '').replace(/\s*-\s*Topic$/i, '').trim()
  if (ch && t) return { artist: ch, title: t }
  return null
}

export async function fetchYoutubePlaylist(url: string): Promise<RawItems> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) throw new Error('YouTube importas nesukonfigūruotas (trūksta YOUTUBE_API_KEY)')
  const playlistId = extractYoutubePlaylistId(url)
  if (!playlistId) throw new Error('Nepavyko atpažinti playlisto nuorodos (turi būti ?list=...)')

  const tracks: RawTrackish[] = []
  let pageToken = ''
  for (let page = 0; page < 2; page++) {   // iki ~100 įrašų
    const api = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${encodeURIComponent(playlistId)}&key=${key}${pageToken ? `&pageToken=${pageToken}` : ''}`
    const r = await fetch(api)
    if (!r.ok) {
      if (r.status === 404) throw new Error('Playlistas nerastas arba privatus')
      throw new Error(`YouTube klaida (${r.status})`)
    }
    const data = await r.json()
    for (const it of (data.items || [])) {
      const sn = it.snippet || {}
      if (sn.title === 'Private video' || sn.title === 'Deleted video') continue
      const parsed = parseYoutubeTitle(sn.title, sn.videoOwnerChannelTitle)
      if (parsed) tracks.push(parsed)
    }
    if (!data.nextPageToken) break
    pageToken = data.nextPageToken
  }
  return { tracks }
}
