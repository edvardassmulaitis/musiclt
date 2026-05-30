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
import { syncTrackFeaturing } from '@/lib/featuring-utils'

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
        featuring: string[]
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

// Preview (žingsnis prieš commit) — admin gali pataisyti laukus.
export type TrackPreview = {
  kind: 'track'
  url: string
  video_id: string | null
  channel: string
  title: string
  artist_name: string
  artist_exists: boolean
  featuring: string[]
  release_year: number | null
  release_month: number | null
  release_day: number | null
  embeddable: boolean | null
  views: number | null
}

export type AlbumPreview = {
  kind: 'album'
  url: string
  artist_name: string
  artist_exists: boolean
  album_title: string
  year: number | null
  month: number | null
  day: number | null
  genres: string[]
  track_titles: string[]
  cover_found: boolean
}

export type PreviewResult =
  | { ok: true; preview: TrackPreview | AlbumPreview }
  | { ok: false; kind: 'track' | 'album' | 'unknown'; error: string }

export type TrackOverrides = {
  title?: string
  artist_name?: string
  featuring?: string[]
  release_year?: number | null
  release_month?: number | null
  release_day?: number | null
}

export type AlbumOverrides = {
  artist_name?: string
  album_title?: string
  year?: number | null
  month?: number | null
  day?: number | null
}

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

/** Tik paieška (be kūrimo) — pagal slug arba name ilike. */
async function matchExistingArtist(
  supabase: ReturnType<typeof createAdminClient>,
  rawName: string
): Promise<QuickAddArtist | null> {
  const name = wiki.cleanArtistName(rawName || '')
  if (!name || name.length < 2) return null
  const slug = slugify(name)
  const bySlug = await supabase
    .from('artists').select('id, name, slug').eq('slug', slug).maybeSingle()
  if (bySlug.data) {
    const a: any = bySlug.data
    return { id: a.id, name: a.name, slug: a.slug, created: false }
  }
  const byName = await supabase
    .from('artists').select('id, name, slug').ilike('name', name).maybeSingle()
  if (byName.data) {
    const a: any = byName.data
    return { id: a.id, name: a.name, slug: a.slug, created: false }
  }
  return null
}

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

  // 1+2) esamo atlikėjo paieška
  const existing = await matchExistingArtist(supabase, name)
  if (existing) return existing

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
// Kolaboracijų atpažinimas (atlikėjų segmentas → primary + featuring)
// ────────────────────────────────────────────────────────────────────────────

// Stiprūs (vienareikšmiai) kolab. skirtukai — feat/ft/featuring/vs/x/×/✕.
// „x" tik kaip atskiras žodis tarp tarpų (kad nesuskaldytų „Maxx").
const STRONG_SEP = /\s+(?:feat\.?|ft\.?|featuring|vs\.?|x|×|✕)\s+/i
// Silpni (dviprasmiški) skirtukai — &, „,", +, „with". Daug grupių vardų juos
// turi (Simon & Garfunkel, Earth, Wind & Fire), todėl naudojami TIK kai bent
// 2 dalys atitinka jau egzistuojančius atlikėjus.
const WEAK_SEP = /\s*(?:&|,|\+|\swith\s)\s*/i

function splitArtistSegment(segment: string): { parts: string[]; strong: boolean } {
  if (STRONG_SEP.test(segment)) {
    const parts = segment.split(STRONG_SEP).map((s) => s.trim()).filter(Boolean)
    if (parts.length >= 2) return { parts, strong: true }
  }
  if (WEAK_SEP.test(segment)) {
    const parts = segment.split(WEAK_SEP).map((s) => s.trim()).filter(Boolean)
    if (parts.length >= 2) return { parts, strong: false }
  }
  return { parts: [segment.trim()], strong: true }
}

/**
 * Atlikėjų segmentą (pvz „AKLI x MĖLYNA") paverčia į primary atlikėją +
 * featuring vardų sąrašą. Logika:
 *   1) jei VISAS segmentas atitinka egzistuojantį atlikėją → naudojam jį
 *      (apsaugo „Simon & Garfunkel" tipo registruotus vardus).
 *   2) skaidom pagal skirtukus. Stiprūs (x/feat/vs) → visada kolaboracija;
 *      silpni (&/,/with) → kolaboracija TIK jei ≥2 dalys atitinka esamus.
 *   3) primary = pirma dalis (match arba sukuriam), likusios → featuring.
 *      NIEKADA nesukuriam sujungto „A x B" atlikėjo.
 */
