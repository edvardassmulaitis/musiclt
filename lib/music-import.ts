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
import { addToLibrary, type FavKind } from '@/lib/mano-muzika'
import { normalizeForMatch, primaryArtist } from '@/lib/chart-resolve'

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
  const cap = opts.perKindLimit ?? 500

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
  // Importas → biblioteka (patiktukai). Bulk, kad nedarytume po užklausą kiekvienam.
  await Promise.all([
    addToLibrary(userId, 'artist', (sel.artists || []).filter(Number.isFinite)),
    addToLibrary(userId, 'album', (sel.albums || []).filter(Number.isFinite)),
    addToLibrary(userId, 'track', (sel.tracks || []).filter(Number.isFinite)),
  ])
  return { ok: true, added: { artists: sel.artists?.length || 0, albums: sel.albums?.length || 0, tracks: sel.tracks?.length || 0 } }
}

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE ADAPTERS
// ═══════════════════════════════════════════════════════════════════════════

// ── Last.fm ────────────────────────────────────────────────────────────────
export function lastfmConfigured(): boolean { return !!process.env.LASTFM_API_KEY }

export type ImportMode = 'best' | 'full'

// Kiek maksimaliai imti kiekvieno tipo. „best" = mėgstamiausi/dažniausi (švarus
// signalas), „full" = papildomai naujausia klausymų istorija (recent tracks).
// „best" turi būti GREITAS ir patikimas (sinchroninis — telpa į 60s funkcijos
// limitą). Gilus importas vyksta fone (žr. lib/import-jobs.ts), tad čia laikom
// kuklius limitus, kad atpažinimas spėtų užbaigti per vieną užklausą.
const LASTFM_CAPS: Record<ImportMode, { artists: number; albums: number; loved: number; top: number; recent: number }> = {
  best: { artists: 120, albums: 100, loved: 150, top: 120, recent: 0 },
  full: { artists: 500, albums: 400, loved: 1000, top: 500, recent: 1500 },
}

