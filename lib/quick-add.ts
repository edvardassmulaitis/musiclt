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
import type { AlbumSuggestion } from '@/lib/album-lookup'
import { fetchReleaseTracklist, fetchMbCoverUrl, msToDuration, isRecordingSingle } from '@/lib/musicbrainz'
import { normalizeTitle } from '@/lib/track-dedup'
import { fetchWikitext } from '@/lib/wiki-fetch'

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
        /** Užpildyta tik jei admin patvirtino (arba high-confidence auto)
         *  albumo pasiūlymą — žr. TrackOverrides.create_album. */
        album: { id: number; title: string } | null
        is_single: boolean
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
export type FeaturingPreview = { name: string; id: number | null; slug: string | null }

export type TrackPreview = {
  kind: 'track'
  url: string
  video_id: string | null
  channel: string
  title: string
  artist_name: string
  artist_exists: boolean
  artist_id: number | null
  artist_slug: string | null
  featuring: string[]
  featuring_resolved: FeaturingPreview[]
  release_year: number | null
  release_month: number | null
  release_day: number | null
  embeddable: boolean | null
  views: number | null
  /** MusicBrainz/Apple Music pasiūlymas — „ši daina priklauso albumui X"
   *  (žr. lib/album-lookup.ts). null = nieko nerasta arba tai tiesiog single'as. */
  suggested_album: AlbumSuggestion | null
}

export type AlbumPreview = {
  kind: 'album'
  url: string
  artist_name: string
  artist_exists: boolean
  artist_id: number | null
  artist_slug: string | null
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
  artist_id?: number | null
  featuring?: string[]
  release_year?: number | null
  release_month?: number | null
  release_day?: number | null
  /** Admin patvirtino preview'e siūlytą albumą ("taip pat pridėti albumą").
   *  Reikalauja album_mb_release_id (šiuo metu albumo auto-kūrimas palaikomas
   *  tik iš MusicBrainz šaltinio — Apple Music pasiūlymai lieka signalu be
   *  vieno-mygtuko create'o, nes jų tracklist'ai gali būti placeholder'iniai). */
  create_album?: boolean
  album_mb_release_id?: string | null
  /** Klientas jau gavo šitą per async /api/admin/quick-add/album-suggestion
   *  kvietimą (žr. lib/album-lookup.ts AlbumLookupResult.is_single) — čia tik
   *  perduodam, kad commitTrack() NEBEREIKĖTŲ pakartotinai kviesti MB/Apple
   *  (nedvigubina latency). PROMOTE-ONLY: true → pažymim; nepateikta/false →
   *  nieko nekeičiam (niekad nenuimam is_single, kaip ir album_tracks sync'e). */
  is_single?: boolean
}

export type AlbumOverrides = {
  artist_name?: string
  artist_id?: number | null
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

/** Sakinio raidžių registras (LT): visą tekstą į mažąsias, pirmą raidinį
 *  simbolį į didžiąją (praleidžiant kabutes/skliaustus pradžioje). LT-aware
 *  (toLocaleUpperCase/'lt'), kad „į"→„Į" suveiktų teisingai. */
function toSentenceCaseLt(s: string): string {
  const lower = (s || '').toLocaleLowerCase('lt-LT')
  return lower.replace(
    /^([^\p{L}\p{N}]*)(\p{L})/u,
    (_m, pre: string, ch: string) => pre + ch.toLocaleUpperCase('lt-LT'),
  )
}

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
  // Beprasmės versijų uodegos (NE remix'ai — tie prasmingi)
  /[([]\s*original\s+mix\s*[)\]]/gi,
  /[([]\s*extended\s+mix\s*[)\]]/gi,
  /[([]\s*radio\s+(?:edit|version|mix)\s*[)\]]/gi,
  /[([]\s*(?:album|single|original)\s+version\s*[)\]]/gi,
]