async function resolveTrackArtists(
  supabase: ReturnType<typeof createAdminClient>,
  segment: string
): Promise<{ primary: QuickAddArtist; featuringNames: string[] } | null> {
  const seg = (segment || '').trim()
  if (!seg) return null

  // 1) visas segmentas kaip vienas (registruotas) atlikėjas
  const whole = await matchExistingArtist(supabase, seg)
  if (whole) return { primary: whole, featuringNames: [] }

  // 2) skaidymas
  const { parts, strong } = splitArtistSegment(seg)
  if (parts.length < 2) {
    const primary = await resolveArtist(supabase, seg)
    return primary ? { primary, featuringNames: [] } : null
  }

  // Patikrinam kiek dalių atitinka esamus atlikėjus
  const matched = await Promise.all(parts.map((p) => matchExistingArtist(supabase, p)))
  const matchedCount = matched.filter(Boolean).length

  if (strong || matchedCount >= 2) {
    // Kolaboracija — primary = pirma dalis
    const primary = matched[0] || (await resolveArtist(supabase, parts[0]))
    if (!primary) return null
    const featuringNames = parts.slice(1)
    return { primary, featuringNames }
  }

  // Silpnas skirtukas, per mažai atitikmenų → traktuojam kaip vieną atlikėją
  const primary = await resolveArtist(supabase, seg)
  return primary ? { primary, featuringNames: [] } : null
}

/**
 * Read-only variantas (preview'ui): grąžina kas BŪTŲ primary atlikėjas +
 * featuring vardai, NIEKO nesukurdamas. primaryMatch != null jei jau egzistuoja.
 */
async function analyzeArtistSegment(
  supabase: ReturnType<typeof createAdminClient>,
  segment: string
): Promise<{ primaryName: string; primaryMatch: QuickAddArtist | null; featuringNames: string[] }> {
  const seg = (segment || '').trim()
  const whole = await matchExistingArtist(supabase, seg)
  if (whole) return { primaryName: whole.name, primaryMatch: whole, featuringNames: [] }

  const { parts, strong } = splitArtistSegment(seg)
  if (parts.length < 2) {
    const m = await matchExistingArtist(supabase, seg)
    return { primaryName: wiki.cleanArtistName(seg), primaryMatch: m, featuringNames: [] }
  }
  const matched = await Promise.all(parts.map((p) => matchExistingArtist(supabase, p)))
  if (strong || matched.filter(Boolean).length >= 2) {
    return {
      primaryName: matched[0]?.name || wiki.cleanArtistName(parts[0]),
      primaryMatch: matched[0] || null,
      featuringNames: parts.slice(1).map((p) => wiki.cleanArtistName(p)).filter(Boolean),
    }
  }
  const m = await matchExistingArtist(supabase, seg)
  return { primaryName: wiki.cleanArtistName(seg), primaryMatch: m, featuringNames: [] }
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

/** Resolvina File:Name → tikslus failo URL (album cover'iams, kuriuos
 *  pageimages API praleidžia, nes jie non-free fair-use). */
async function resolveWikiFileUrl(fileName: string): Promise<string | null> {
  const clean = fileName.replace(/^\s*\[\[/, '').replace(/\]\]\s*$/, '').replace(/^File:/i, '').split('|')[0].trim()
  if (!clean) return null
  try {
    const r = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent('File:' + clean)}&prop=imageinfo&iiprop=url&iiurlwidth=600&format=json&origin=*`,
      { signal: AbortSignal.timeout(10000) }
    )
    const j = await r.json()
    const first: any = Object.values(j?.query?.pages || {})[0]
    return first?.imageinfo?.[0]?.thumburl || first?.imageinfo?.[0]?.url || null
  } catch {
    return null
  }
}

/** Albumo viršelis: REST summary (grąžina ir non-free infobox cover) →
 *  fallback į `| cover =` failą iš wikitext'o. Radus — rehost'ina į mūsų
 *  storage'ą per /api/fetch-image (kaip Wiki Disco importas). */
async function fetchAlbumCover(title: string, wikitext: string, origin: string): Promise<string | null> {
  let src: string | null = null

  // 1) REST summary — album cover'iai čia paprastai grąžinami
  try {
    const s = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { signal: AbortSignal.timeout(10000) }
    )
    if (s.ok) {
      const sj = await s.json()
      src = sj?.originalimage?.source || sj?.thumbnail?.source || null
    }
  } catch { /* ignore */ }

  // 2) Fallback — infobox `| cover =` failas
  if (!src) {
    const coverField = wiki.extractFieldNested(wikitext, 'cover') || wiki.extractFieldNested(wikitext, 'Cover')
    if (coverField) src = await resolveWikiFileUrl(coverField)
  }

  if (!src) return null

  // 3) Rehost į mūsų storage'ą (best-effort — nepavykus paliekam Wiki URL)
  try {
    const r = await fetch(`${origin}/api/fetch-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: src }),
      signal: AbortSignal.timeout(20000),
    })
    if (r.ok) {
      const d = await r.json()
      if (d?.url && !String(d.url).startsWith('data:')) return d.url
    }
  } catch { /* ignore */ }
  return src
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

