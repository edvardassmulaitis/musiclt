/**
 * Quick-add orchestrators — admin „greitas pridėjimas" iš vienos nuorodos.
 *
 *   quickAddTrack(url)  — YouTube nuoroda → sukuria dainą:
 *       1) getVideoDetails (title, channel, uploadedAt, views)
 *       2) iš video title'o atskiria atlikėją + dainos pavadinimą
 *       3) resolve/sukuria atlikėją
 *       4) sukuria track (video_url, video_embeddable, video_uploaded_at)
 *          + YT įkėlimo data → release_year/month/day (išleidimo diena)
 *       5) enrich: video_views (enrichTrack), lyrics (LRCLib), spotify_id
 *
 *   quickAddAlbum(url) — Wikipedia albumo nuoroda → sukuria albumą:
 *       1) fetch wikitext
 *       2) iš infobox'o `| artist =` atskiria atlikėją → resolve/sukuria
 *          (sukurtam atlikėjui light enrichment iš jo Wiki page'o)
 *       3) parse: title, release date, cover, genres, tracklist
 *       4) createAlbum (su tracklist'u) — tas pats kelias kaip Wiki Disco import
 *
 * Abu grąžina vieningą QuickAddResult, kad UI galėtų parodyti rezultatą.
 *
 * Pastaba: tik Wikipedia šaltinis albumams (sprendimas 2026-05-30). AOTY/Discogs
 * neįtraukti (nėra oficialaus API / TOS rizika).
 */

import { createAdminClient } from '@/lib/supabase'
import { extractVideoIdFromUrl, getVideoDetails } from '@/lib/yt-innertube'
import { enrichTrack } from '@/lib/yt-enrich'
import { COUNTRIES, SUBSTYLES } from '@/lib/constants'
import * as wiki from '@/lib/wiki-parser'
import { createAlbum, type AlbumFull, type TrackInAlbum } from '@/lib/supabase-albums'
import { slugify } from '@/lib/slugify'

// ────────────────────────────────────────────────────────────────────────────
// Tipai
// ────────────────────────────────────────────────────────────────────────────

export type QuickAddArtist = {
  id: number
  name: string
  slug?: string | null
  created: boolean
}

export type QuickAddResult =
  | {
      ok: true
      kind: 'track'
      track: { id: number; title: string; slug?: string | null }
      artist: QuickAddArtist
      detail: {
        video_id: string | null
        upload_date: string | null
        views: number | null
        embeddable: boolean | null
        lyrics_found: boolean
        spotify_found: boolean
      }
      warnings: string[]
    }
  | {
      ok: true
      kind: 'album'
      album: { id: number; title: string }
      artist: QuickAddArtist
      detail: {
        year: number | null
        track_count: number
        cover_found: boolean
        genres: string[]
      }
      warnings: string[]
    }
  | { ok: false; kind: 'track' | 'album' | 'unknown'; error: string }

// ────────────────────────────────────────────────────────────────────────────
// URL tipo detekcija
// ────────────────────────────────────────────────────────────────────────────