// Bendras „triukšmo" skliaustų šalinimas — bet koks (…) ar […] blokas, kuriame
// yra promo/formato raktažodis (official / video / audio / lyric / visualizer /
// mv / hd / hq / 4k / 8k / 1080p / 720p / remaster / clip / explicit). Pagauna
// KOMBINACIJAS, kurių fiksuotas sąrašas nepadengia, pvz. „(official 4k video)".
// NEšalinam „(Live)", „(Acoustic)", „(Remix)", „(feat. …)" — tie prasmingi.
const YT_TITLE_NOISE_GENERIC =
  /\s*[([]\s*[^)\]]*\b(?:official|video|audio|lyric|lyrics|visuali[sz]er|m\/?v|hd|hq|4k|8k|1080p|720p|remaster(?:ed)?|explicit|clip|colou?r(?:ized)?|full\s+stream)\b[^)\]]*[)\]]/gi

function stripTitleNoise(s: string): string {
  let out = s
  for (const re of YT_TITLE_NOISE) out = out.replace(re, '')
  out = out.replace(YT_TITLE_NOISE_GENERIC, '')
  return out.replace(/\s{2,}/g, ' ').trim()
}

/** Gražus pavadinimo case'as: kiekvieno žodžio pirma raidė didžioji, likusios
 *  mažosios. Paliekam: akronimus (visos DIDŽIOSIOS, ≤4 raidės — DNA, XO, MC) ir
 *  stilizuotus žodžius su vidinėm didžiosiom (iPhone, DJ). „Last goodbye" → „Last Goodbye". */