type TrackContext = {
  videoId: string
  details: NonNullable<Awaited<ReturnType<typeof getVideoDetails>>>
  channelName: string
  embeddable: boolean | null
  artistSegment: string
  title: string
  titleFeats: string[]
  release: { year: number | null; month: number | null; day: number | null }
  warnings: string[]
}

/** Bendras YT konteksto fetch (preview + commit). Be DB rašymo. */
async function fetchTrackContext(url: string): Promise<TrackContext | { error: string }> {
  const videoId = extractVideoIdFromUrl(url)
  if (!videoId) return { error: 'Neatpažinta YouTube nuoroda' }
  const details = await getVideoDetails(videoId)
  if (!details) return { error: 'Nepavyko gauti YouTube video duomenų' }

  const warnings: string[] = []
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

  ensureWikiInit()
  const { artist: artistSegment, title: rawTitle } = parseYtTitle(details.title || '', channelName)
  const { cleanTitle, featuring: titleFeats } = wiki.parseFeaturing(rawTitle || '')
  const title = (cleanTitle || rawTitle || '').trim()

  let year: number | null = null, month: number | null = null, day: number | null = null
  if (details.uploadedAt) {
    const d = new Date(details.uploadedAt)
    if (!isNaN(d.getTime())) { year = d.getUTCFullYear(); month = d.getUTCMonth() + 1; day = d.getUTCDate() }
  } else {
    warnings.push('YouTube neturėjo įkėlimo datos — išleidimo diena nenustatyta.')
  }

  return {
    videoId, details, channelName, embeddable, artistSegment, title,
    titleFeats: titleFeats || [], release: { year, month, day }, warnings,
  }
}

/** Preview — parsina YT, NIEKO nesukuria. Admin gali pataisyti prieš commit. */
export async function previewTrack(url: string): Promise<PreviewResult> {
  const ctx = await fetchTrackContext(url)
  if ('error' in ctx) return { ok: false, kind: 'track', error: ctx.error }
  if (!ctx.title) return { ok: false, kind: 'track', error: 'Nepavyko atskirti dainos pavadinimo iš video' }
  if (!ctx.artistSegment) return { ok: false, kind: 'track', error: 'Nepavyko atskirti atlikėjo iš video' }

  const supabase = createAdminClient()
  const a = await analyzeArtistSegment(supabase, ctx.artistSegment)
  const featuring = Array.from(new Set([...a.featuringNames, ...ctx.titleFeats].map((n) => n.trim()).filter(Boolean)))

  return {
    ok: true,
    preview: {
      kind: 'track', url,
      video_id: ctx.videoId,
      channel: ctx.channelName,
      title: ctx.title,
      artist_name: a.primaryName,
      artist_exists: !!a.primaryMatch,
      featuring,
      release_year: ctx.release.year,
      release_month: ctx.release.month,
      release_day: ctx.release.day,
      embeddable: ctx.embeddable,
      views: ctx.details.viewCount ?? null,
    },
  }
}

