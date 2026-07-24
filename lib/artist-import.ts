// lib/artist-import.ts
//
// Atlikėjo JSON importas — vienas struktūruotas JSON (iš GPT) → preview diff →
// apply (sukuria arba atnaujina atlikėją + linkus + kontaktus + albumus +
// dainas + įrašo audit log).
//
// JSON formatas (žr. spec): { artist_patch, links, contacts, albums, tracks, images }.
// JSON'e NĖRA artist_slug — atlikėjas randamas/sukuriamas pagal artist_patch.name.
//
// Saugumas: VISKAS per service-role klientą (createAdminClient) — call'inti tik
// admin endpoint'uose. Niekur nenaudojam PostgREST builder.catch() (laužo build) —
// tik async/await + try/catch.

import type { SupabaseClient } from '@supabase/supabase-js'
import { slugify } from './slugify'
import { findOrCreateArtist } from './featuring-utils'
import { loadSubstyleRows, resolveSubstyle } from './substyle-resolve'
import { resolvePhotographerId, splitAuthorLicense } from './photographers'
import { resolveExistingTrackId } from './track-dedup'

// ── Tipai ─────────────────────────────────────────────────────────────────────
export interface ImportLink { platform: string; url: string }
export interface ImportContact {
  name?: string; type?: string; email?: string | null
  phone?: string | null; url?: string | null; confidence?: string
}
export interface ImportFeatured { name: string }
export interface ImportAlbum {
  title: string; source_title?: string; type?: string
  cover_image_url?: string | null; cover_source?: string | null; cover_source_url?: string | null
  release_date?: string | null; release_year?: number | null
  total_tracks?: number | null
  description?: string | null
  spotify_url?: string | null; apple_music_url?: string | null; deezer_url?: string | null
  /** Visi albumo atlikėjai kredito tvarka (pirmas = pagrindinis). Bendriems/
   *  kolaboraciniams albumams — GPT pateikia visus (pvz. ["thelastsunday","Jausmė"]).
   *  Leidžia importui sujungti tą patį albumą tarp atlikėjų, o ne dubliuoti. */
  album_artists?: string[]
}
export interface ImportTrack {
  title: string; source_title?: string
  album_title?: string | null; source_album_title?: string | null
  type?: string; track_number?: number | null
  release_date?: string | null
  release_year?: number | null; release_month?: number | null; release_day?: number | null
  duration?: string | null
  featured_artists?: ImportFeatured[]
  primary_artists?: ImportFeatured[]
  spotify_url?: string | null
}
export interface ImportImage {
  type?: string
  url: string; image_url?: string
  source?: string; source_url?: string
  author?: string; credit?: string
  license?: string; caption?: string
  is_primary?: boolean
}
export interface ImportArtistPatch {
  name: string
  type?: string
  country?: string | null
  birth_date?: string | null
  active_year_start?: number | null
  active_year_end?: number | null
  is_active?: boolean
  gender?: string | null
  genre_group?: string | null
  genres?: string[]
  bio?: string | null
}
export interface ArtistImportPayload {
  artist_patch: ImportArtistPatch
  links?: ImportLink[]
  contacts?: ImportContact[]
  albums?: ImportAlbum[]
  tracks?: ImportTrack[]
  images?: ImportImage[]
  /** 'full' = įprastas importas; 'album_description' = tik albumo aprašymo enrichment
   *  (iš flat { artist, album, description } formato). Album_description režime
   *  albumas TIK randamas (nesukuriamas) — jei nerastas, aprašymas praleidžiamas. */
  mode?: 'full' | 'album_description'
}

/** Pasirinkimo filtras — UI po preview perduoda kurias dalis taikyti (varnelės).
 *  Jei laukas undefined → taikoma viskas (backward-compatible). Tušti masyvai = nieko. */
export interface ApplySelection {
  fields?: string[]      // FieldDiff.field reikšmės (be 'name' — vardas nekeičiamas update'inant)
  links?: number[]       // indeksai payload.links masyve
  contacts?: number[]    // indeksai payload.contacts masyve
  albums?: number[]      // indeksai payload.albums masyve
  tracks?: number[]      // indeksai payload.tracks masyve
  images?: number[]      // indeksai payload.images masyve
}

// ── Konstantos / enums ────────────────────────────────────────────────────────
export const GENRE_GROUPS = [
  'Alternatyvioji muzika',
  'Elektroninė, šokių muzika',
  "Hip-hop'o muzika",
  'Kitų stilių muzika',
  'Pop, R&B muzika',
  'Rimtoji muzika',
  'Roko muzika',
  'Sunkioji muzika',
] as const

// genres.id reikšmės (seed_genres rows). Mirror'inta nuo /api/artists/import.
const GENRE_IDS: Record<string, number> = {
  'Alternatyvioji muzika': 1000556,
  'Elektroninė, šokių muzika': 1000557,
  "Hip-hop'o muzika": 1000558,
  'Kitų stilių muzika': 1000559,
  'Pop, R&B muzika': 1000560,
  'Rimtoji muzika': 1000561,
  'Roko muzika': 1000562,
  'Sunkioji muzika': 1000563,
}

const ARTIST_TYPE_MAP: Record<string, 'solo' | 'group'> = {
  solo_artist: 'solo',
  solo: 'solo',
  group: 'group',
  project: 'group', // DB neturi 'project' — saugom kaip group (su warning'u)
}

// link.platform → artists.* stulpelis. Tik tie, kuriems jau yra stulpelis.
// Nepalaikomi (apple_music, youtube_music, pakartot, linktree) → warning, skip.
const LINK_COLUMN_MAP: Record<string, string> = {
  official_website: 'website',
  spotify: 'spotify',
  instagram: 'instagram',
  facebook: 'facebook',
  tiktok: 'tiktok',
  youtube: 'youtube',
  soundcloud: 'soundcloud',
  bandcamp: 'bandcamp',
  x: 'twitter',
  twitter: 'twitter',
}

const CONTACT_TYPES = [
  'business', 'management', 'booking', 'press', 'label', 'event_organizer',
  'potential_management', 'potential_label', 'potential_booking', 'general',
]
const CONFIDENCE_VALUES = ['high', 'medium', 'low']

const ALBUM_TYPE_FLAG: Record<string, string> = {
  studio_album: 'type_studio',
  ep: 'type_ep',
  single: 'type_single',
  compilation: 'type_compilation',
  live_album: 'type_live',
}

// spec track.type → { DB type, is_single }
const TRACK_TYPE_MAP: Record<string, { type: string; is_single: boolean }> = {
  album_track: { type: 'normal', is_single: false },
  single: { type: 'normal', is_single: true },
  remix: { type: 'remix', is_single: false },
  live: { type: 'live', is_single: false },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
/** Normalizuotas vardas matching'ui: lowercase, be diakritikų, be extra tarpų. */
export function normalizeName(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ąčęėįšųūž]/g, c => ({ ą: 'a', č: 'c', ę: 'e', ė: 'e', į: 'i', š: 's', ų: 'u', ū: 'u', ž: 'z' }[c] || c))
    .replace(/\s+/g, ' ')
    .trim()
}

function parseDateParts(d?: string | null): { year: number | null; month: number | null; day: number | null } {
  if (!d) return { year: null, month: null, day: null }
  const m = String(d).match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/)
  if (!m) return { year: null, month: null, day: null }
  return {
    year: m[1] ? parseInt(m[1]) : null,
    month: m[2] ? parseInt(m[2]) : null,
    day: m[3] ? parseInt(m[3]) : null,
  }
}

function albumSlug(title: string, year?: number | null): string {
  return slugify(title) + (year ? `-${year}` : '')
}