export async function fetchLastfm(username: string, opts: { mode?: ImportMode } = {}): Promise<RawItems> {
  const key = process.env.LASTFM_API_KEY
  if (!key) throw new Error('Last.fm importas nesukonfigūruotas (trūksta LASTFM_API_KEY)')
  const user = username.trim().replace(/^@/, '')
  if (!user) throw new Error('Įvesk Last.fm vartotojo vardą')
  const mode: ImportMode = opts.mode === 'full' ? 'full' : 'best'
  const CAP = LASTFM_CAPS[mode]
  const base = 'https://ws.audioscrobbler.com/2.0/'

  const call = async (method: string, extra: string) => {
    const url = `${base}?method=${method}&user=${encodeURIComponent(user)}&api_key=${key}&format=json&${extra}`
    const r = await fetch(url, { headers: { 'User-Agent': 'music.lt-import/1.0' } })
    if (!r.ok) {
      if (r.status === 404) throw new Error('Last.fm vartotojas nerastas')
      throw new Error(`Last.fm klaida (${r.status})`)
    }
    const json = await r.json().catch(() => null)
    // SVARBU: Last.fm dažnai grąžina HTTP 200 su klaidos kūnu ({error, message}) —
    // pvz. netinkamas API raktas (10), privatus/nerastas vartotojas (6), limitas (29).
    // Be šito patikrinimo klaida „pradingsta" ir importas tyliai grąžina 0 įrašų.
    if (json && typeof json === 'object' && 'error' in json) {
      const code = Number((json as any).error)
      if (code === 6 || code === 7) throw new Error('Last.fm vartotojas nerastas arba profilis privatus')
      if (code === 10 || code === 26) throw new Error('Last.fm importas nesukonfigūruotas (netinkamas API raktas)')
      if (code === 29) throw new Error('Last.fm laikinai apribojo užklausas — pabandyk po kelių minučių')
      throw new Error(`Last.fm klaida: ${(json as any).message || code}`)
    }
    return json
  }

  // Paginuotas rinkėjas — eina per puslapius kol surenka iki `cap` arba baigiasi.
  const paged = async (method: string, root: string, listKey: string, cap: number, extra = '', perPage = 200): Promise<any[]> => {
    if (cap <= 0) return []
    const out: any[] = []
    const maxPages = Math.ceil(cap / perPage) + 1
    for (let page = 1; out.length < cap && page <= maxPages; page++) {
      const data = await call(method, `limit=${perPage}&page=${page}${extra ? `&${extra}` : ''}`).catch(() => null)
      const container = data?.[root]
      const items = container?.[listKey]
      const arr = Array.isArray(items) ? items : (items ? [items] : [])
      if (!arr.length) break
      out.push(...arr)
      const totalPages = Number(container?.['@attr']?.totalPages || 0)
      if (totalPages && page >= totalPages) break
    }
    return out.slice(0, cap)
  }

  // Validacija PIRMIAUSIA — patikrinam API raktą ir ar vartotojas pasiekiamas.
  // Jei kažkas blogai, mesim aiškią klaidą (vietoj tylaus 0 rezultatų).
  await call('user.getinfo', '')

  const [topArt, topAlb, lovedT, topT] = await Promise.all([
    paged('user.gettopartists', 'topartists', 'artist', CAP.artists, 'period=overall'),
    paged('user.gettopalbums', 'topalbums', 'album', CAP.albums, 'period=overall'),
    paged('user.getlovedtracks', 'lovedtracks', 'track', CAP.loved),
    paged('user.gettoptracks', 'toptracks', 'track', CAP.top, 'period=overall'),
  ])

  const artists: RawArtist[] = topArt
    .map((a: any) => ({ name: a.name, meta: { playcount: Number(a.playcount) || 0 } }))
    .filter((a: RawArtist) => a.name)

  const albumMap = new Map<string, RawTrackish>()
  for (const a of topAlb) {
    const artist = a.artist?.name || a.artist?.['#text'] || ''
    if (a.name && artist) albumMap.set(`${artist}|${a.name}`.toLowerCase(), { artist, title: a.name, meta: { playcount: Number(a.playcount) || 0 } })
  }

  const trackMap = new Map<string, RawTrackish>()
  for (const t of lovedT) {
    const artist = t.artist?.name || t.artist?.['#text'] || ''
    if (t.name && artist) trackMap.set(`${artist}|${t.name}`.toLowerCase(), { artist, title: t.name, meta: { loved: true } })
  }
  for (const t of topT) {
    const artist = t.artist?.name || t.artist?.['#text'] || ''
    const k = `${artist}|${t.name}`.toLowerCase()
    if (t.name && artist && !trackMap.has(k)) trackMap.set(k, { artist, title: t.name, meta: { playcount: Number(t.playcount) || 0 } })
  }

  // FULL — pridedam naujausią klausymų istoriją (recent tracks), dedup pagal raktą.
  if (CAP.recent > 0) {
    const recent = await paged('user.getrecenttracks', 'recenttracks', 'track', CAP.recent)
    for (const t of recent) {
      if (t['@attr']?.nowplaying) continue
      const artist = t.artist?.name || t.artist?.['#text'] || ''
      if (!t.name || !artist) continue
      const k = `${artist}|${t.name}`.toLowerCase()
      if (!trackMap.has(k)) trackMap.set(k, { artist, title: t.name, meta: { recent: true } })
      const alb = t.album?.['#text'] || t.album?.name || ''
      if (alb) {
        const ak = `${artist}|${alb}`.toLowerCase()
        if (!albumMap.has(ak)) albumMap.set(ak, { artist, title: alb, meta: { recent: true } })
      }
    }
  }

  return { artists, tracks: [...trackMap.values()], albums: [...albumMap.values()] }
}

// ── NEATPAŽINTŲ auto-reportas → „trūkstama muzika" (music_requests) ──────────
// Importo metu neatpažintus įrašus sudedam į bendrą trūkstamos muzikos eilę su
// source='import' ir prisegam narį prie kiekvieno requesto per
// music_request_followers. Kai adminas requestą išspręs (sukurs/susies entity),
// jis automatiškai bus pridėtas į šito nario „Mano muziką" (žr. admin route).
const importNormKey = (artist: string, title: string | null) =>
  `${normalizeForMatch(primaryArtist(artist || ''))}|${normalizeForMatch(title || '')}`