/** Commit — sukuria dainą su (galimai pataisytomis) reikšmėmis + enrich. */
export async function commitTrack(url: string, origin: string, ov: TrackOverrides = {}): Promise<QuickAddResult> {
  const supabase = createAdminClient()
  const ctx = await fetchTrackContext(url)
  if ('error' in ctx) return { ok: false, kind: 'track', error: ctx.error }
  const warnings = [...ctx.warnings]

  const title = (ov.title ?? ctx.title ?? '').trim()
  if (!title) return { ok: false, kind: 'track', error: 'Trūksta dainos pavadinimo' }

  // Atlikėjas: admin nurodytas vardas turi prioritetą; kitaip analizuojam segmentą
  let primaryName = (ov.artist_name ?? '').trim()
  let featuringNames: string[]
  if (primaryName) {
    featuringNames = (ov.featuring || []).map((n) => n.trim()).filter(Boolean)
  } else {
    const a = await analyzeArtistSegment(supabase, ctx.artistSegment)
    primaryName = a.primaryName
    featuringNames = Array.from(new Set([...a.featuringNames, ...ctx.titleFeats]))
  }
  if (!primaryName) return { ok: false, kind: 'track', error: 'Trūksta atlikėjo' }

  const artist = await resolveArtist(supabase, primaryName)
  if (!artist) return { ok: false, kind: 'track', error: `Nepavyko priskirti/sukurti atlikėjo: „${primaryName}"` }
  if (artist.created) warnings.push(`Sukurtas naujas atlikėjas „${artist.name}" (papildyk info rankiniu būdu).`)

  featuringNames = Array.from(new Set(
    featuringNames.map((n) => n.trim()).filter((n) => n && slugify(n) !== artist.slug && wiki.cleanArtistName(n).toLowerCase() !== artist.name.toLowerCase())
  ))

  // Release date — override (jei perduotas) arba iš YT įkėlimo datos
  const ry = ov.release_year !== undefined ? ov.release_year : ctx.release.year
  const rm = ov.release_month !== undefined ? ov.release_month : ctx.release.month
  const rd = ov.release_day !== undefined ? ov.release_day : ctx.release.day
  const { videoId, embeddable, details } = ctx

  const applyDate = (b: Record<string, any>) => {
    if (ry) {
      b.release_year = ry; b.release_month = rm; b.release_day = rd
      b.release_date = `${ry}-${String(rm || 1).padStart(2, '0')}-${String(rd || 1).padStart(2, '0')}`
    }
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
      title,
      video_url: `https://www.youtube.com/watch?v=${videoId}`,
      video_embeddable: embeddable,
      video_uploaded_at: details.uploadedAt || null,
    }
    applyDate(upd)
    await supabase.from('tracks').update(upd).eq('id', trackId)
  } else {
    const base = slugify(title) || `track-${Date.now()}`
    let finalSlug = base
    for (let i = 0; i < 50; i++) {
      const ex = await supabase.from('tracks').select('id').eq('slug', finalSlug).maybeSingle()
      if (!ex.data) break
      finalSlug = `${base}-${i + 1}`
    }
    const insertBody: Record<string, any> = {
      title, slug: finalSlug, artist_id: artist.id,
      video_url: `https://www.youtube.com/watch?v=${videoId}`,
      video_embeddable: embeddable,
      video_uploaded_at: details.uploadedAt || null,
    }
    applyDate(insertBody)
    const { data: created, error: insErr } = await supabase
      .from('tracks').insert(insertBody).select('id, slug').single()
    if (insErr || !created) return { ok: false, kind: 'track', error: `Track create failed: ${insErr?.message}` }
    trackId = (created as any).id
    trackSlug = (created as any).slug
  }

  if (featuringNames.length) {
    try {
      const added = await syncTrackFeaturing(supabase, trackId, featuringNames)
      if (added > 0) warnings.push(`Kolaboracija: prisegti ${added} atlikėjai (${featuringNames.join(', ')}).`)
    } catch (e: any) {
      warnings.push(`Featuring susiejimas nepavyko: ${String(e?.message || e).slice(0, 80)}`)
    }
  }

  let views: number | null = details.viewCount ?? null
  try {
    const er = await enrichTrack(trackId, true)
    if (er.ok && er.viewsAfter != null) views = er.viewsAfter
  } catch (e: any) {
    warnings.push(`YT stats enrich klaida: ${String(e?.message || e).slice(0, 100)}`)
  }

  let lyricsFound = false
  try {
    const lr = await fetch(`${origin}/api/search/lyrics?artist=${encodeURIComponent(artist.name)}&title=${encodeURIComponent(title)}`, { signal: AbortSignal.timeout(12000) })
    if (lr.ok) {
      const lj = await lr.json()
      if (lj?.lyrics) { await supabase.from('tracks').update({ lyrics: lj.lyrics }).eq('id', trackId); lyricsFound = true }
    }
  } catch { /* ignore */ }

  let spotifyFound = false
  try {
    const sr = await fetch(`${origin}/api/search/spotify?q=${encodeURIComponent(`${artist.name} ${title}`)}`, { signal: AbortSignal.timeout(12000) })
    if (sr.ok) {
      const sj = await sr.json()
      const best = (sj?.results || [])[0]
      if (best?.id) { await supabase.from('tracks').update({ spotify_id: best.id }).eq('id', trackId); spotifyFound = true }
    }
  } catch { /* ignore */ }

  return {
    ok: true, kind: 'track',
    track: { id: trackId, title, slug: trackSlug },
    artist,
    detail: {
      video_id: videoId,
      upload_date: details.uploadedAt || null,
      views, embeddable,
      lyrics_found: lyricsFound,
      spotify_found: spotifyFound,
      featuring: featuringNames,
    },
    warnings,
  }
}