/** Albumo atlikėjų sąrašas (bendriems/kolab albumams). Pirmenybė aiškiam
 *  a.album_artists laukui; jei jo nėra — išvedam iš to albumo dainų
 *  primary_artists (pvz. „Neriuos" dainos visos turi [thelastsunday, Jausmė]).
 *  Fallback — [pagrindinis atlikėjas]. Eiliškumas: pirmas = pagrindinis. */
function deriveAlbumArtists(a: ImportAlbum, tracks: ImportTrack[], primaryName: string): string[] {
  const dedup = (arr: string[]): string[] => {
    const out: string[] = []
    for (const nm of arr) {
      const s = (nm || '').trim()
      if (s && !out.some(x => normalizeName(x) === normalizeName(s))) out.push(s)
    }
    return out
  }
  if (a.album_artists && a.album_artists.length) {
    const d = dedup(a.album_artists)
    if (d.length) return d
  }
  const normAlbum = normalizeName(a.title)
  const names: string[] = []
  for (const t of tracks) {
    if (!t.album_title || normalizeName(t.album_title) !== normAlbum) continue
    for (const pa of (t.primary_artists || [])) {
      const nm = (pa.name || '').trim()
      if (nm && !names.some(x => normalizeName(x) === normalizeName(nm))) names.push(nm)
    }
  }
  return names.length ? names : [primaryName]
}

/** Trukmė „M:SS" / „MM:SS" / „H:MM:SS" — normalizuojama TIK preview rodymui
 *  (tracks lentelė neturi duration stulpelio, tad į DB nerašoma).
 *  Grąžina normalizuotą string arba null jei formatas netinkamas. */
function normalizeDuration(d?: string | null): string | null {
  if (!d || typeof d !== 'string') return null
  const s = d.trim()
  const m = s.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const [, h, min, sec] = m
  if (+sec > 59) return null
  if (h !== undefined) return `${+h}:${min.padStart(2, '0')}:${sec}`
  return `${+min}:${sec}`
}

/** Suvienodina JSON nuotraukos objektą (laukų pavadinimai skiriasi tarp šaltinių):
 *  url|image_url, source(žymė)|source_url(nuoroda), author|credit(atribucija),
 *  license, caption(aprašymas). Grąžina normalizuotus laukus + ar URL tinkamas. */
function normalizeImportImage(img: ImportImage): {
  url: string; validUrl: boolean
  sourceLabel: string | null; sourceUrl: string | null
  author: string | null; credit: string | null
  license: string | null; caption: string | null; isPrimary: boolean
} {
  const url = String(img?.url || img?.image_url || '').trim()
  const validUrl = /^https?:\/\//i.test(url) && !url.startsWith('data:')
  const rawSource = (img?.source || '').trim()
  // source gali būti žymė ("official_website") arba nuoroda — atskiriam.
  const sourceIsUrl = /^https?:\/\//i.test(rawSource)
  const sourceUrl = (img?.source_url && img.source_url.trim()) || (sourceIsUrl ? rawSource : null)
  const sourceLabel = sourceIsUrl ? null : (rawSource || null)
  const author = (img?.author || '').trim() || null
  const credit = (img?.credit || '').trim() || null
  return {
    url, validUrl,
    sourceLabel, sourceUrl,
    author, credit,
    license: (img?.license || '').trim() || null,
    caption: (img?.caption || '').trim() || null,
    isPrimary: !!img?.is_primary,
  }
}

/** Ar atlikėjas lietuviškas? null/tuščia šalis = nežinoma → laikom LT (neskipinam vadybos).
 *  Vadybos/kontaktų dalis taikoma tik LT atlikėjams (vadybininkų bazė LT scenai). */
export function isNonLithuanian(country?: string | null): boolean {
  if (!country || !country.trim()) return false
  return !/^(lietuva|lithuania|lt)$/i.test(country.trim())
}

/** Spotify oEmbed (be auth) → albumo/dainos viršelio thumbnail URL.
 *  open.spotify.com/oembed grąžina thumbnail_url (album art). Tylus fail → null. */