function smartTitleCase(s: string): string {
  if (!s) return s
  // Jei title mišrus (turi mažųjų) — akronimus/stilizaciją paliekam. Jei VISAS
  // DIDŽIOSIOMIS — case'inam viską („LAST GOODBYE" → „Last Goodbye").
  const hasLower = /[a-ząčęėįšųūž]/.test(s)
  return s.replace(/[^\s\-–—/()[\]]+/g, (word) => {
    if (hasLower) {
      if (/^[A-ZĄČĘĖĮŠŲŪŽ0-9]{1,4}$/.test(word)) return word            // akronimas
      if (/[a-ząčęėįšųūž][A-ZĄČĘĖĮŠŲŪŽ]/.test(word)) return word          // vidinė didžioji (stilizuota)
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  })
}

/** Nukerpa YouTube'e dažnus „papildomus užrašus" po skirtuko:
 *  „Title // Label/Crew", „Title | Album", „Title • prod. X", „Title ~ ...".
 *  Imam tik pirmą segmentą (tikrąjį dainos pavadinimą). */
function cutTitleExtras(s: string): string {
  let out = (s || '').trim()
  out = out.split(/\s*\/\/\s*/)[0]          // „// GOLD LITUANICA"
  out = out.split(/\s+[|•·~]\s+/)[0]        // „ | …", „ • …", „ ~ …"
  return out.trim()
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

  // Nukerpam papildomus užrašus po // | • ~, tada nuvalom triukšmą
  title = cutTitleExtras(title)
  title = stripTitleNoise(title)
  // Kabutės aplink pavadinimą
  title = title.replace(/^["'«»""'']+|["'«»""'']+$/g, '').trim()
  // Gražus case'as (Last goodbye → Last Goodbye)
  title = smartTitleCase(title)

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

/** Tikslus atlikėjas pagal ID (kai admin pickeriu pasirinko konkretų katalogo
 *  įrašą — nereikia spėlioti per name match). */
async function getArtistById(
  supabase: ReturnType<typeof createAdminClient>,
  id: number
): Promise<QuickAddArtist | null> {
  if (!id || !Number.isFinite(id)) return null
  const { data } = await supabase
    .from('artists').select('id, name, slug').eq('id', id).maybeSingle()
  if (!data) return null
  const a: any = data
  return { id: a.id, name: a.name, slug: a.slug, created: false }
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
  // Country/žanrai NEpriskiriami automatiškai — tik jei Wiki enrichment juos
  // pateikia. Kitaip lieka null (admin papildo rankiniu būdu). Spėliojimas
  // „Lietuva" buvo klaidingas užsienio atlikėjams iš topų.
  let country: string | null = null
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
  // details gali būti null, kai YT Data API kvota išnaudota IR InnerTube
  // fallback'ai nepavyko — tokiu atveju metaduomenis (title/kanalą) imame iš
  // oEmbed, o views/data užsipildys vėliau per enrich. Žr. fetchTrackContext.
  details: Awaited<ReturnType<typeof getVideoDetails>>
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

  const warnings: string[] = []

  // 1) oEmbed PIRMA — nemokamas ir iš Vercel'io patikimai pasiekiamas. Duoda
  //    video pavadinimą + kanalą + embeddable. Nuo šito priklauso atlikėjo/dainos
  //    atskyrimas, todėl tai svarbesnis šaltinis nei views (kuriuos galima
  //    užpildyti vėliau). 2026-06-18: anksčiau buvo kviečiamas PO getVideoDetails
  //    ir, kai Data API kvota išnaudota, getVideoDetails grąžindavo null → quick-add
  //    visai „neduodavo pridėti". Dabar oEmbed užtikrina, kad bent metaduomenis
  //    turim.
  let channelName = ''
  let embeddable: boolean | null = null
  let oembedTitle = ''
  try {
    const oe = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { signal: AbortSignal.timeout(5000) }
    )
    embeddable = oe.ok
    if (oe.ok) {
      const oj = await oe.json().catch(() => null)
      if (oj?.author_name) channelName = String(oj.author_name)
      if (oj?.title) oembedTitle = String(oj.title)
    } else {
      warnings.push('YouTube video gali būti blokuojamas embed\'ams (VEVO/region) — patikrink grotuvą.')
    }
  } catch {
    embeddable = null
  }

  // 2) getVideoDetails — views + įkėlimo data (+ title atsarginis). BEST-EFFORT:
  //    kai Data API kvota išnaudota, gali grįžti null. Tokiu atveju, jei oEmbed
  //    davė pavadinimą, vis tiek tęsiam — daina bus sukurta, o views/data
  //    užsipildys per vėlesnį enrich'ą.
  const details = await getVideoDetails(videoId)

  const rawVideoTitle = (details?.title || oembedTitle || '').trim()
  if (!rawVideoTitle) {
    return { error: 'Nepavyko gauti YouTube video duomenų (nei oEmbed, nei API). Pabandyk vėliau.' }
  }
  if (!details) {
    warnings.push('YouTube views/data laikinai nepasiekiami (galimai Data API kvota) — daina kuriama iš oEmbed; views užsipildys vėliau per enrich.')
  }

  ensureWikiInit()
  const { artist: artistSegment, title: rawTitle } = parseYtTitle(rawVideoTitle, channelName)
  const { cleanTitle, featuring: titleFeats } = wiki.parseFeaturing(rawTitle || '')
  // Dainos pavadinimas — SAKINIO raidžių registras (pirma raidė didžioji, kitos
  // mažosios), kaip LT konvencija dainoms. NE Title Case (kiekvienas žodis didžiąja
  // — tai angliška/Wiki albumų konvencija). Pvz. „ĮLINDO Į DŪŠLĄ"/„Įlindo Į Dūšlą"
  // → „Įlindo į dūšlą".
  const baseTitle = (cleanTitle || rawTitle || '').trim()
  const title = toSentenceCaseLt(baseTitle)

  let year: number | null = null, month: number | null = null, day: number | null = null
  if (details?.uploadedAt) {
    const d = new Date(details.uploadedAt)
    if (!isNaN(d.getTime())) { year = d.getUTCFullYear(); month = d.getUTCMonth() + 1; day = d.getUTCDate() }
  } else if (details) {
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

  // Featuring DB rezoliucija (preview badge'ams) — be kūrimo.
  const featuring_resolved: FeaturingPreview[] = await Promise.all(
    featuring.map(async (name): Promise<FeaturingPreview> => {
      const m = await matchExistingArtist(supabase, name)
      return { name: m?.name || name, id: m?.id ?? null, slug: m?.slug ?? null }
    })
  )

  // Albumo pasiūlymas (MusicBrainz → Apple Music) NEBEskaičiuojamas čia — buvo
  // per lėta (kelios sekvencinės išorinės užklausos laikydavo preview'ą).
  // Klientas iš karto po preview'o kviečia atskirą, async
  // /api/admin/quick-add/album-suggestion endpoint'ą — nebeblokuoja UI.
  const suggested_album: AlbumSuggestion | null = null

  return {
    ok: true,
    preview: {
      kind: 'track', url,
      video_id: ctx.videoId,
      channel: ctx.channelName,
      title: ctx.title,
      artist_name: a.primaryName,
      artist_exists: !!a.primaryMatch,
      artist_id: a.primaryMatch?.id ?? null,
      artist_slug: a.primaryMatch?.slug ?? null,
      featuring,
      featuring_resolved,
      release_year: ctx.release.year,
      release_month: ctx.release.month,
      release_day: ctx.release.day,
      embeddable: ctx.embeddable,
      views: ctx.details?.viewCount ?? null,
      suggested_album,
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

  // Atlikėjas: jei admin pickeriu pasirinko konkretų katalogo įrašą (artist_id),
  // naudojam jį tiesiai. Kitaip — admin nurodytas vardas, kitaip — segmentas.
  let primaryName = (ov.artist_name ?? '').trim()
  let featuringNames: string[]
  let artistMut: QuickAddArtist | null = null
  if (ov.artist_id) {
    artistMut = await getArtistById(supabase, Number(ov.artist_id))
    featuringNames = (ov.featuring || []).map((n) => n.trim()).filter(Boolean)
    if (artistMut) primaryName = artistMut.name
  } else if (primaryName) {
    featuringNames = (ov.featuring || []).map((n) => n.trim()).filter(Boolean)
  } else {
    const a = await analyzeArtistSegment(supabase, ctx.artistSegment)
    primaryName = a.primaryName
    featuringNames = Array.from(new Set([...a.featuringNames, ...ctx.titleFeats]))
  }
  if (!primaryName) return { ok: false, kind: 'track', error: 'Trūksta atlikėjo' }

  if (!artistMut) artistMut = await resolveArtist(supabase, primaryName)
  if (!artistMut) return { ok: false, kind: 'track', error: `Nepavyko priskirti/sukurti atlikėjo: „${primaryName}"` }
  // const → narrowing'as galioja ir uždarymuose (filter žemiau naudoja artist.slug)
  const artist = artistMut
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

  // Palyginamas skaičius YYYYMMDD stiliumi (trūkstamą mėn./dieną laikom „01",
  // t.y. metų pradžia — geriausias apytikslis, kai turim tik metus).
  const toDateComparable = (y?: number | null, m?: number | null, d?: number | null): number | null =>
    y ? y * 10000 + (m || 1) * 100 + (d || 1) : null

  /** applyDate variantas dedup (jau egzistuojančio track'o) atvejui: video gali
   *  būti senos dainos re-upload'as/remaster'is su VĖLESNE YT įkėlimo data nei
   *  tikroji išleidimo data (grupė perkelia seną klipą į naują kanalą ir pan.).
   *  Nauja data laimi TIK jei senos dar nėra ARBA nauja yra ANKSTESNĖ — niekad
   *  „nepajaunina" jau žinomos ankstesnės release datos. */
  const applyDateGuarded = (
    b: Record<string, any>,
    existing: { release_year: number | null; release_month: number | null; release_day: number | null }
  ) => {
    if (!ry) return
    const existingComparable = toDateComparable(existing.release_year, existing.release_month, existing.release_day)
    const newComparable = toDateComparable(ry, rm, rd)
    if (existingComparable !== null && newComparable !== null && newComparable >= existingComparable) {
      const fmt = (y: number | null, m: number | null, d: number | null) =>
        y ? `${y}-${String(m || 1).padStart(2, '0')}-${String(d || 1).padStart(2, '0')}` : '?'
      warnings.push(
        `Rastas naujesnis (ar toks pat) video įkėlimas (${fmt(ry, rm, rd)}) nei jau įrašyta išleidimo data ` +
        `(${fmt(existing.release_year, existing.release_month, existing.release_day)}) — palikta senesnė (tikėtina re-upload/remaster/naujas kanalas).`
      )
      return
    }
    applyDate(b)
  }

  // Duplicate guard — tas pats YouTube video NIEKADA neturi sukurti antro įrašo.
  // Anksčiau buvo TIK `ilike('title', title)` — case-insensitive, BET jautrus
  // punktuacijai/diakritikai: „Don't Break Her Heart" (tiesus apostrofas ') ir
  // „Don't break her heart" (garbanotas ' = U+2019) praeidavo kaip skirtingi
  // pavadinimai → dublikatas (nors video_url identiškas). Dabar tikrinam DVIEM
  // nepriklausomais signalais:
  //   (1) kanoninis video_url (statomas iš videoId — deterministinis; youtu.be/
  //       &list variantai jau susilieję į tą patį),
  //   (2) atlikėjas + normalizeTitle() (nuima diakritiką, skliaustus, punktuaciją,
  //       taip pat abu apostrofų variantus — abu → „don t break her heart").
  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`
  const normTitle = normalizeTitle(title)
  const { data: artistTracks } = await supabase
    .from('tracks')
    .select('id, title, slug, video_url, release_year, release_month, release_day')
    .eq('artist_id', artist.id)
    .limit(5000)
  const existingTrack =
    (artistTracks || []).find((t: any) => t.video_url && t.video_url === canonicalUrl) ||
    (normTitle ? (artistTracks || []).find((t: any) => normalizeTitle(t.title || '') === normTitle) : null) ||
    null

  // Jei ŠIAM atlikėjui dublikato nėra — vis tiek patikrinam, ar tas pats VIDEO
  // jau egzistuoja kataloge po KITU įrašu/atlikėju. Globalus URL unikalumas:
  // tas pats YouTube URL neturi praeiti niekaip.
  if (!existingTrack) {
    const { data: sameVideoElsewhere } = await supabase
      .from('tracks')
      .select('id, title, slug')
      .eq('video_url', canonicalUrl)
      .limit(1)
    const other = (sameVideoElsewhere || [])[0] as any
    if (other) {
      return {
        ok: false, kind: 'track',
        error: `Šis YouTube video jau priskirtas kitam katalogo įrašui (track #${other.id} „${other.title}") — dublikatas nesukurtas. Sujunk įrašus rankiniu būdu, jei reikia.`,
      }
    }
  }

  let trackId: number
  let trackSlug: string | null = null
  if (existingTrack) {
    trackId = (existingTrack as any).id
    trackSlug = (existingTrack as any).slug
    warnings.push('Tokia daina jau egzistavo — papildyta (ne dublikatas).')
    const upd: Record<string, any> = {
      video_url: `https://www.youtube.com/watch?v=${videoId}`,
      video_embeddable: embeddable,
      video_uploaded_at: details?.uploadedAt || null,
    }
    // Pavadinimo NEPERRAŠOM esamai dainai — DB pavadinimas autoritetingas (dažnai
    // švaresnis nei YouTube antraštė su „(official 4k video)" ir pan.). Keičiam
    // TIK jei admin eksplicitiškai pateikė override pavadinimą.
    if (typeof ov.title === 'string' && ov.title.trim()) upd.title = title
    if (ov.is_single) upd.is_single = true // promote-only, niekad nenuimam
    applyDateGuarded(upd, existingTrack as any)
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
      video_uploaded_at: details?.uploadedAt || null,
    }
    if (ov.is_single) insertBody.is_single = true
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

  let views: number | null = details?.viewCount ?? null
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

  // Albumas — TIK jei admin patvirtino preview'e siūlytą MusicBrainz albumą
  // (arba jį iš anksto pažymėjo, jei UI kada nors pridės auto-tick high
  // confidence atveju). Re-fetch'inam tracklist'ą commit metu (ne naudojam
  // preview'o snapshot'o), kad turėtume šviežiausius duomenis.
  let albumCreated: { id: number; title: string } | null = null
  if (ov.create_album && ov.album_mb_release_id) {
    try {
      albumCreated = await createAlbumFromMusicBrainz(ov.album_mb_release_id, artist.id, trackId, title)
      if (albumCreated) warnings.push(`Taip pat pridėtas albumas „${albumCreated.title}", kuriame yra ši daina.`)
      else warnings.push('Nepavyko atkurti albumo duomenų (MusicBrainz) commit metu — pridėta tik daina.')
    } catch (e: any) {
      warnings.push(`Albumo sukūrimas nepavyko: ${String(e?.message || e).slice(0, 120)}`)
    }
  }

  return {
    ok: true, kind: 'track',
    track: { id: trackId, title, slug: trackSlug },
    artist,
    detail: {
      video_id: videoId,
      upload_date: details?.uploadedAt || null,
      views, embeddable,
      lyrics_found: lyricsFound,
      spotify_found: spotifyFound,
      featuring: featuringNames,
      album: albumCreated,
      is_single: !!ov.is_single,
    },
    warnings,
  }
}

/** Sukuria albumą iš MusicBrainz release'o (re-fetch'ina pilną tracklist'ą
 *  pagal releaseId), susiedama jau egzistuojantį track'ą (matchedTrackId) su
 *  jo pozicija tracklist'e — kad NESUDUBLIUOTŲ kaip atskiras track'as.
 *
 * 2026-07-17 (Edvardo pastaba): anksčiau `is_single` gaudavo TIK pati
 * quick-add'inta daina (per `ov.is_single` viename track'e). Dabar
 * patikrinam VISUS albumo track'us per MB `isRecordingSingle()` (tikslus
 * recording ID lookup'as, ne tekstinė paieška) ir pažymim kiekvieną, kuris
 * turi savo atskirą "Single" release-group'ą — ne tik pirminę dainą. */
async function createAlbumFromMusicBrainz(
  releaseId: string, artistId: number, matchedTrackId: number, matchedTrackTitle: string
): Promise<{ id: number; title: string } | null> {
  const rel = await fetchReleaseTracklist(releaseId)
  if (!rel || !rel.tracks.length) return null

  const cover = await fetchMbCoverUrl(releaseId).catch(() => null)
  const wantNorm = normalizeTitle(matchedTrackTitle)

  // Kiekvienam track'ui (su recording ID) patikrinam ar jis atskirai buvo
  // išleistas kaip "Single" — throttled MB kvietimas per track'ą (žr.
  // mbThrottle musicbrainz.ts). Ribojam iki 30 track'ų (praktiškai jokia
  // albumo tracklist'a tiek neturi), kad nerizikuotume Vercel timeout'o.
  const MAX_SINGLE_CHECKS = 30
  const singleFlags = new Map<number, boolean>() // position → is_single
  for (const t of rel.tracks.slice(0, MAX_SINGLE_CHECKS)) {
    if (!t.recordingId) continue
    try {
      const isSingle = await isRecordingSingle(t.recordingId)
      if (isSingle) singleFlags.set(t.position, true)
    } catch { /* best-effort — nesulaikom albumo kūrimo */ }
  }

  const tracks: TrackInAlbum[] = rel.tracks.map((t) => ({
    title: t.title,
    sort_order: t.position,
    disc_number: t.discNumber,
    duration: msToDuration(t.length),
    type: 'normal',
    track_id: normalizeTitle(t.title) === wantNorm ? matchedTrackId : undefined,
    is_single: singleFlags.get(t.position) || undefined,
    release_year: rel.year, release_month: rel.month, release_day: rel.day,
  }))

  // Albumas gali būti dar TIK anonsuotas (MB release'as su ateities data, kaip
  // "Day and Night" 2026-09-18 testo atveju) — /albumai sąrašas filtruoja
  // `is_upcoming=false`, tad be šito flag'o būsimas albumas rodytųsi kaip jau
  // išleistas. Palyginam su šiandiena (release_date > now → upcoming).
  const releaseDate = rel.year
    ? new Date(Date.UTC(rel.year, (rel.month || 1) - 1, rel.day || 1))
    : null
  const isUpcoming = !!(releaseDate && releaseDate.getTime() > Date.now())

  const albumData: AlbumFull = {
    title: rel.title, artist_id: artistId,
    year: rel.year, month: rel.month, day: rel.day,
    type_studio: rel.primaryType !== 'EP', type_compilation: false,
    type_ep: rel.primaryType === 'EP', type_single: false,
    type_live: false, type_remix: false, type_covers: false,
    type_holiday: false, type_soundtrack: false, type_demo: false,
    cover_image_url: cover || undefined,
    source: 'musicbrainz',
    is_upcoming: isUpcoming,
    tracks,
  }

  const albumId = await createAlbum(albumData)
  return { id: albumId, title: rel.title }
}

// ────────────────────────────────────────────────────────────────────────────
// commitChartTrack — sukuria praturtintą dainą iš atlikėjo segmento + pavadinimo
// (BE YouTube nuorodos — naudoja chart resolver „Sukurti"). Skirtumas nuo
// commitTrack: pradeda nuo teksto, o YT video randa per enrichTrack paiešką.
// ────────────────────────────────────────────────────────────────────────────

export type ChartTrackResult = {
  ok: true
  trackId: number
  artistId: number
  artistName: string
  artistCreated: boolean
  featuring: string[]
  enriched: { videoFound: boolean; views: number | null; lyricsFound: boolean; spotifyFound: boolean }
} | { ok: false; error: string }

/**
 * @param artistSegment „Xcho, By Индия, МОТ" — primary + featuring atskiriami.
 * @param rawTitle daina (gali turėti „(feat. X)" — tai irgi taps featuring).
 * @param origin    request origin (lyrics/spotify API kvietimams).
 * @param opts.enrich  true → YT search + views + lyrics + spotify (per-row Sukurti).
 *                     false → tik atlikėjas+featuring+track (bulk, greitas).
 */
export async function commitChartTrack(
  artistSegment: string, rawTitle: string, origin: string,
  opts: { enrich?: boolean } = {},
): Promise<ChartTrackResult> {
  const supabase = createAdminClient()
  ensureWikiInit()

  // 1) Pavadinimo featuring („Song (feat. X)") + švarus title.
  const { cleanTitle, featuring: titleFeats } = wiki.parseFeaturing(rawTitle || '')
  const title = (cleanTitle || rawTitle || '').trim()
  if (!title) return { ok: false, error: 'Trūksta dainos pavadinimo' }

  // 2) Primary atlikėjas + featuring iš segmento („A, B, C" / „A feat. B").
  const ta = await resolveTrackArtists(supabase, artistSegment)
  if (!ta) return { ok: false, error: `Nepavyko priskirti/sukurti atlikėjo: „${artistSegment}"` }
  const artist = ta.primary
  let featuringNames = Array.from(new Set(
    [...ta.featuringNames, ...(titleFeats || [])]
      .map((n) => n.trim())
      .filter((n) => n && slugify(n) !== artist.slug && wiki.cleanArtistName(n).toLowerCase() !== artist.name.toLowerCase()),
  ))

  // 3) Track (dup guard: normalizuotas pavadinimas, ne trapus ILIKE — apostrofų
  //    („Don't" tiesus vs garbanotas) ir diakritikos skirtumai nebekurs dublikato).
  const normAlbumTrackTitle = normalizeTitle(title)
  const { data: candTracks } = await supabase
    .from('tracks').select('id, slug, title').eq('artist_id', artist.id).limit(5000)
  const existing = (normAlbumTrackTitle
    ? (candTracks || []).find((t: any) => normalizeTitle(t.title || '') === normAlbumTrackTitle)
    : null) || null
  let trackId: number
  if (existing) {
    trackId = (existing as any).id
  } else {
    const base = slugify(title) || `track-${Date.now()}`
    let finalSlug = base
    for (let i = 0; i < 50; i++) {
      const ex = await supabase.from('tracks').select('id').eq('slug', finalSlug).maybeSingle()
      if (!ex.data) break
      finalSlug = `${base}-${i + 1}`
    }
    const { data: created, error } = await supabase
      .from('tracks').insert({ title, slug: finalSlug, artist_id: artist.id }).select('id').single()
    if (error || !created) return { ok: false, error: `Track create failed: ${error?.message}` }
    trackId = (created as any).id
  }

  // 4) Featuring atlikėjai.
  if (featuringNames.length) {
    try { await syncTrackFeaturing(supabase, trackId, featuringNames) }
    catch { /* best-effort */ }
  }

  const enriched = { videoFound: false, views: null as number | null, lyricsFound: false, spotifyFound: false }

  // 5) Enrich (tik per-row Sukurti — YT search brangus): video + views.
  if (opts.enrich) {
    try {
      const er = await enrichTrack(trackId, true)
      if (er.ok) {
        enriched.videoFound = !!er.wasFound; enriched.views = er.viewsAfter ?? null
        // Išleidimo data iš YT įkėlimo datos — enrichTrack užpildo
        // video_uploaded_at, bet ne release_*; nustatom čia, jei daina dar
        // neturi datos (dedupe atveju esamos datos nepertepam).
        try {
          const { data: trow } = await supabase
            .from('tracks').select('video_uploaded_at, release_year').eq('id', trackId).maybeSingle()
          const up = (trow as any)?.video_uploaded_at
          if (up && !(trow as any)?.release_year) {
            const d = new Date(up)
            if (!isNaN(d.getTime())) {
              const ry = d.getUTCFullYear(), rm = d.getUTCMonth() + 1, rd = d.getUTCDate()
              await supabase.from('tracks').update({
                release_year: ry, release_month: rm, release_day: rd,
                release_date: `${ry}-${String(rm).padStart(2, '0')}-${String(rd).padStart(2, '0')}`,
              }).eq('id', trackId)
            }
          }
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    // Lyrics
    try {
      const lr = await fetch(`${origin}/api/search/lyrics?artist=${encodeURIComponent(artist.name)}&title=${encodeURIComponent(title)}`, { signal: AbortSignal.timeout(12000) })
      if (lr.ok) {
        const lj = await lr.json()
        if (lj?.lyrics) { await supabase.from('tracks').update({ lyrics: lj.lyrics }).eq('id', trackId); enriched.lyricsFound = true }
      }
    } catch { /* ignore */ }
    // Spotify
    try {
      const sr = await fetch(`${origin}/api/search/spotify?q=${encodeURIComponent(`${artist.name} ${title}`)}`, { signal: AbortSignal.timeout(12000) })
      if (sr.ok) {
        const sj = await sr.json()
        const best = (sj?.results || [])[0]
        if (best?.id) { await supabase.from('tracks').update({ spotify_id: best.id }).eq('id', trackId); enriched.spotifyFound = true }
      }
    } catch { /* ignore */ }
  }

  return {
    ok: true, trackId, artistId: artist.id, artistName: artist.name,
    artistCreated: artist.created, featuring: featuringNames, enriched,
  }
}

/** Read-only: ar primary atlikėjas jau egzistuoja kataloge (chart UI badge'ui).
 *  Grąžina { exists, name, slug } NIEKO nesukurdamas. */
export async function probeChartArtist(artistSegment: string): Promise<{ exists: boolean; name: string; slug: string | null }> {
  const supabase = createAdminClient()
  const a = await analyzeArtistSegment(supabase, artistSegment)
  return { exists: !!a.primaryMatch, name: a.primaryMatch?.name || a.primaryName, slug: a.primaryMatch?.slug ?? null }
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
      artist_id: match?.id ?? null,
      artist_slug: match?.slug ?? null,
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
  // Jei admin pickeriu pasirinko konkretų katalogo atlikėją — naudojam tiesiai.
  // Kitaip resolve pagal vardą (Wiki enrichment tik kai vardas nepakeistas).
  let artist: QuickAddArtist | null = null
  if (ov.artist_id) artist = await getArtistById(supabase, Number(ov.artist_id))
  if (!artist) {
    artist = await resolveArtist(supabase, artistName, {
      enrichFromWikiTitle: artistName === w.artistName ? w.artistWikiTitle : null,
    })
  }
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