export async function reportMissingImport(
  userId: string,
  staged: StagedResult,
  source = 'import',
): Promise<{ reported: number }> {
  const sb = createAdminClient()
  type Pending = { raw_artist: string; raw_title: string | null; kind_hint: FavKind; norm_key: string }
  const pend: Pending[] = []
  const collect = (hits: StagedHit[], kind: FavKind) => {
    for (const h of hits) {
      if (h.matched) continue
      const artist = (h.rawArtist || (kind === 'artist' ? h.raw : '') || '').trim()
      const title = kind === 'artist' ? null : (h.raw || '').trim()
      if (!artist) continue
      pend.push({ raw_artist: artist, raw_title: title, kind_hint: kind, norm_key: importNormKey(artist, title) })
    }
  }
  collect(staged.artists, 'artist')
  collect(staged.albums, 'album')
  collect(staged.tracks, 'track')
  if (!pend.length) return { reported: 0 }

  // dedup per batch
  const seen = new Set<string>()
  const uniq = pend.filter(p => { if (seen.has(p.norm_key)) return false; seen.add(p.norm_key); return true })
  const keys = uniq.map(u => u.norm_key)

  // jau esami requestai pagal norm_key (bet kokio statuso) — nedubliuojam
  const existing = new Map<string, { id: string; status: string; matched_type: string | null; matched_id: number | null }>()
  for (let i = 0; i < keys.length; i += 200) {
    const { data } = await sb.from('music_requests')
      .select('id, norm_key, status, matched_type, matched_id')
      .in('norm_key', keys.slice(i, i + 200))
    for (const r of (data || []) as any[]) if (!existing.has(r.norm_key)) existing.set(r.norm_key, r)
  }

  // naujus įterpiam
  const toInsert = uniq.filter(u => !existing.has(u.norm_key)).map(u => ({
    source, raw_artist: u.raw_artist, raw_title: u.raw_title, kind_hint: u.kind_hint,
    context: 'Importas (Last.fm)', norm_key: u.norm_key, status: 'pending',
  }))
  const newIds: string[] = []
  for (let i = 0; i < toInsert.length; i += 200) {
    const { data } = await sb.from('music_requests').insert(toInsert.slice(i, i + 200)).select('id')
    for (const r of (data || []) as any[]) newIds.push(r.id)
  }

  // followerį prisegam: prie naujų + prie esamų
  const followerRows = newIds.map(id => ({ request_id: id, user_id: userId }))
  for (const r of existing.values()) followerRows.push({ request_id: r.id, user_id: userId })
  for (let i = 0; i < followerRows.length; i += 200) {
    await sb.from('music_request_followers')
      .upsert(followerRows.slice(i, i + 200), { onConflict: 'request_id,user_id', ignoreDuplicates: true })
  }

  // jei esamas requestas JAU išspręstas — entity pridedam į biblioteką iškart
  for (const r of existing.values()) {
    if (r.status === 'resolved' && r.matched_id && ['artist', 'album', 'track'].includes(r.matched_type || '')) {
      try { await addToLibrary(userId, r.matched_type as FavKind, [r.matched_id]) } catch {}
    }
  }
  return { reported: uniq.length }
}

// Suderinta pora: match + auto-report neatpažintų (jei userId yra).
export async function stageAndReport(
  userId: string | null,
  raw: RawItems,
  opts: { source?: string; perKindLimit?: number } = {},
): Promise<StagedResult & { reported: number }> {
  const staged = await matchItems(raw, opts.perKindLimit ? { perKindLimit: opts.perKindLimit } : {})
  let reported = 0
  if (userId) {
    try { reported = (await reportMissingImport(userId, staged, opts.source || 'import')).reported } catch {}
  }
  return { ...staged, reported }
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