export function detectUrlKind(url: string): 'track' | 'album' | 'unknown' {
  const u = (url || '').trim().toLowerCase()
  if (!u) return 'unknown'
  if (/youtube\.com|youtu\.be/.test(u)) return 'track'
  if (/wikipedia\.org\/wiki\//.test(u)) return 'album'
  return 'unknown'
}

// ────────────────────────────────────────────────────────────────────────────
// Wiki parser konstantų inicializacija (vienkartinė)
// ────────────────────────────────────────────────────────────────────────────

let _wikiInit = false
function ensureWikiInit() {
  if (_wikiInit) return
  wiki.initializeConstants(COUNTRIES as readonly string[] as string[], SUBSTYLES)
  _wikiInit = true
}

// ────────────────────────────────────────────────────────────────────────────
// YT title → { artist, title }
// ────────────────────────────────────────────────────────────────────────────

const YT_TITLE_NOISE = [
  /\(\s*official\s+music\s+video\s*\)/gi,
  /\(\s*official\s+video\s*\)/gi,
  /\(\s*official\s+audio\s*\)/gi,
  /\(\s*official\s+lyric\s+video\s*\)/gi,
  /\(\s*official\s+visuali[sz]er\s*\)/gi,
  /\(\s*official\s*\)/gi,
  /\(\s*lyric[s]?\s+video\s*\)/gi,
  /\(\s*lyric[s]?\s*\)/gi,
  /\(\s*audio\s*\)/gi,
  /\(\s*visuali[sz]er\s*\)/gi,
  /\(\s*music\s+video\s*\)/gi,
  /\(\s*mv\s*\)/gi,
  /\(\s*hd\s*\)/gi,
  /\(\s*4k\s*\)/gi,
  /\[\s*official\s+music\s+video\s*\]/gi,
  /\[\s*official\s+video\s*\]/gi,
  /\[\s*official\s+audio\s*\]/gi,
  /\[\s*lyric[s]?\s+video\s*\]/gi,
  /\[\s*lyric[s]?\s*\]/gi,
  /\[\s*audio\s*\]/gi,
  /\[\s*mv\s*\]/gi,
  /\[\s*hd\s*\]/gi,
  /\[\s*4k\s*\]/gi,
]

function stripTitleNoise(s: string): string {
  let out = s
  for (const re of YT_TITLE_NOISE) out = out.replace(re, '')
  return out.replace(/\s{2,}/g, ' ').trim()
}

function cleanChannelToArtist(channel: string): string {
  return (channel || '')
    .replace(/\s*-\s*Topic\s*$/i, '')
    .replace(/VEVO\s*$/i, '')
    .replace(/\s*official\s*$/i, '')
    .trim()
}

/**
 * Iš YouTube video title'o (+ kanalo) atskiria atlikėją ir dainos pavadinimą.
 * Tipiniai formatai:
 *   "Artist - Title (Official Video)"
 *   "Artist – Title [Official Audio]"
 *   "Artist «Title»" / "Title" (be brūkšnio → kanalas = atlikėjas)
 */
export function parseYtTitle(
  rawTitle: string,
  channel: string
): { artist: string; title: string } {
  // Normalizuojam įvairius brūkšnius į " - "
  const normalized = (rawTitle || '')
    .replace(/\s[–—-]\s/g, ' - ')
    .trim()

  const dashIdx = normalized.indexOf(' - ')
  let artist = ''
  let title = ''

  if (dashIdx > 0) {
    artist = normalized.slice(0, dashIdx).trim()
    title = normalized.slice(dashIdx + 3).trim()
  } else {
    // Be brūkšnio — kanalas (be VEVO/Topic) = atlikėjas, visas title'as = daina
    artist = cleanChannelToArtist(channel)
    title = normalized
  }

  // Nuvalom triukšmą iš pavadinimo
  title = stripTitleNoise(title)
  // Kabutės aplink pavadinimą
  title = title.replace(/^["'«»""'']+|["'«»""'']+$/g, '').trim()

  // Atlikėjo valymas
  artist = cleanChannelToArtist(artist)
  artist = artist.replace(/^["'«»""'']+|["'«»""'']+$/g, '').trim()

  // Jei title tuščias po valymo — fallback į pilną normalized
  if (!title) title = stripTitleNoise(normalized)
  // Jei artist tuščias — fallback į kanalą
  if (!artist) artist = cleanChannelToArtist(channel)

  return { artist, title }
}

// ────────────────────────────────────────────────────────────────────────────
// Atlikėjo resolve / create
// ────────────────────────────────────────────────────────────────────────────

/**
 * Suranda atlikėją pagal slug arba name (ilike). Jei neranda — sukuria minimalų.
 * `enrich` parametras (tik album flow): jei sukurtas naujas atlikėjas, papildo
 * jį duomenimis iš jo Wikipedia page'o (šalis/žanrai/biografija/aktyvumas).
 */
async function resolveArtist(
  supabase: ReturnType<typeof createAdminClient>,
  rawName: string,
  opts: { enrichFromWikiTitle?: string | null } = {}
): Promise<QuickAddArtist | null> {
  const name = wiki.cleanArtistName(rawName || '')
  if (!name || name.length < 2 || !wiki.isValidArtistName(name)) return null

  const slug = slugify(name)

  // 1) slug match
  const bySlug = await supabase
    .from('artists').select('id, name, slug').eq('slug', slug).maybeSingle()
  if (bySlug.data) {
    const a: any = bySlug.data
    return { id: a.id, name: a.name, slug: a.slug, created: false }
  }
  // 2) name ilike match
  const byName = await supabase
    .from('artists').select('id, name, slug').ilike('name', name).maybeSingle()
  if (byName.data) {
    const a: any = byName.data
    return { id: a.id, name: a.name, slug: a.slug, created: false }
  }

  // 3) Sukuriam naują. Bandom light enrichment iš atlikėjo Wiki page'o.
  let country = 'Lietuva'
  let description: string | null = null
  let activeFrom: number | null = null
  let artistType: 'solo' | 'group' = 'solo'
  let substyleNames: string[] = []

  if (opts.enrichFromWikiTitle) {
    try {
      const meta = await fetchArtistWikiMeta(opts.enrichFromWikiTitle)
      if (meta) {
        if (meta.country) country = meta.country
        if (meta.description) description = meta.description
        if (meta.activeFrom) activeFrom = meta.activeFrom
        if (meta.isGroup) artistType = 'group'
        if (meta.substyleNames?.length) substyleNames = meta.substyleNames
      }
    } catch {
      // Enrichment best-effort — nesvarbu jei nepavyko
    }
  }

  // Unikalus slug
  let finalSlug = slug
  const exSlug = await supabase.from('artists').select('id').eq('slug', finalSlug).maybeSingle()
  if (exSlug.data) finalSlug = `${slug}-${Date.now().toString(36)}`

  const insertPayload: Record<string, any> = {
    name,
    slug: finalSlug,
    type: artistType,
    type_music: true,
    country,
    description,
    active_from: activeFrom,
    source: 'wikipedia',
  }

  const { data: created, error } = await supabase
    .from('artists').insert(insertPayload).select('id, name, slug').single()
  if (error || !created) return null
  const a: any = created

  // Žanrai (substyles) sukurtam atlikėjui — best-effort
  if (substyleNames.length) {
    try {
      for (const sName of substyleNames.slice(0, 6)) {
        const trimmed = sName.trim()
        if (!trimmed) continue
        let styleRow = (await supabase.from('substyles').select('id').eq('name', trimmed).maybeSingle()).data as any
        if (!styleRow) {
          const ns = (await supabase.from('substyles').insert({ name: trimmed, slug: slugify(trimmed) }).select('id').single()).data as any
          styleRow = ns
        }
        if (styleRow?.id) {
          await supabase.from('artist_substyles').insert({ artist_id: a.id, substyle_id: styleRow.id })
        }
      }
    } catch { /* ignore */ }
  }

  return { id: a.id, name: a.name, slug: a.slug, created: true }
}

// ────────────────────────────────────────────────────────────────────────────
// Wikipedia helper'iai
// ────────────────────────────────────────────────────────────────────────────

/** Iš wiki URL ištraukia page title ("...wiki/Some_Album" → "Some_Album"). */
export function wikiTitleFromUrl(url: string): string | null {
  const m = (url || '').match(/wikipedia\.org\/wiki\/([^?#]+)/)
  if (!m) return null
  try {
    return decodeURIComponent(m[1])
  } catch {
    return m[1]
  }
}

async function fetchWikitext(title: string): Promise<string> {
  const api = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*&redirects=1`
  const res = await fetch(api, { signal: AbortSignal.timeout(15000) })
  const json = await res.json()
  const pages = json?.query?.pages || {}
  const first: any = Object.values(pages)[0]
  return first?.revisions?.[0]?.slots?.main?.['*'] || ''
}

async function fetchCoverImage(title: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&pithumbsize=600&piprop=thumbnail&format=json&origin=*`,
      { signal: AbortSignal.timeout(10000) }
    )
    const j = await r.json()
    const pages = j?.query?.pages || {}
    const first: any = Object.values(pages)[0]
    return first?.thumbnail?.source || null
  } catch {
    return null
  }
}

type ArtistWikiMeta = {
  country: string | null
  description: string | null
  activeFrom: number | null
  isGroup: boolean
  substyleNames: string[]
}

/** Light enrichment: paima atlikėjo Wiki page'ą ir ištraukia bazinius laukus. */
async function fetchArtistWikiMeta(artistWikiTitle: string): Promise<ArtistWikiMeta | null> {
  ensureWikiInit()
  const wikitext = await fetchWikitext(artistWikiTitle)
  if (!wikitext) return null

  const country = wiki.findCountry(wikitext) || null

  // Aktyvumas
  let activeFrom: number | null = null
  try {
    const ya = wiki.extractFieldNested(wikitext, 'years_active') || wiki.extractFieldNested(wikitext, 'active')
    if (ya) {
      const parsed = wiki.parseYearsActive(ya)
      const yf = parseInt(parsed.yearStart, 10)
      if (Number.isFinite(yf)) activeFrom = yf
    }
  } catch { /* ignore */ }

  // Žanrai
  let substyleNames: string[] = []
  try {
    const g = wiki.parseInfoboxGenres(wikitext)
    if (g?.length) {
      const mapped = wiki.mapGenres(g)
      substyleNames = mapped.substyles || []
    }
  } catch { /* ignore */ }

  // Group ar solo — paprasta heuristika
  const isGroup = /\bis\s+an?\s+[^.\n]{0,40}\b(band|group|duo|trio|quartet|ensemble)\b/i.test(wikitext)
    || /\{\{Infobox musical artist/i.test(wikitext) && /\|\s*background\s*=\s*group_or_band/i.test(wikitext)

  // Trumpas aprašymas — pirmas sakinys (cleanWikiText)
  let description: string | null = null
  try {
    const firstPara = wikitext
      .split('\n')
      .find((l) => l.trim().length > 60 && !l.trim().startsWith('{') && !l.trim().startsWith('|') && !l.trim().startsWith('=') && !l.trim().startsWith('['))
    if (firstPara) description = wiki.cleanWikiText(firstPara).slice(0, 600) || null
  } catch { /* ignore */ }

  return { country, description, activeFrom, isGroup, substyleNames }
}

/** Album release date iš wikitext'o (regex aprėpia dažniausius {{...}} formatus). */
function parseAlbumReleaseDate(wikitext: string): { year: number | null; month: number | null; day: number | null } {
  const MONTHS: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  }
  const s1 = wikitext.match(/\{\{[Ss]tart\s*date(?:\s*and\s*age)?\s*\|(?:df\s*=\s*(?:yes|no)\s*\|)?(\d{4})\|?(\d{1,2})?\|?(\d{1,2})?/)
  if (s1) return { year: +s1[1], month: s1[2] ? +s1[2] : null, day: s1[3] ? +s1[3] : null }
  const rd1 = wikitext.match(/\{\{[Rr]elease\s*date(?:\s*and\s*age)?\s*\|(?:df\s*=\s*(?:yes|no)\s*\|)?(\d{4})\|(\d{1,2})\|(\d{1,2})/)
  if (rd1) return { year: +rd1[1], month: +rd1[2], day: +rd1[3] }
  const iso = wikitext.match(/\|\s*released\s*=\s*(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return { year: +iso[1], month: +iso[2], day: +iso[3] }
  const uk = wikitext.match(/\|\s*released\s*=\s*[^|{[\n]*?(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i)
  if (uk) return { year: +uk[3], month: MONTHS[uk[2].toLowerCase()] || null, day: +uk[1] }
  const us = wikitext.match(/\|\s*released\s*=\s*[^|{[\n]*?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})/i)
  if (us) return { year: +us[3], month: MONTHS[us[1].toLowerCase()] || null, day: +us[2] }
  const y = wikitext.match(/\|\s*released\s*=\s*.*?(\d{4})/)
  if (y) return { year: +y[1], month: null, day: null }
  return { year: null, month: null, day: null }
}

/** Albumo tipo flag'ai iš wiki `| type =` lauko. Default — studio. */
function albumTypeFlags(wikitext: string): Partial<AlbumFull> {
  const typeRaw = (wikitext.match(/\|\s*type\s*=\s*([^\n|]+)/i)?.[1] || '').toLowerCase()
  const flags: Partial<AlbumFull> = {
    type_studio: false, type_compilation: false, type_ep: false, type_single: false,
    type_live: false, type_remix: false, type_covers: false, type_holiday: false,
    type_soundtrack: false, type_demo: false,
  }
  if (/compilation/.test(typeRaw)) flags.type_compilation = true
  else if (/\bep\b/.test(typeRaw)) flags.type_ep = true
  else if (/single/.test(typeRaw)) flags.type_single = true
  else if (/live/.test(typeRaw)) flags.type_live = true
  else if (/remix/.test(typeRaw)) flags.type_remix = true
  else if (/cover/.test(typeRaw)) flags.type_covers = true
  else if (/soundtrack/.test(typeRaw)) flags.type_soundtrack = true
  else if (/demo/.test(typeRaw)) flags.type_demo = true
  else flags.type_studio = true
  return flags
}

// ────────────────────────────────────────────────────────────────────────────
// quickAddTrack
// ────────────────────────────────────────────────────────────────────────────

export async function quickAddTrack(url: string, origin: string): Promise<QuickAddResult> {
  const supabase = createAdminClient()
  const warnings: string[] = []

  const videoId = extractVideoIdFromUrl(url)
  if (!videoId) return { ok: false, kind: 'track', error: 'Neatpažinta YouTube nuoroda' }

  const details = await getVideoDetails(videoId)
  if (!details) return { ok: false, kind: 'track', error: 'Nepavyko gauti YouTube video duomenų' }

  // oEmbed: vienu šūviu gaunam author_name (kanalą) + embeddability.
  // (getVideoDetails grąžina tik channelId, ne kanalo vardą — author_name
  //  reikalingas kaip atlikėjo fallback'as title'ams be brūkšnio.)
  let channelName = ''
  let embeddable: boolean | null = null
  try {
    const oe = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { signal: AbortSignal.timeout(5000) }
    )
    embeddable = oe.ok
    if (oe.ok) {
      const oj = await oe.json().catch(() => null)
      if (oj?.author_name) channelName = String(oj.author_name)
    } else {
      warnings.push('YouTube video gali būti blokuojamas embed\'ams (VEVO/region) — patikrink grotuvą.')
    }
  } catch {
    embeddable = null
  }

  const { artist: artistName, title } = parseYtTitle(details.title || '', channelName)
  if (!title) return { ok: false, kind: 'track', error: 'Nepavyko atskirti dainos pavadinimo iš video' }
  if (!artistName) return { ok: false, kind: 'track', error: 'Nepavyko atskirti atlikėjo iš video' }

  const artist = await resolveArtist(supabase, artistName)
  if (!artist) return { ok: false, kind: 'track', error: `Nepavyko priskirti/sukurti atlikėjo: „${artistName}"` }
  if (artist.created) warnings.push(`Sukurtas naujas atlikėjas „${artist.name}" (papildyk info rankiniu būdu).`)

  // Įkėlimo data → release date
  let ry: number | null = null, rm: number | null = null, rd: number | null = null
  if (details.uploadedAt) {
    const d = new Date(details.uploadedAt)
    if (!isNaN(d.getTime())) {
      ry = d.getUTCFullYear(); rm = d.getUTCMonth() + 1; rd = d.getUTCDate()
    }
  } else {
    warnings.push('YouTube neturėjo įkėlimo datos — išleidimo diena nenustatyta.')
  }

  // Duplicate guard
  const { data: existingTrack } = await supabase
    .from('tracks').select('id, title, slug').eq('artist_id', artist.id).ilike('title', title).maybeSingle()

  let trackId: number
  let trackSlug: string | null = null
  if (existingTrack) {
    trackId = (existingTrack as any).id
    trackSlug = (existingTrack as any).slug
    warnings.push('Tokia daina jau egzistavo — papildyta (ne dublikatas).')
    const upd: Record<string, any> = {
      video_url: `https://www.youtube.com/watch?v=${videoId}`,
      video_embeddable: embeddable,
      video_uploaded_at: details.uploadedAt || null,
    }
    if (ry) { upd.release_year = ry; upd.release_month = rm; upd.release_day = rd; upd.release_date = `${ry}-${String(rm || 1).padStart(2, '0')}-${String(rd || 1).padStart(2, '0')}` }
    await supabase.from('tracks').update(upd).eq('id', trackId)
  } else {
    // Unikalus slug
    const base = slugify(title) || `track-${Date.now()}`
    let finalSlug = base
    for (let i = 0; i < 50; i++) {
      const ex = await supabase.from('tracks').select('id').eq('slug', finalSlug).maybeSingle()
      if (!ex.data) break
      finalSlug = `${base}-${i + 1}`
    }
    const insertBody: Record<string, any> = {
      title,
      slug: finalSlug,
      artist_id: artist.id,
      video_url: `https://www.youtube.com/watch?v=${videoId}`,
      video_embeddable: embeddable,
      video_uploaded_at: details.uploadedAt || null,
    }
    if (ry) {
      insertBody.release_year = ry; insertBody.release_month = rm; insertBody.release_day = rd
      insertBody.release_date = `${ry}-${String(rm || 1).padStart(2, '0')}-${String(rd || 1).padStart(2, '0')}`
    }
    const { data: created, error: insErr } = await supabase
      .from('tracks').insert(insertBody).select('id, slug').single()
    if (insErr || !created) return { ok: false, kind: 'track', error: `Track create failed: ${insErr?.message}` }
    trackId = (created as any).id
    trackSlug = (created as any).slug
  }

  // Enrich: video_views (+ uždeda video_uploaded_at jei dar nebuvo)
  let views: number | null = details.viewCount ?? null
  try {
    const er = await enrichTrack(trackId, true)
    if (er.ok && er.viewsAfter != null) views = er.viewsAfter
  } catch (e: any) {
    warnings.push(`YT stats enrich klaida: ${String(e?.message || e).slice(0, 100)}`)
  }

  // Lyrics (LRCLib per esamą route)
  let lyricsFound = false
  try {
    const lr = await fetch(`${origin}/api/search/lyrics?artist=${encodeURIComponent(artist.name)}&title=${encodeURIComponent(title)}`, { signal: AbortSignal.timeout(12000) })
    if (lr.ok) {
      const lj = await lr.json()
      if (lj?.lyrics) {
        await supabase.from('tracks').update({ lyrics: lj.lyrics }).eq('id', trackId)
        lyricsFound = true
      }
    }
  } catch { /* ignore */ }

  // Spotify (per esamą route)
  let spotifyFound = false
  try {
    const sr = await fetch(`${origin}/api/search/spotify?q=${encodeURIComponent(`${artist.name} ${title}`)}`, { signal: AbortSignal.timeout(12000) })
    if (sr.ok) {
      const sj = await sr.json()
      const best = (sj?.results || [])[0]
      if (best?.id) {
        await supabase.from('tracks').update({ spotify_id: best.id }).eq('id', trackId)
        spotifyFound = true
      }
    }
  } catch { /* ignore */ }

  return {
    ok: true,
    kind: 'track',
    track: { id: trackId, title, slug: trackSlug },
    artist,
    detail: {
      video_id: videoId,
      upload_date: details.uploadedAt || null,
      views,
      embeddable,
      lyrics_found: lyricsFound,
      spotify_found: spotifyFound,
    },
    warnings,
  }
}

// ────────────────────────────────────────────────────────────────────────────
// quickAddAlbum
// ────────────────────────────────────────────────────────────────────────────

export async function quickAddAlbum(url: string): Promise<QuickAddResult> {
  ensureWikiInit()
  const supabase = createAdminClient()
  const warnings: string[] = []

  const pageTitle = wikiTitleFromUrl(url)
  if (!pageTitle) return { ok: false, kind: 'album', error: 'Neatpažinta Wikipedia nuoroda' }

  const wikitext = await fetchWikitext(pageTitle)
  if (!wikitext) return { ok: false, kind: 'album', error: 'Nepavyko gauti Wikipedia turinio' }

  // Atlikėjas iš infobox `| artist =`
  const artistRaw = wiki.extractFieldNested(wikitext, 'artist')
  if (!artistRaw) return { ok: false, kind: 'album', error: 'Wikipedia puslapyje nerastas albumo atlikėjas (| artist =). Ar tai tikrai albumo puslapis?' }

  // Atlikėjo Wiki page title (iš [[...]] wikilink'o) — light enrichment'ui
  const linkM = artistRaw.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/)
  const artistWikiTitle = linkM ? linkM[1].trim() : null
  const artistName = wiki.cleanArtistName(artistRaw)

  const artist = await resolveArtist(supabase, artistName, { enrichFromWikiTitle: artistWikiTitle })
  if (!artist) return { ok: false, kind: 'album', error: `Nepavyko priskirti/sukurti atlikėjo: „${artistName}"` }
  if (artist.created) warnings.push(`Sukurtas naujas atlikėjas „${artist.name}" (info iš Wikipedia, prireikus papildyk).`)

  // Albumo pavadinimas — infobox `| name =` arba page title (be skliaustų)
  const nameRaw = wiki.extractFieldNested(wikitext, 'name')
  let albumTitle = (nameRaw ? wiki.cleanWikiText(nameRaw) : '').trim()
  if (!albumTitle) albumTitle = pageTitle.replace(/_/g, ' ').replace(/\s*\([^)]*\)\s*$/, '').trim()
  if (!albumTitle) return { ok: false, kind: 'album', error: 'Nepavyko nustatyti albumo pavadinimo' }

  // Release date
  const date = parseAlbumReleaseDate(wikitext)
  // Tipo flag'ai
  const typeFlags = albumTypeFlags(wikitext)
  // Cover
  const cover = await fetchCoverImage(pageTitle)
  if (!cover) warnings.push('Nerastas albumo viršelis.')

  // Žanrai
  let substyleNames: string[] = []
  try {
    substyleNames = wiki.parseAlbumGenres(wikitext) || []
  } catch { /* ignore */ }

  // Tracklist
  let trackEntries: wiki.TrackEntry[] = []
  try {
    trackEntries = wiki.parseTracklist(wikitext) || []
  } catch (e: any) {
    warnings.push(`Tracklist parse klaida: ${String(e?.message || e).slice(0, 100)}`)
  }
  if (!trackEntries.length) warnings.push('Wikipedia puslapyje nerastas tracklist\'as — albumas sukurtas be dainų.')

  const tracks: TrackInAlbum[] = trackEntries.map((t, i) => ({
    title: t.title,
    sort_order: t.sort_order ?? i + 1,
    disc_number: t.disc_number ?? 1,
    duration: t.duration,
    type: (t.type === 'covers' ? 'normal' : (t.type as any)) || 'normal',
    is_single: t.is_single ?? false,
    featuring: t.featuring,
    // Singles datos iš parser'io; non-singles fallback į albumo metus
    release_year: t.release_year ?? date.year ?? null,
    release_month: t.release_month ?? null,
    release_day: t.release_day ?? null,
  }))

  const albumData: AlbumFull = {
    title: albumTitle,
    artist_id: artist.id,
    year: date.year,
    month: date.month,
    day: date.day,
    type_studio: typeFlags.type_studio ?? true,
    type_compilation: typeFlags.type_compilation ?? false,
    type_ep: typeFlags.type_ep ?? false,
    type_single: typeFlags.type_single ?? false,
    type_live: typeFlags.type_live ?? false,
    type_remix: typeFlags.type_remix ?? false,
    type_covers: typeFlags.type_covers ?? false,
    type_holiday: typeFlags.type_holiday ?? false,
    type_soundtrack: typeFlags.type_soundtrack ?? false,
    type_demo: typeFlags.type_demo ?? false,
    cover_image_url: cover || undefined,
    substyle_names: substyleNames,
    tracks,
  }

  let albumId: number
  try {
    albumId = await createAlbum(albumData)
  } catch (e: any) {
    return { ok: false, kind: 'album', error: `Album create failed: ${String(e?.message || e).slice(0, 200)}` }
  }

  return {
    ok: true,
    kind: 'album',
    album: { id: albumId, title: albumTitle },
    artist,
    detail: {
      year: date.year,
      track_count: tracks.length,
      cover_found: !!cover,
      genres: substyleNames,
    },
    warnings,
  }
}