// ────────────────────────────────────────────────────────────────────────────
// quickAddAlbum
// ────────────────────────────────────────────────────────────────────────────

type AlbumWiki = {
  pageTitle: string
  wikitext: string
  artistName: string
  artistWikiTitle: string | null
  albumTitle: string
  date: { year: number | null; month: number | null; day: number | null }
  typeFlags: Partial<AlbumFull>
  substyleNames: string[]
  trackEntries: wiki.TrackEntry[]
  warnings: string[]
}

/** Bendras Wiki albumo parse (preview + commit). Be DB rašymo. */
async function fetchAlbumWiki(url: string): Promise<AlbumWiki | { error: string }> {
  ensureWikiInit()
  const pageTitle = wikiTitleFromUrl(url)
  if (!pageTitle) return { error: 'Neatpažinta Wikipedia nuoroda' }
  const wikitext = await fetchWikitext(pageTitle)
  if (!wikitext) return { error: 'Nepavyko gauti Wikipedia turinio' }

  const artistRaw = wiki.extractFieldNested(wikitext, 'artist')
  if (!artistRaw) return { error: 'Wikipedia puslapyje nerastas albumo atlikėjas (| artist =). Ar tai tikrai albumo puslapis?' }
  const linkM = artistRaw.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/)
  const artistWikiTitle = linkM ? linkM[1].trim() : null
  const artistName = wiki.cleanArtistName(artistRaw)

  const nameRaw = wiki.extractFieldNested(wikitext, 'name')
  let albumTitle = (nameRaw ? wiki.cleanWikiText(nameRaw) : '').trim()
  if (!albumTitle) albumTitle = pageTitle.replace(/_/g, ' ').replace(/\s*\([^)]*\)\s*$/, '').trim()
  if (!albumTitle) return { error: 'Nepavyko nustatyti albumo pavadinimo' }

  const date = parseAlbumReleaseDate(wikitext)
  const typeFlags = albumTypeFlags(wikitext)
  const warnings: string[] = []

  let substyleNames: string[] = []
  try { substyleNames = wiki.parseAlbumGenres(wikitext) || [] } catch { /* ignore */ }

  let trackEntries: wiki.TrackEntry[] = []
  try { trackEntries = wiki.parseTracklist(wikitext) || [] }
  catch (e: any) { warnings.push(`Tracklist parse klaida: ${String(e?.message || e).slice(0, 100)}`) }
  if (!trackEntries.length) warnings.push('Wikipedia puslapyje nerastas tracklist\'as.')

  return { pageTitle, wikitext, artistName, artistWikiTitle, albumTitle, date, typeFlags, substyleNames, trackEntries, warnings }
}