export async function fetchSpotifyThumb(spotifyUrl?: string | null): Promise<string | null> {
  if (!spotifyUrl) return null
  try {
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), 5000)
    const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`, {
      signal: ctrl.signal, headers: { 'User-Agent': 'music.lt/1.0' },
    })
    clearTimeout(to)
    if (!res.ok) return null
    const data = await res.json()
    return data?.thumbnail_url || null
  } catch { return null }
}

// ── Validacija ────────────────────────────────────────────────────────────────
export interface ValidationResult { ok: boolean; errors: string[]; payload?: ArtistImportPayload }

export function validateImportJson(raw: unknown): ValidationResult {
  const errors: string[] = []
  let obj: any = raw
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw) } catch (e: any) {
      return { ok: false, errors: [`Neteisingas JSON: ${e.message}`] }
    }
  }
  if (!obj || typeof obj !== 'object') return { ok: false, errors: ['JSON turi būti objektas'] }

  // ── Flat „tik albumo aprašymas" formatas: { artist, album, description } ──
  // Normalizuojam į standartinį payload su mode='album_description'.
  if (!obj.artist_patch && (obj.artist || obj.album || obj.description) && typeof obj.artist === 'string') {
    const fErrors: string[] = []
    if (!obj.artist || !String(obj.artist).trim()) fErrors.push('"artist" yra privalomas')
    if (!obj.album || !String(obj.album).trim()) fErrors.push('"album" yra privalomas')
    if (!obj.description || !String(obj.description).trim()) fErrors.push('"description" yra privalomas')
    if (fErrors.length) return { ok: false, errors: fErrors }
    const payload: ArtistImportPayload = {
      artist_patch: { name: String(obj.artist).trim() },
      links: [], contacts: [],
      albums: [{ title: String(obj.album).trim(), description: String(obj.description).trim() }],
      tracks: [], images: [],
      mode: 'album_description',
    }
    return { ok: true, errors: [], payload }
  }

  const patch = obj.artist_patch
  if (!patch || typeof patch !== 'object') {
    errors.push('Trūksta "artist_patch" objekto (arba flat formato laukų: artist, album, description)')
  } else if (!patch.name || typeof patch.name !== 'string' || !patch.name.trim()) {
    errors.push('artist_patch.name yra privalomas')
  }

  // Soft validacija (warning'ai, ne klaidos) — tikrinama preview'e.
  const arrays = ['links', 'contacts', 'albums', 'tracks', 'images']
  for (const k of arrays) {
    if (obj[k] !== undefined && !Array.isArray(obj[k])) errors.push(`"${k}" turi būti masyvas`)
  }

  if (errors.length) return { ok: false, errors }

  const payload: ArtistImportPayload = {
    artist_patch: patch,
    links: obj.links || [],
    contacts: obj.contacts || [],
    albums: obj.albums || [],
    tracks: obj.tracks || [],
    images: obj.images || [],
    mode: 'full',
  }
  return { ok: true, errors: [], payload }
}

// ── Artist matching ───────────────────────────────────────────────────────────
export interface MatchCandidate { id: number; name: string; slug: string; type: string | null; country: string | null }
export interface ArtistMatch {
  status: 'matched' | 'multiple' | 'new'
  artist?: MatchCandidate
  candidates: MatchCandidate[]
}

export async function matchArtist(sb: SupabaseClient, rawName: string): Promise<ArtistMatch> {
  const name = (rawName || '').trim()
  const norm = normalizeName(name)
  const slug = slugify(name)

  // 1) Exact (case-insensitive) name match
  const { data: exact } = await sb
    .from('artists')
    .select('id, name, slug, type, country')
    .ilike('name', name)
    .limit(10)
  const exactRows = (exact || []) as MatchCandidate[]
  if (exactRows.length === 1) return { status: 'matched', artist: exactRows[0], candidates: exactRows }
  if (exactRows.length > 1) return { status: 'multiple', candidates: exactRows }

  // 2) Slug match
  const { data: bySlug } = await sb
    .from('artists').select('id, name, slug, type, country').eq('slug', slug).limit(10)
  const slugRows = (bySlug || []) as MatchCandidate[]
  if (slugRows.length === 1) return { status: 'matched', artist: slugRows[0], candidates: slugRows }
  if (slugRows.length > 1) return { status: 'multiple', candidates: slugRows }

  // 3) Fuzzy — pirmas reikšmingas žodis, normalizuotas palyginimas
  const token = name.split(/\s+/)[0] || name
  const { data: fuzzy } = await sb
    .from('artists')
    .select('id, name, slug, type, country')
    .or(`name.ilike.${token}%,name.ilike.% ${token}%`)
    .limit(8)
  const fuzzyRows = (fuzzy || []) as MatchCandidate[]
  const normMatches = fuzzyRows.filter(r => normalizeName(r.name) === norm)
  if (normMatches.length === 1) return { status: 'matched', artist: normMatches[0], candidates: normMatches }
  if (normMatches.length > 1) return { status: 'multiple', candidates: normMatches }

  // Nieko aiškaus — naujas, bet pasiūlom panašius kaip kandidatus.
  return { status: 'new', candidates: fuzzyRows }
}

// ── Preview ───────────────────────────────────────────────────────────────────
export interface FieldDiff { field: string; label: string; old: any; new: any; changed: boolean; selectable: boolean }
export interface LinkDiff { index: number; platform: string; column: string | null; oldUrl: string | null; newUrl: string; action: 'add' | 'update' | 'unchanged' | 'unsupported' }
export interface ContactPlan { index: number; name: string; type: string; email: string | null; phone: string | null; url: string | null; confidence: string; action: 'add' | 'update'; isPotential: boolean }
export interface AlbumPlan { index: number; title: string; type: string | null; year: number | null; action: 'create' | 'update'; existingId: number | null; description: string | null; descriptionOld: string | null; descriptionChanged: boolean; descriptionOnly: boolean; notFound: boolean; coverUrl: string | null; coverWillApply: boolean; albumArtists: string[]; shared: boolean }
export interface TrackPlan { index: number; title: string; albumTitle: string | null; type: string | null; action: 'create' | 'update'; existingId: number | null; albumFound: boolean; featuring: string[]; featuringNew: string[]; year: number | null; duration: string | null; dupInPayload: boolean }
export interface ImagePlan {
  index: number; url: string; type: string | null
  sourceLabel: string | null; sourceUrl: string | null
  author: string | null; credit: string | null; license: string | null; caption: string | null
  isPrimary: boolean; hasLicense: boolean; isDuplicate: boolean
  /** add = bus pridėta; duplicate = jau yra galerijoje (praleidžiama); skip = netinkamas URL */
  action: 'add' | 'duplicate' | 'skip'
}
/** Esama atlikėjo galerijos nuotrauka (rodoma review'e dublikatų vengimui). */
export interface ExistingPhoto { url: string; author: string | null; license: string | null }

export interface ImportPreview {
  match: ArtistMatch
  willCreateArtist: boolean
  targetArtistId: number | null
  fieldDiffs: FieldDiff[]
  linkDiffs: LinkDiff[]
  contactPlans: ContactPlan[]
  albumPlans: AlbumPlan[]
  trackPlans: TrackPlan[]
  imagePlans: ImagePlan[]
  existingPhotos: ExistingPhoto[]
  /** true jei atlikėjas neturi nei profilio, nei hero nuotraukos ir yra bent viena
   *  pridedama nuotrauka — pirma tokia taps profiliu ir hero. */
  willSetHeroProfile: boolean
  warnings: string[]
}

/**
 * Sukuria preview be jokių rašymų į DB.
 * @param forceArtistId — kai keli match'ai, UI perduoda pasirinktą id (arba 0/null = kurti naują)
 */
export async function buildPreview(
  sb: SupabaseClient,
  payload: ArtistImportPayload,
  forceArtistId?: number | null
): Promise<ImportPreview> {
  const warnings: string[] = []
  const p = payload.artist_patch

  // ── Resolve target artist ──
  let match = await matchArtist(sb, p.name)
  let targetArtistId: number | null = null
  let willCreateArtist = false

  if (forceArtistId && forceArtistId > 0) {
    targetArtistId = forceArtistId
    // Refresh match.artist į pasirinktą
    const { data: chosen } = await sb.from('artists').select('id, name, slug, type, country').eq('id', forceArtistId).maybeSingle()
    if (chosen) match = { status: 'matched', artist: chosen as MatchCandidate, candidates: match.candidates }
  } else if (forceArtistId === 0) {
    willCreateArtist = true
  } else if (match.status === 'matched' && match.artist) {
    targetArtistId = match.artist.id
  } else if (match.status === 'new') {
    willCreateArtist = true
  } else if (match.status === 'multiple') {
    warnings.push(`Rasti ${match.candidates.length} panašūs atlikėjai — pasirink kurį atnaujinti arba kurk naują.`)
  }

  // ── Existing artist row (jei update) ──
  let existing: any = null
  let existingSubstyles: string[] = []
  let existingGenre: string | null = null
  if (targetArtistId) {
    const { data: row } = await sb.from('artists').select('*').eq('id', targetArtistId).maybeSingle()
    existing = row
    const { data: subs } = await sb.from('artist_substyles').select('substyles(name)').eq('artist_id', targetArtistId)
    existingSubstyles = (subs || []).map((s: any) => s.substyles?.name).filter(Boolean)
    const { data: gens } = await sb.from('artist_genres').select('genres(name)').eq('artist_id', targetArtistId)
    existingGenre = (gens || []).map((g: any) => g.genres?.name).filter(Boolean)[0] || null
  }

  // ── Field diffs ──
  const dateParts = parseDateParts(p.birth_date)
  const newType = p.type ? (ARTIST_TYPE_MAP[p.type] || 'group') : undefined
  if (p.type && !ARTIST_TYPE_MAP[p.type]) warnings.push(`Nežinomas type "${p.type}" — saugoma kaip "group".`)
  if (p.type === 'project') warnings.push('type "project" nepalaikomas DB — saugoma kaip "group".')

  const fieldDiffs: FieldDiff[] = []
  // 'name' nekeičiamas atnaujinant esamą atlikėją (tik kuriant naują) — todėl ne-selectable.
  const NON_SELECTABLE_FIELDS = new Set(['name'])
  const addDiff = (field: string, label: string, oldV: any, newV: any) => {
    if (newV === undefined || newV === null || newV === '') return
    fieldDiffs.push({
      field, label, old: oldV ?? null, new: newV,
      changed: String(oldV ?? '') !== String(newV ?? ''),
      selectable: !NON_SELECTABLE_FIELDS.has(field),
    })
  }
  addDiff('name', 'Vardas', existing?.name, p.name)
  if (newType) addDiff('type', 'Tipas', existing?.type, newType)
  addDiff('country', 'Šalis', existing?.country, p.country)
  addDiff('birth_date', 'Gimimo data', existing?.birth_date, p.birth_date)
  addDiff('active_from', 'Aktyvus nuo', existing?.active_from, p.active_year_start)
  addDiff('active_until', 'Aktyvus iki', existing?.active_until, p.active_year_end)
  if (p.is_active !== undefined) addDiff('is_active', 'Aktyvus', existing?.is_active, p.is_active)
  if (p.gender && ['male', 'female'].includes(p.gender)) addDiff('gender', 'Lytis', existing?.gender, p.gender)
  else if (p.gender) warnings.push(`Lytis "${p.gender}" nepalaikoma DB (tik male/female) — bus praleista.`)
  addDiff('genre_group', 'Stiliaus grupė', existingGenre, p.genre_group)
  if (p.genres && p.genres.length) addDiff('substyles', 'Sub-stiliai', existingSubstyles.join(', '), p.genres.join(', '))
  // Bio perduodam PILNĄ (nenukirptą) — UI parodo išskleidžiamą/su slinktimi.
  addDiff('description', 'Bio', existing?.description || null, p.bio || null)

  // genre_group validacija
  if (p.genre_group && !GENRE_GROUPS.includes(p.genre_group as any)) {
    warnings.push(`Neteisinga genre_group "${p.genre_group}" — turi būti viena iš 8 Music.lt stilių. Nebus pritaikyta.`)
  }

  // ── Link diffs ──
  const linkDiffs: LinkDiff[] = []
  const linksArr = payload.links || []
  for (let li = 0; li < linksArr.length; li++) {
    const l = linksArr[li]
    if (!l?.platform || !l?.url) continue
    const col = LINK_COLUMN_MAP[l.platform] || null
    if (!col) {
      linkDiffs.push({ index: li, platform: l.platform, column: null, oldUrl: null, newUrl: l.url, action: 'unsupported' })
      warnings.push(`Link platforma "${l.platform}" dar neturi DB stulpelio — praleidžiama (galima sugretinti vėliau).`)
      continue
    }
    const oldUrl = existing?.[col] || null
    const action: LinkDiff['action'] = !oldUrl ? 'add' : (oldUrl === l.url ? 'unchanged' : 'update')
    linkDiffs.push({ index: li, platform: l.platform, column: col, oldUrl, newUrl: l.url, action })
  }

  // ── Contact plans ──
  // Vadyba/kontaktai taikomi TIK LT atlikėjams (vadybininkų bazė LT scenai).
  const resolvedCountry = p.country ?? existing?.country ?? null
  const skipContacts = isNonLithuanian(resolvedCountry)
  const contactPlans: ContactPlan[] = []
  let existingContacts: any[] = []
  if (skipContacts && (payload.contacts || []).length) {
    warnings.push(`Ne LT atlikėjas (${resolvedCountry}) — vadybos/kontaktų dalis praleidžiama (${(payload.contacts || []).length} kontaktai neimportuojami).`)
  }
  if (targetArtistId && !skipContacts) {
    const { data: cs } = await sb.from('artist_contacts').select('id, type, email, url, name').eq('artist_id', targetArtistId)
    existingContacts = cs || []
  }
  const contactsArr = skipContacts ? [] : (payload.contacts || [])
  for (let ci = 0; ci < contactsArr.length; ci++) {
    const c = contactsArr[ci]
    const type = c.type && CONTACT_TYPES.includes(c.type) ? c.type : 'general'
    if (c.type && !CONTACT_TYPES.includes(c.type)) warnings.push(`Nežinomas kontakto type "${c.type}" — saugoma kaip "general".`)
    const conf = c.confidence && CONFIDENCE_VALUES.includes(c.confidence) ? c.confidence : 'medium'
    const isPotential = !c.email && !c.phone
    const dup = existingContacts.find(ec =>
      ec.type === type && ((c.email && ec.email && ec.email.toLowerCase() === c.email.toLowerCase()) ||
        (!c.email && ec.url && c.url && ec.url === c.url))
    )
    contactPlans.push({
      index: ci,
      name: c.name || '', type, email: c.email || null, phone: c.phone || null,
      url: c.url || null, confidence: conf, action: dup ? 'update' : 'add', isPotential,
    })
    if (isPotential && (c.name || c.url)) warnings.push(`Kontaktas "${c.name || c.url}" be email/telefono — saugoma kaip potencialus lead'as.`)
  }

  // ── Album plans ──
  const albumPlans: AlbumPlan[] = []
  const albumIdByTitle: Record<string, number> = {}
  const descriptionOnly = payload.mode === 'album_description'
  const albumsArr = payload.albums || []
  for (let ai = 0; ai < albumsArr.length; ai++) {
    const a = albumsArr[ai]
    if (!a?.title) continue
    const parts = parseDateParts(a.release_date)
    const year = a.release_year ?? parts.year
    if (a.type && !ALBUM_TYPE_FLAG[a.type]) warnings.push(`Nežinomas albumo type "${a.type}" (${a.title}) — type flag nebus nustatytas.`)
    // Albumo atlikėjai (bendri/kolab): a.album_artists arba išvesta iš dainų.
    // Preview'e resolve tik į ESAMUS id (nekuriam) — cross-artist paieškai.
    const albumArtistNames = deriveAlbumArtists(a, payload.tracks || [], p.name)
    const ownerCandidates: number[] = []
    if (targetArtistId) ownerCandidates.push(targetArtistId)
    for (const nm of albumArtistNames) {
      const { data: ar } = await sb.from('artists').select('id').or(`slug.eq.${slugify(nm)},name.ilike.${nm}`).limit(1)
      const id = ar?.[0]?.id
      if (id && !ownerCandidates.includes(id)) ownerCandidates.push(id)
    }
    let existingId: number | null = null
    let existingDescription: string | null = null
    let existingCover: string | null = null
    if (ownerCandidates.length) {
      const slug = albumSlug(a.title, year)
      const { data: al } = await sb.from('albums').select('id, description, cover_image_url').in('artist_id', ownerCandidates).eq('slug', slug).limit(1)
      let row = al?.[0]
      if (!row) {
        const { data: byTitle } = await sb.from('albums').select('id, description, cover_image_url').in('artist_id', ownerCandidates).ilike('title', a.title).limit(1)
        row = byTitle?.[0]
      }
      existingId = row?.id ?? null
      existingDescription = row?.description ?? null
      existingCover = row?.cover_image_url ?? null
    }
    if (existingId) albumIdByTitle[normalizeName(a.title)] = existingId
    const newDescription = a.description?.trim() || null
    const descriptionChanged = !!newDescription && String(existingDescription ?? '') !== newDescription
    // Album_description režimas: albumas TIK randamas. Jei nerastas → aprašymas nepritaikomas.
    const notFound = descriptionOnly && !existingId
    if (notFound) warnings.push(`Albumas "${a.title}" nerastas pas atlikėją — aprašymas nebus išsaugotas (album_description režimas nesukuria naujų albumų).`)
    // Viršelis: JSON cover_image_url (thumbnail'ui) + ar apskritai bus nustatytas.
    // Apply logika: naujam albumui viršelis nustatomas visada; esamam — tik jei dar neturi.
    const providedCover = a.cover_image_url?.trim() || null
    const hasCoverSource = !!(providedCover || (a.spotify_url && a.spotify_url.trim()))
    const coverWillApply = descriptionOnly ? false : (existingId ? (hasCoverSource && !existingCover) : hasCoverSource)
    albumPlans.push({
      index: ai, title: a.title, type: a.type || null, year,
      action: existingId ? 'update' : 'create', existingId,
      description: newDescription, descriptionOld: existingDescription, descriptionChanged,
      descriptionOnly, notFound,
      coverUrl: providedCover, coverWillApply,
      albumArtists: albumArtistNames, shared: albumArtistNames.length > 1,
    })
  }

  // ── Track plans ──
  const trackPlans: TrackPlan[] = []
  const albumTitlesInPayload = new Set((payload.albums || []).map(a => normalizeName(a.title)))
  const seenTrackTitles = new Set<string>()
  const tracksArr = payload.tracks || []
  for (let ti = 0; ti < tracksArr.length; ti++) {
    const t = tracksArr[ti]
    if (!t?.title) continue
    if (t.type && !TRACK_TYPE_MAP[t.type]) warnings.push(`Nežinomas dainos type "${t.type}" (${t.title}) — saugoma kaip "normal".`)
    const albumTitle = t.album_title || null
    let albumFound = false
    let albumIdForTrack: number | null = null
    if (albumTitle) {
      const normAlb = normalizeName(albumTitle)
      if (albumIdByTitle[normAlb]) { albumFound = true; albumIdForTrack = albumIdByTitle[normAlb] }
      else if (albumTitlesInPayload.has(normAlb)) albumFound = true // bus sukurtas su importu
      else if (targetArtistId) {
        const { data: al } = await sb.from('albums').select('id').eq('artist_id', targetArtistId).ilike('title', albumTitle).maybeSingle()
        albumFound = !!al?.id
        if (al?.id) { albumIdByTitle[normAlb] = al.id; albumIdForTrack = al.id }
      }
      if (!albumFound) warnings.push(`Daina "${t.title}": albumas "${albumTitle}" nerastas — daina bus sukurta be albumo prijungimo.`)
    }
    // Album-aware dedup: „Intro" albume A ≠ „Intro" albume B. Randam esamą dainą
    // pagal atlikėją + pavadinimą + albumo kontekstą (žr. lib/track-dedup.ts).
    let existingId: number | null = null
    if (targetArtistId) {
      existingId = await resolveExistingTrackId(sb, targetArtistId, t.title, albumIdForTrack)
    }
    // Kartojasi tame pačiame JSON'e? Raktas = pavadinimas + albumas (kad du „Intro"
    // skirtinguose albumuose NEBŪTŲ laikomi tuo pačiu). Toks pat singlas/albumo
    // daina du kartus → apply sujungs (nekuria dublikato).
    const dupKey = normalizeName(t.title) + '|' + normalizeName(albumTitle || '')
    const dupInPayload = seenTrackTitles.has(dupKey)
    seenTrackTitles.add(dupKey)
    if (dupInPayload) warnings.push(`Daina "${t.title}"${albumTitle ? ` (albumas „${albumTitle}")` : ' (singlas)'} JSON'e kartojasi — bus sujungta.`)
    const featuring = (t.featured_artists || []).map(f => f.name).filter(Boolean)
    const featuringNew: string[] = []
    for (const fn of featuring) {
      const { data: faRows } = await sb.from('artists').select('id').or(`slug.eq.${slugify(fn)},name.ilike.${fn}`).limit(1)
      if (!faRows || faRows.length === 0) { featuringNew.push(fn); warnings.push(`Featuring "${fn}" (${t.title}) nerastas — bus sukurtas naujas atlikėjas.`) }
    }
    const trackYear = t.release_year ?? parseDateParts(t.release_date).year
    trackPlans.push({
      index: ti, title: t.title, albumTitle, type: t.type || null,
      action: existingId ? 'update' : 'create', existingId, albumFound, featuring, featuringNew,
      year: trackYear, duration: normalizeDuration(t.duration), dupInPayload,
    })
  }

  // ── Esamos galerijos nuotraukos (review'ui + dublikatų aptikimui) ──
  const existingPhotos: ExistingPhoto[] = []
  const existingPhotoUrls = new Set<string>()
  if (targetArtistId) {
    const { data: photoRows } = await sb
      .from('artist_photos')
      .select('url, caption, license')
      .eq('artist_id', targetArtistId)
      .order('sort_order')
    for (const p of (photoRows || []) as any[]) {
      if (!p?.url) continue
      existingPhotoUrls.add(p.url)
      existingPhotos.push({ url: p.url, author: decodePhotoAuthor(p.caption), license: p.license ?? null })
    }
  }

  // ── Image plans (galerijos nuotraukos) ──
  const imagePlans: ImagePlan[] = []
  const imagesArr = payload.images || []
  for (let ii = 0; ii < imagesArr.length; ii++) {
    const img = imagesArr[ii]
    if (!img?.url && !img?.image_url) continue
    const n = normalizeImportImage(img)
    if (!n.url) continue
    const isDuplicate = existingPhotoUrls.has(n.url)
    const hasLicense = !!n.license
    const action: ImagePlan['action'] = !n.validUrl ? 'skip' : (isDuplicate ? 'duplicate' : 'add')
    imagePlans.push({
      index: ii, url: n.url, type: img.type || null,
      sourceLabel: n.sourceLabel, sourceUrl: n.sourceUrl,
      author: n.author, credit: n.credit, license: n.license, caption: n.caption,
      isPrimary: n.isPrimary, hasLicense, isDuplicate, action,
    })
    if (!n.validUrl) warnings.push(`Nuotrauka praleidžiama — netinkamas URL: ${n.url}`)
    else if (isDuplicate) warnings.push(`Nuotrauka jau yra galerijoje (dublikatas) — praleidžiama: ${n.url}`)
    else if (!hasLicense) warnings.push(`Nuotrauka be aiškios licencijos — patikrink autorystę prieš pridedant: ${n.url}`)
  }

  // Ar nauja nuotrauka taps profiliu+hero (atlikėjas jų neturi + yra ką pridėti).
  const hasProfileNow = !!(existing?.cover_image_url && String(existing.cover_image_url).trim())
  const hasHeroNow = !!(existing?.cover_image_wide_url && String(existing.cover_image_wide_url).trim())
  const willSetHeroProfile = imagePlans.some(im => im.action === 'add') && !hasProfileNow && !hasHeroNow

  return {
    match, willCreateArtist, targetArtistId,
    fieldDiffs, linkDiffs, contactPlans, albumPlans, trackPlans, imagePlans, existingPhotos,
    willSetHeroProfile, warnings,
  }
}

/** Prilinkina albumo atlikėjus prie album_artists (bendri/kolab albumai).
 *  Defensyvu: jei migracija (album_artists lentelė) dar nepritaikyta — tyliai
 *  praleidžia (albumas vis tiek sukuriamas). is_primary nustatomas TIK naujam
 *  albumui (row0); re-use atveju tik papildo narystę (nekeičia esamo primary). */
async function linkAlbumArtists(
  sb: SupabaseClient, albumId: number, artistIds: number[], isNewAlbum: boolean, warnings: string[]
): Promise<void> {
  if (!albumId || !artistIds.length) return
  const rows = artistIds.map((id, i) => ({
    album_id: albumId, artist_id: id, is_primary: isNewAlbum && i === 0, sort_order: i,
  }))
  const { error } = await sb.from('album_artists').upsert(rows, { onConflict: 'album_id,artist_id', ignoreDuplicates: true })
  if (error && !/does not exist|schema cache/i.test(error.message || '')) {
    warnings.push(`album_artists prilinkinimas nepavyko: ${error.message}`)
  }
}

/** Ištraukia autorių iš artist_photos.caption (saugoma kaip JSON {a,s} arba plika). */
function decodePhotoAuthor(caption: string | null): string | null {
  if (!caption) return null
  try {
    const parsed = JSON.parse(caption)
    if (parsed && typeof parsed === 'object' && 'a' in parsed) return parsed.a || null
  } catch { /* plain string */ }
  return caption || null
}

// ── Apply ─────────────────────────────────────────────────────────────────────
export interface ApplySummary {
  artist_id: number
  created: boolean
  fields_updated: number
  links_updated: number
  contacts_added: number
  contacts_updated: number
  albums_created: number
  albums_updated: number
  tracks_created: number
  tracks_updated: number
  featuring_linked: number
  images_logged: number
  images_added: number
  images_skipped: number
  profile_set: boolean
  hero_set: boolean
  warnings: string[]
}

export async function applyImport(
  sb: SupabaseClient,
  payload: ArtistImportPayload,
  opts: { forceArtistId?: number | null; importedBy?: string; selection?: ApplySelection } = {}
): Promise<ApplySummary> {
  const p = payload.artist_patch
  const warnings: string[] = []
  const summary: ApplySummary = {
    artist_id: 0, created: false, fields_updated: 0, links_updated: 0,
    contacts_added: 0, contacts_updated: 0, albums_created: 0, albums_updated: 0,
    tracks_created: 0, tracks_updated: 0, featuring_linked: 0, images_logged: 0,
    images_added: 0, images_skipped: 0, profile_set: false, hero_set: false, warnings,
  }

  // ── Pasirinkimo filtras (varnelės iš preview). undefined laukas → taikoma viskas. ──
  const sel = opts.selection
  const fieldOn = (f: string) => !sel?.fields || sel.fields.includes(f)
  const linkOn = (i: number) => !sel?.links || sel.links.includes(i)
  const contactOn = (i: number) => !sel?.contacts || sel.contacts.includes(i)
  const albumOn = (i: number) => !sel?.albums || sel.albums.includes(i)
  const trackOn = (i: number) => !sel?.tracks || sel.tracks.includes(i)
  const imageOn = (i: number) => !sel?.images || sel.images.includes(i)
  const descriptionOnly = payload.mode === 'album_description'

  // ── Resolve / create artist ──
  let artistId: number | null = null
  let created = false
  if (opts.forceArtistId && opts.forceArtistId > 0) {
    artistId = opts.forceArtistId
  } else if (opts.forceArtistId === 0) {
    artistId = null // force create
  } else {
    const m = await matchArtist(sb, p.name)
    if (m.status === 'matched' && m.artist) artistId = m.artist.id
    else if (m.status === 'multiple') throw new Error('Keli galimi atlikėjai — pasirink konkretų prieš taikant importą.')
  }

  // Build artist column payload (tik pateikti + pažymėti laukai + linkai į stulpelius)
  const col: Record<string, any> = {}
  if (p.country !== undefined && fieldOn('country')) col.country = p.country
  if (p.type && fieldOn('type')) col.type = ARTIST_TYPE_MAP[p.type] || 'group'
  if (p.birth_date && fieldOn('birth_date')) col.birth_date = p.birth_date
  if (p.active_year_start !== undefined && p.active_year_start !== null && fieldOn('active_from')) col.active_from = p.active_year_start
  if (p.active_year_end !== undefined && p.active_year_end !== null && fieldOn('active_until')) col.active_until = p.active_year_end
  if (p.is_active !== undefined && fieldOn('is_active')) col.is_active = p.is_active
  if (p.gender && ['male', 'female'].includes(p.gender) && fieldOn('gender')) col.gender = p.gender
  else if (p.gender && !['male', 'female'].includes(p.gender)) warnings.push(`Lytis "${p.gender}" nepalaikoma DB (tik male/female) — praleista.`)
  if (p.bio && fieldOn('description')) col.description = p.bio
  const linksArr = payload.links || []
  for (let li = 0; li < linksArr.length; li++) {
    const l = linksArr[li]
    if (!l?.platform || !l?.url) continue
    if (!linkOn(li)) continue
    const c = LINK_COLUMN_MAP[l.platform]
    if (c) { col[c] = l.url; summary.links_updated++ }
    else warnings.push(`Link "${l.platform}" praleistas (nėra stulpelio).`)
  }

  if (!artistId) {
    // CREATE
    const baseSlug = slugify(p.name)
    let slug = baseSlug
    const { data: ex } = await sb.from('artists').select('id').eq('slug', slug).maybeSingle()
    if (ex) slug = `${baseSlug}-${Date.now().toString(36)}`
    const insertPayload: Record<string, any> = {
      name: p.name.trim(), slug,
      type: col.type || (p.type ? ARTIST_TYPE_MAP[p.type] : 'group') || 'group',
      country: col.country !== undefined ? col.country : 'Lietuva',
      is_active: col.is_active ?? true,
      source: 'json_import',
      ...col,
    }
    const { data: newA, error } = await sb.from('artists').insert(insertPayload).select('id').single()
    if (error || !newA) throw new Error(`Atlikėjo sukūrimas nepavyko: ${error?.message}`)
    artistId = newA.id
    created = true
    summary.fields_updated = Object.keys(col).length
  } else {
    // UPDATE — tik jei yra ką keisti
    if (Object.keys(col).length) {
      const { error } = await sb.from('artists').update(col).eq('id', artistId)
      if (error) throw new Error(`Atlikėjo atnaujinimas nepavyko: ${error.message}`)
      summary.fields_updated = Object.keys(col).length
    }
  }
  summary.artist_id = artistId!
  summary.created = created

  // ── Genre group (artist_genres) — replace ──
  if (p.genre_group && GENRE_GROUPS.includes(p.genre_group as any) && fieldOn('genre_group')) {
    const gid = GENRE_IDS[p.genre_group]
    if (gid) {
      await sb.from('artist_genres').delete().eq('artist_id', artistId)
      const { error } = await sb.from('artist_genres').insert({ artist_id: artistId, genre_id: gid })
      if (error) warnings.push(`Stiliaus grupės nustatymas nepavyko: ${error.message}`)
    }
  } else if (p.genre_group && !GENRE_GROUPS.includes(p.genre_group as any)) {
    warnings.push(`genre_group "${p.genre_group}" neteisinga — praleista.`)
  }

  // ── Sub-stiliai (artist_substyles) — per resolver (match arba pending) ──
  // NEBEKURIA šiukšlinių/dublikatinių substilių: fuzzy match prieš taksonomiją,
  // nerasti → 'pending' priskirti atlikėjo žanrui (review /admin/substiliai).
  if (fieldOn('substyles')) {
    const artistGenreId = (p.genre_group && GENRE_GROUPS.includes(p.genre_group as any))
      ? GENRE_IDS[p.genre_group] : null
    const subRows = await loadSubstyleRows(sb)
    for (const name of p.genres || []) {
      if (!name?.trim()) continue
      try {
        const r = await resolveSubstyle(sb, name, subRows, { artistGenreId, source: 'json_import' })
        if (!r.id) {
          if (r.reason === 'garbage') warnings.push(`Sub-stilius "${name}" atmestas (panašu į parse klaidą).`)
          continue
        }
        if (r.created) warnings.push(`Naujas sub-stilius "${name}" → laukia peržiūros (/admin/substiliai).`)
        const { data: existsLink } = await sb.from('artist_substyles').select('artist_id').eq('artist_id', artistId).eq('substyle_id', r.id).maybeSingle()
        if (!existsLink) await sb.from('artist_substyles').insert({ artist_id: artistId, substyle_id: r.id })
      } catch (e: any) { warnings.push(`Sub-stilius "${name}" nepavyko: ${e.message}`) }
    }
  }

  // ── Kontaktai ── (tik LT atlikėjams — vadybininkų bazė)
  let applyCountry: string | null = p.country ?? null
  if (!applyCountry) {
    const { data: ac } = await sb.from('artists').select('country').eq('id', artistId).maybeSingle()
    applyCountry = ac?.country ?? null
  }
  const skipContacts = isNonLithuanian(applyCountry)
  if (skipContacts && (payload.contacts || []).length) {
    warnings.push(`Ne LT atlikėjas (${applyCountry}) — ${(payload.contacts || []).length} kontaktai praleisti.`)
  }
  const contactsArr = skipContacts ? [] : (payload.contacts || [])
  for (let ci = 0; ci < contactsArr.length; ci++) {
    if (!contactOn(ci)) continue
    const c = contactsArr[ci]
    const type = c.type && CONTACT_TYPES.includes(c.type) ? c.type : 'general'
    const conf = c.confidence && CONFIDENCE_VALUES.includes(c.confidence) ? c.confidence : 'medium'
    const email = c.email || null
    let existingId: string | null = null
    if (email) {
      const { data: dup } = await sb.from('artist_contacts').select('id').eq('artist_id', artistId).eq('type', type).ilike('email', email).maybeSingle()
      existingId = dup?.id ?? null
    } else if (c.url) {
      const { data: dup } = await sb.from('artist_contacts').select('id').eq('artist_id', artistId).eq('type', type).eq('url', c.url).maybeSingle()
      existingId = dup?.id ?? null
    }
    const row = { artist_id: artistId, name: c.name || null, type, email, phone: c.phone || null, url: c.url || null, confidence: conf, source: 'json_import', updated_at: new Date().toISOString() }
    if (existingId) {
      const { error } = await sb.from('artist_contacts').update(row).eq('id', existingId)
      if (!error) summary.contacts_updated++
      else warnings.push(`Kontaktas update nepavyko: ${error.message}`)
    } else {
      const { error } = await sb.from('artist_contacts').insert(row)
      if (!error) summary.contacts_added++
      else warnings.push(`Kontaktas insert nepavyko: ${error.message}`)
    }
  }

  // ── Albumai ──
  const albumIdByTitle: Record<string, number> = {}
  const albumsArr = payload.albums || []
  for (let ai = 0; ai < albumsArr.length; ai++) {
    if (!albumOn(ai)) continue
    const a = albumsArr[ai]
    if (!a?.title) continue
    const parts = parseDateParts(a.release_date)
    const year = a.release_year ?? parts.year
    const slug = albumSlug(a.title, year)
    const newDescription = a.description?.trim() || null
    // Type flags
    const typeFlags: Record<string, boolean> = {}
    if (a.type && ALBUM_TYPE_FLAG[a.type]) typeFlags[ALBUM_TYPE_FLAG[a.type]] = true
    // Spotify id iš URL
    const spotifyId = a.spotify_url?.match(/album\/([A-Za-z0-9]+)/)?.[1] || null
    // Viršelis: pirmenybė JSON'e pateiktam cover_image_url (pvz. Bandcamp/Discogs),
    // fallback — Spotify oEmbed (be auth). Anksčiau buvo naudojamas TIK Spotify, todėl
    // albumai be spotify_url likdavo be viršelio, nors JSON'e cover_image_url buvo.
    let albumCover = a.cover_image_url?.trim() || null
    if (!albumCover) albumCover = await fetchSpotifyThumb(a.spotify_url)

    // Albumo atlikėjai (bendri/kolab): a.album_artists arba išvesta iš dainų.
    // Resolve į id (sukuria stub'us jei reikia), pirmas = pagrindinis savininkas.
    const albumArtistNames = deriveAlbumArtists(a, payload.tracks || [], p.name)
    const albumArtistIds: number[] = []
    for (const nm of albumArtistNames) {
      const aid = await findOrCreateArtist(sb, nm)
      if (aid && !albumArtistIds.includes(aid)) albumArtistIds.push(aid)
    }
    if (artistId && !albumArtistIds.includes(artistId)) albumArtistIds.push(artistId)
    const ownerCandidates = Array.from(new Set(albumArtistIds.length ? albumArtistIds : [artistId!]))
    const primaryOwnerId = albumArtistIds[0] ?? artistId!

    // Cross-artist paieška: albumas gali priklausyti BET KURIAM iš albumo atlikėjų
    // (pvz. „Neriuos" jau sukurtas thelastsunday, importuojam Jausmę) → pernaudojam,
    // nedubliuojam. Slug, tada title fallback. Spotify ID — tik kaip papildomas
    // patikrinimas (jei skiriasi → laikom skirtingu albumu).
    let existingAl: any = null
    {
      const { data } = await sb.from('albums').select('id, artist_id, year, month, day, spotify_id, cover_image_url, description').in('artist_id', ownerCandidates).eq('slug', slug).limit(1)
      existingAl = (data || [])[0] || null
    }
    if (!existingAl) {
      const { data } = await sb.from('albums').select('id, artist_id, year, month, day, spotify_id, cover_image_url, description').in('artist_id', ownerCandidates).ilike('title', a.title).limit(1)
      existingAl = (data || [])[0] || null
    }
    if (existingAl && existingAl.spotify_id && spotifyId && existingAl.spotify_id !== spotifyId) {
      warnings.push(`Albumas "${a.title}": Spotify ID nesutampa su esamu — laikoma skirtingu albumu.`)
      existingAl = null
    }

    if (existingAl) {
      // FILL missing fields (neperrašom esamų); APRAŠYMAS perrašomas jei pateiktas.
      const upd: Record<string, any> = {}
      if (!existingAl.year && year) upd.year = year
      if (!existingAl.month && parts.month) upd.month = parts.month
      if (!existingAl.day && parts.day) upd.day = parts.day
      if (!existingAl.spotify_id && spotifyId) upd.spotify_id = spotifyId
      if (!existingAl.cover_image_url && albumCover) upd.cover_image_url = albumCover
      if (newDescription && newDescription !== (existingAl.description || null)) upd.description = newDescription
      Object.assign(upd, typeFlags)
      if (Object.keys(upd).length) {
        const { error } = await sb.from('albums').update(upd).eq('id', existingAl.id)
        if (!error) summary.albums_updated++
        else warnings.push(`Albumas "${a.title}" update nepavyko: ${error.message}`)
      }
      albumIdByTitle[normalizeName(a.title)] = existingAl.id
      await linkAlbumArtists(sb, existingAl.id, albumArtistIds, false, warnings)
    } else if (descriptionOnly) {
      // Album_description režimas NEKURIA naujų albumų — tik enrichina esamus.
      warnings.push(`Albumas "${a.title}" nerastas pas atlikėją — aprašymas nepritaikytas (naujas albumas nesukurtas).`)
    } else {
      const insert: Record<string, any> = {
        title: a.title, slug, artist_id: primaryOwnerId,
        year, month: parts.month, day: parts.day,
        cover_image_url: albumCover,
        description: newDescription,
        spotify_id: spotifyId, source: 'json_import', ...typeFlags,
      }
      const { data: newAl, error } = await sb.from('albums').insert(insert).select('id').single()
      if (!error && newAl) {
        summary.albums_created++
        albumIdByTitle[normalizeName(a.title)] = newAl.id
        await linkAlbumArtists(sb, newAl.id, albumArtistIds, true, warnings)
      }
      else warnings.push(`Albumas "${a.title}" insert nepavyko: ${error?.message}`)
    }
  }

  // ── Dainos ──
  const tracksArr = payload.tracks || []
  for (let ti = 0; ti < tracksArr.length; ti++) {
    if (!trackOn(ti)) continue
    const t = tracksArr[ti]
    if (!t?.title) continue
    const map = (t.type && TRACK_TYPE_MAP[t.type]) || TRACK_TYPE_MAP.album_track
    const parts = parseDateParts(t.release_date)
    // Leidybos info: pirmenybė aiškiems laukams (release_year/month/day), fallback
    // — iš release_date išparsinta data. Anksčiau būdavo naudojama TIK release_date,
    // todėl singlai (be release_date, tik su release_year) prarasdavo metus.
    const relYear = t.release_year ?? parts.year
    const relMonth = t.release_month ?? parts.month
    const relDay = t.release_day ?? parts.day
    // NB: tracks lentelė NETURI 'duration' stulpelio (net albumų flow jo nesaugo),
    // todėl trukmės į DB nerašom — tik rodom preview'e informacijai.
    const spotifyId = t.spotify_url?.match(/track\/([A-Za-z0-9]+)/)?.[1] || null
    const trackCover = await fetchSpotifyThumb(t.spotify_url)

    // Resolve album id
    let albumId: number | null = null
    if (t.album_title) {
      const norm = normalizeName(t.album_title)
      if (albumIdByTitle[norm]) albumId = albumIdByTitle[norm]
      else {
        const { data: al } = await sb.from('albums').select('id').eq('artist_id', artistId).ilike('title', t.album_title).maybeSingle()
        if (al?.id) { albumId = al.id; albumIdByTitle[norm] = al.id }
      }
    }

    // Album-aware dedup (žr. lib/track-dedup.ts): „Intro" albume A ≠ „Intro"
    // albume B → skirtingos dainos; to paties albumo/singlo kartotė (net su -N slug
    // galūne ar JSON'e pasikartojanti) → sujungiama.
    let trackId: number | null = null
    const existingTrackId = await resolveExistingTrackId(sb, artistId as number, t.title, albumId)
    let existingTr: { id: number; release_date: string | null; release_year: number | null; spotify_id: string | null; cover_url: string | null } | null = null
    if (existingTrackId) {
      const { data } = await sb.from('tracks').select('id, release_date, release_year, spotify_id, cover_url').eq('id', existingTrackId).maybeSingle()
      existingTr = data as any
    }
    if (existingTr) {
      trackId = existingTr.id
      const upd: Record<string, any> = {}
      if (!existingTr.release_date && t.release_date) upd.release_date = t.release_date
      if (!existingTr.release_year && relYear) upd.release_year = relYear
      if (relMonth) upd.release_month = relMonth
      if (relDay) upd.release_day = relDay
      if (!existingTr.spotify_id && spotifyId) upd.spotify_id = spotifyId
      if (!existingTr.cover_url && trackCover) upd.cover_url = trackCover
      if (map.is_single) upd.is_single = true
      if (Object.keys(upd).length) {
        const { error } = await sb.from('tracks').update(upd).eq('id', trackId)
        if (!error) summary.tracks_updated++
      }
    } else {
      let baseSlug = slugify(t.title)
      let slug = baseSlug
      let suffix = 1
      while (true) {
        const { data: sc } = await sb.from('tracks').select('id').eq('slug', slug).maybeSingle()
        if (!sc) break
        slug = `${baseSlug}-${suffix++}`
      }
      const insert: Record<string, any> = {
        title: t.title, slug, artist_id: artistId, type: map.type, is_single: map.is_single,
        release_date: t.release_date || null,
        release_year: relYear, release_month: relMonth, release_day: relDay,
        cover_url: trackCover,
        spotify_id: spotifyId, source: 'json_import',
      }
      const { data: newTr, error } = await sb.from('tracks').insert(insert).select('id').single()
      if (!error && newTr) { trackId = newTr.id; summary.tracks_created++ }
      else { warnings.push(`Daina "${t.title}" insert nepavyko: ${error?.message}`); continue }
    }

    // Link to album
    if (trackId && albumId) {
      const { data: link } = await sb.from('album_tracks').select('track_id').eq('album_id', albumId).eq('track_id', trackId).maybeSingle()
      if (!link) {
        await sb.from('album_tracks').insert({ album_id: albumId, track_id: trackId, position: t.track_number ?? null, is_primary: map.is_single })
      }
    }

    // Featuring + papildomi primary artistai
    if (trackId) {
      const feats = (t.featured_artists || []).map(f => f.name).filter(Boolean)
      for (const fn of feats) {
        const fid = await findOrCreateArtist(sb, fn)
        if (fid) {
          const { error } = await sb.from('track_artists').upsert({ track_id: trackId, artist_id: fid, is_primary: false }, { onConflict: 'track_id,artist_id' })
          if (!error) summary.featuring_linked++
        }
      }
      // primary_artists: pirmas = pats atlikėjas, kiti → is_primary collab
      const primaries = (t.primary_artists || []).map(f => f.name).filter(Boolean)
      for (const pn of primaries) {
        if (normalizeName(pn) === normalizeName(p.name)) continue
        const pid = await findOrCreateArtist(sb, pn)
        if (pid) {
          await sb.from('track_artists').upsert({ track_id: trackId, artist_id: pid, is_primary: true }, { onConflict: 'track_id,artist_id' })
          summary.featuring_linked++
        }
      }
    }
  }

  // ── Galerijos nuotraukos (artist_photos) ──
  // Įrašom pasirinktas nuotraukas NENAIKINDAMI esamų (append + dedup pagal url),
  // tvarkydami fotografą/licenciją kaip photos-append endpoint'e. Sort_order —
  // po esamų. is_active=true (admin sąmoningai importuoja).
  summary.images_logged = (payload.images || []).length
  const imagesArr = payload.images || []
  // Kandidatai profilio/hero nuotraukai (jei atlikėjas jų dar neturi): pirmenybė
  // is_primary nuotraukai, kitaip — pirma sėkmingai pridėta.
  let firstAddedUrl: string | null = null
  let primaryAddedUrl: string | null = null
  if (imagesArr.length) {
    const { data: existingPh } = await sb.from('artist_photos').select('url, sort_order').eq('artist_id', artistId)
    const seenUrls = new Set<string>((existingPh || []).map((r: any) => r.url))
    let nextSort = (existingPh || []).reduce((mx: number, r: any) => Math.max(mx, r.sort_order ?? 0), -1) + 1
    for (let ii = 0; ii < imagesArr.length; ii++) {
      if (!imageOn(ii)) continue
      const n = normalizeImportImage(imagesArr[ii])
      if (!n.validUrl) { summary.images_skipped++; continue }
      if (seenUrls.has(n.url)) { summary.images_skipped++; continue }
      seenUrls.add(n.url)
      // Atribucija: author, kitaip credit (pvz. „Katarsis"). Iš jos atskiriam
      // vardą + galimą licenciją („Vardas · CC BY"). Aiški license laukas nugali.
      const attribution = n.author || n.credit || ''
      const fromAuthor = splitAuthorLicense(attribution)
      const authorName = fromAuthor.name
      const license = n.license || fromAuthor.license || null
      let photographerId: number | null = null
      try { photographerId = authorName ? await resolvePhotographerId(sb, authorName, n.sourceUrl) : null } catch { photographerId = null }
      // caption stulpelis: JSON {a:autorius, s:šaltinio nuoroda, c:aprašymas} —
      // encodeCaption/decodeCaption formatas (žr. lib/supabase-artists.ts).
      const capObj: Record<string, string> = {}
      if (authorName) capObj.a = authorName
      if (n.sourceUrl) capObj.s = n.sourceUrl
      if (n.caption) capObj.c = n.caption
      const caption = Object.keys(capObj).length ? JSON.stringify(capObj) : null
      const { error } = await sb.from('artist_photos').insert({
        artist_id: artistId,
        url: n.url,
        caption,
        photographer_id: photographerId,
        license,
        source_url: n.sourceUrl,
        sort_order: nextSort++,
        is_active: true,
      })
      if (!error) {
        summary.images_added++
        if (!firstAddedUrl) firstAddedUrl = n.url
        if (n.isPrimary && !primaryAddedUrl) primaryAddedUrl = n.url
      }
      else { summary.images_skipped++; warnings.push(`Nuotrauka insert nepavyko (${n.url}): ${error.message}`) }
    }
  }

  // ── Profilio + hero nuotrauka (jei dar nenustatyta) ──
  // Jei atlikėjas neturi NEI profilio (cover_image_url), NEI hero
  // (cover_image_wide_url), nauja importuota nuotrauka tampa abiem.
  const heroProfileUrl = primaryAddedUrl || firstAddedUrl
  if (heroProfileUrl) {
    const { data: artRow } = await sb.from('artists').select('cover_image_url, cover_image_wide_url').eq('id', artistId).maybeSingle()
    const hasProfile = !!(artRow?.cover_image_url && String(artRow.cover_image_url).trim())
    const hasHero = !!(artRow?.cover_image_wide_url && String(artRow.cover_image_wide_url).trim())
    if (!hasProfile && !hasHero) {
      const { error } = await sb.from('artists')
        .update({ cover_image_url: heroProfileUrl, cover_image_wide_url: heroProfileUrl, cover_image_position: 'center 20%' })
        .eq('id', artistId)
      if (!error) {
        summary.profile_set = true
        summary.hero_set = true
        warnings.push('Nauja nuotrauka nustatyta kaip profilio ir hero (atlikėjas jų neturėjo).')
      } else warnings.push(`Profilio/hero nuotraukos nustatymas nepavyko: ${error.message}`)
    }
  }

  // ── Audit log ──
  try {
    await sb.from('artist_imports').insert({
      artist_id: artistId, artist_name: p.name, created,
      source_json: payload, summary, warnings, imported_by: opts.importedBy || null,
    })
  } catch (e: any) { warnings.push(`Audit log įrašas nepavyko: ${e.message}`) }

  return summary
}