/** Preview — parsina Wiki albumą, NIEKO nesukuria. */
export async function previewAlbum(url: string): Promise<PreviewResult> {
  const w = await fetchAlbumWiki(url)
  if ('error' in w) return { ok: false, kind: 'album', error: w.error }
  const supabase = createAdminClient()
  const match = await matchExistingArtist(supabase, w.artistName)

  // Cover probe (be rehost'inimo — preview'ui užtenka žinoti ar yra)
  let coverFound = false
  try {
    const s = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(w.pageTitle)}`, { signal: AbortSignal.timeout(10000) })
    if (s.ok) { const sj = await s.json(); coverFound = !!(sj?.originalimage?.source || sj?.thumbnail?.source) }
  } catch { /* ignore */ }
  if (!coverFound) coverFound = !!(wiki.extractFieldNested(w.wikitext, 'cover') || wiki.extractFieldNested(w.wikitext, 'Cover'))

  return {
    ok: true,
    preview: {
      kind: 'album', url,
      artist_name: w.artistName,
      artist_exists: !!match,
      album_title: w.albumTitle,
      year: w.date.year, month: w.date.month, day: w.date.day,
      genres: w.substyleNames,
      track_titles: w.trackEntries.map((t) => t.title),
      cover_found: coverFound,
    },
  }
}

/** Commit — sukuria albumą su (galimai pataisytomis) reikšmėmis. */
export async function commitAlbum(url: string, origin: string, ov: AlbumOverrides = {}): Promise<QuickAddResult> {
  const w = await fetchAlbumWiki(url)
  if ('error' in w) return { ok: false, kind: 'album', error: w.error }
  const supabase = createAdminClient()
  const warnings = [...w.warnings]

  const artistName = (ov.artist_name ?? w.artistName).trim()
  // Wiki enrichment tik kai vardas nepakeistas (turim teisingą artist wiki title'ą)
  const artist = await resolveArtist(supabase, artistName, {
    enrichFromWikiTitle: artistName === w.artistName ? w.artistWikiTitle : null,
  })
  if (!artist) return { ok: false, kind: 'album', error: `Nepavyko priskirti/sukurti atlikėjo: „${artistName}"` }
  if (artist.created) warnings.push(`Sukurtas naujas atlikėjas „${artist.name}" (info iš Wikipedia, prireikus papildyk).`)

  const albumTitle = (ov.album_title ?? w.albumTitle).trim()
  if (!albumTitle) return { ok: false, kind: 'album', error: 'Trūksta albumo pavadinimo' }
  const year = ov.year !== undefined ? ov.year : w.date.year
  const month = ov.month !== undefined ? ov.month : w.date.month
  const day = ov.day !== undefined ? ov.day : w.date.day

  const cover = await fetchAlbumCover(w.pageTitle, w.wikitext, origin)
  if (!cover) warnings.push('Nerastas albumo viršelis.')

  const tracks: TrackInAlbum[] = w.trackEntries.map((t, i) => ({
    title: t.title,
    sort_order: t.sort_order ?? i + 1,
    disc_number: t.disc_number ?? 1,
    duration: t.duration,
    type: (t.type === 'covers' ? 'normal' : (t.type as any)) || 'normal',
    is_single: t.is_single ?? false,
    featuring: t.featuring,
    release_year: t.release_year ?? year ?? null,
    release_month: t.release_month ?? null,
    release_day: t.release_day ?? null,
  }))

  const tf = w.typeFlags
  const albumData: AlbumFull = {
    title: albumTitle, artist_id: artist.id, year, month, day,
    type_studio: tf.type_studio ?? true,
    type_compilation: tf.type_compilation ?? false,
    type_ep: tf.type_ep ?? false,
    type_single: tf.type_single ?? false,
    type_live: tf.type_live ?? false,
    type_remix: tf.type_remix ?? false,
    type_covers: tf.type_covers ?? false,
    type_holiday: tf.type_holiday ?? false,
    type_soundtrack: tf.type_soundtrack ?? false,
    type_demo: tf.type_demo ?? false,
    cover_image_url: cover || undefined,
    substyle_names: w.substyleNames,
    tracks,
  }

  let albumId: number
  try { albumId = await createAlbum(albumData) }
  catch (e: any) { return { ok: false, kind: 'album', error: `Album create failed: ${String(e?.message || e).slice(0, 200)}` } }

  return {
    ok: true, kind: 'album',
    album: { id: albumId, title: albumTitle },
    artist,
    detail: { year, track_count: tracks.length, cover_found: !!cover, genres: w.substyleNames },
    warnings,
  }
}
