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

// ── Tipai ─────────────────────────────────────────────────────────────────────
export interface ImportLink { platform: string; url: string }
export interface ImportContact {
  name?: string; type?: string; email?: string | null
  phone?: string | null; url?: string | null; confidence?: string
}
export interface ImportFeatured { name: string }
export interface ImportAlbum {
  title: string; source_title?: string; type?: string
  release_date?: string | null; release_year?: number | null
  total_tracks?: number | null
  spotify_url?: string | null; apple_music_url?: string | null; deezer_url?: string | null
}
export interface ImportTrack {
  title: string; source_title?: string
  album_title?: string | null; source_album_title?: string | null
  type?: string; track_number?: number | null
  release_date?: string | null
  featured_artists?: ImportFeatured[]
  primary_artists?: ImportFeatured[]
  spotify_url?: string | null
}
export interface ImportImage {
  type?: string; url: string; source?: string
  author?: string; license?: string; credit?: string
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

  const patch = obj.artist_patch
  if (!patch || typeof patch !== 'object') {
    errors.push('Trūksta "artist_patch" objekto')
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
export interface FieldDiff { field: string; label: string; old: any; new: any; changed: boolean }
export interface LinkDiff { platform: string; column: string | null; oldUrl: string | null; newUrl: string; action: 'add' | 'update' | 'unchanged' | 'unsupported' }
export interface ContactPlan { name: string; type: string; email: string | null; phone: string | null; url: string | null; confidence: string; action: 'add' | 'update'; isPotential: boolean }
export interface AlbumPlan { title: string; type: string | null; year: number | null; action: 'create' | 'update'; existingId: number | null }
export interface TrackPlan { title: string; albumTitle: string | null; type: string | null; action: 'create' | 'update'; existingId: number | null; albumFound: boolean; featuring: string[]; featuringNew: string[] }
export interface ImagePlan { url: string; type: string | null; license: string | null; hasLicense: boolean; action: 'review' | 'skip' }

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
  const addDiff = (field: string, label: string, oldV: any, newV: any) => {
    if (newV === undefined || newV === null || newV === '') return
    fieldDiffs.push({ field, label, old: oldV ?? null, new: newV, changed: String(oldV ?? '') !== String(newV ?? '') })
  }
  addDiff('name', 'Vardas', existing?.name, p.name)
  if (newType) addDiff('type', 'Tipas', existing?.type, newType)
  addDiff('country', 'Šalis', existing?.country, p.country)
  addDiff('birth_date', 'Gimimo data', existing?.birth_date, p.birth_date)
  addDiff('active_from', 'Aktyvus nuo', existing?.active_from, p.active_year_start)
  addDiff('active_until', 'Aktyvus iki', existing?.active_until, p.active_year_end)
  if (p.is_active !== undefined) addDiff('is_active', 'Aktyvus', existing?.is_active, p.is_active)
  addDiff('gender', 'Lytis', existing?.gender, p.gender)
  addDiff('genre_group', 'Stiliaus grupė', existingGenre, p.genre_group)
  if (p.genres && p.genres.length) addDiff('substyles', 'Sub-stiliai', existingSubstyles.join(', '), p.genres.join(', '))
  addDiff('description', 'Bio', existing?.description ? `${String(existing.description).slice(0, 120)}…` : null, p.bio ? `${p.bio.slice(0, 120)}…` : null)

  // genre_group validacija
  if (p.genre_group && !GENRE_GROUPS.includes(p.genre_group as any)) {
    warnings.push(`Neteisinga genre_group "${p.genre_group}" — turi būti viena iš 8 Music.lt stilių. Nebus pritaikyta.`)
  }

  // ── Link diffs ──
  const linkDiffs: LinkDiff[] = []
  for (const l of payload.links || []) {
    if (!l?.platform || !l?.url) continue
    const col = LINK_COLUMN_MAP[l.platform] || null
    if (!col) {
      linkDiffs.push({ platform: l.platform, column: null, oldUrl: null, newUrl: l.url, action: 'unsupported' })
      warnings.push(`Link platforma "${l.platform}" dar neturi DB stulpelio — praleidžiama (galima sugretinti vėliau).`)
      continue
    }
    const oldUrl = existing?.[col] || null
    const action: LinkDiff['action'] = !oldUrl ? 'add' : (oldUrl === l.url ? 'unchanged' : 'update')
    linkDiffs.push({ platform: l.platform, column: col, oldUrl, newUrl: l.url, action })
  }

  // ── Contact plans ──
  const contactPlans: ContactPlan[] = []
  let existingContacts: any[] = []
  if (targetArtistId) {
    const { data: cs } = await sb.from('artist_contacts').select('id, type, email, url, name').eq('artist_id', targetArtistId)
    existingContacts = cs || []
  }
  for (const c of payload.contacts || []) {
    const type = c.type && CONTACT_TYPES.includes(c.type) ? c.type : 'general'
    if (c.type && !CONTACT_TYPES.includes(c.type)) warnings.push(`Nežinomas kontakto type "${c.type}" — saugoma kaip "general".`)
    const conf = c.confidence && CONFIDENCE_VALUES.includes(c.confidence) ? c.confidence : 'medium'
    const isPotential = !c.email && !c.phone
    const dup = existingContacts.find(ec =>
      ec.type === type && ((c.email && ec.email && ec.email.toLowerCase() === c.email.toLowerCase()) ||
        (!c.email && ec.url && c.url && ec.url === c.url))
    )
    contactPlans.push({
      name: c.name || '', type, email: c.email || null, phone: c.phone || null,
      url: c.url || null, confidence: conf, action: dup ? 'update' : 'add', isPotential,
    })
    if (isPotential && (c.name || c.url)) warnings.push(`Kontaktas "${c.name || c.url}" be email/telefono — saugoma kaip potencialus lead'as.`)
  }

  // ── Album plans ──
  const albumPlans: AlbumPlan[] = []
  const albumIdByTitle: Record<string, number> = {}
  for (const a of payload.albums || []) {
    if (!a?.title) continue
    const parts = parseDateParts(a.release_date)
    const year = a.release_year ?? parts.year
    if (a.type && !ALBUM_TYPE_FLAG[a.type]) warnings.push(`Nežinomas albumo type "${a.type}" (${a.title}) — type flag nebus nustatytas.`)
    let existingId: number | null = null
    if (targetArtistId) {
      const slug = albumSlug(a.title, year)
      const { data: al } = await sb.from('albums').select('id').eq('artist_id', targetArtistId).eq('slug', slug).maybeSingle()
      existingId = al?.id ?? null
      if (!existingId) {
        const { data: byTitle } = await sb.from('albums').select('id').eq('artist_id', targetArtistId).ilike('title', a.title).maybeSingle()
        existingId = byTitle?.id ?? null
      }
    }
    if (existingId) albumIdByTitle[normalizeName(a.title)] = existingId
    albumPlans.push({ title: a.title, type: a.type || null, year, action: existingId ? 'update' : 'create', existingId })
  }

  // ── Track plans ──
  const trackPlans: TrackPlan[] = []
  const albumTitlesInPayload = new Set((payload.albums || []).map(a => normalizeName(a.title)))
  for (const t of payload.tracks || []) {
    if (!t?.title) continue
    if (t.type && !TRACK_TYPE_MAP[t.type]) warnings.push(`Nežinomas dainos type "${t.type}" (${t.title}) — saugoma kaip "normal".`)
    const albumTitle = t.album_title || null
    let albumFound = false
    if (albumTitle) {
      const normAlb = normalizeName(albumTitle)
      if (albumIdByTitle[normAlb] || albumTitlesInPayload.has(normAlb)) albumFound = true
      else if (targetArtistId) {
        const { data: al } = await sb.from('albums').select('id').eq('artist_id', targetArtistId).ilike('title', albumTitle).maybeSingle()
        albumFound = !!al?.id
        if (al?.id) albumIdByTitle[normAlb] = al.id
      }
      if (!albumFound) warnings.push(`Daina "${t.title}": albumas "${albumTitle}" nerastas — daina bus sukurta be albumo prijungimo.`)
    }
    let existingId: number | null = null
    if (targetArtistId) {
      const { data: tr } = await sb.from('tracks').select('id').eq('artist_id', targetArtistId).eq('slug', slugify(t.title)).maybeSingle()
      existingId = tr?.id ?? null
    }
    const featuring = (t.featured_artists || []).map(f => f.name).filter(Boolean)
    const featuringNew: string[] = []
    for (const fn of featuring) {
      const { data: faRows } = await sb.from('artists').select('id').or(`slug.eq.${slugify(fn)},name.ilike.${fn}`).limit(1)
      if (!faRows || faRows.length === 0) { featuringNew.push(fn); warnings.push(`Featuring "${fn}" (${t.title}) nerastas — bus sukurtas naujas atlikėjas.`) }
    }
    trackPlans.push({
      title: t.title, albumTitle, type: t.type || null,
      action: existingId ? 'update' : 'create', existingId, albumFound, featuring, featuringNew,
    })
  }

  // ── Image plans ──
  const imagePlans: ImagePlan[] = []
  for (const img of payload.images || []) {
    if (!img?.url) continue
    const hasLicense = !!(img.license && img.license.trim())
    imagePlans.push({ url: img.url, type: img.type || null, license: img.license || null, hasLicense, action: hasLicense ? 'review' : 'skip' })
    if (!hasLicense) warnings.push(`Paveikslėlis be aiškios licencijos — praleidžiamas: ${img.url}`)
  }
  if ((payload.images || []).length) {
    warnings.push('Paveikslėliai NĖRA automatiškai nustatomi kaip cover (Wikimedia „File:" puslapiai nėra tiesioginiai image URL) — peržiūrėk ir įkelk rankiniu būdu.')
  }

  return {
    match, willCreateArtist, targetArtistId,
    fieldDiffs, linkDiffs, contactPlans, albumPlans, trackPlans, imagePlans, warnings,
  }
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
  warnings: string[]
}

export async function applyImport(
  sb: SupabaseClient,
  payload: ArtistImportPayload,
  opts: { forceArtistId?: number | null; importedBy?: string } = {}
): Promise<ApplySummary> {
  const p = payload.artist_patch
  const warnings: string[] = []
  const summary: ApplySummary = {
    artist_id: 0, created: false, fields_updated: 0, links_updated: 0,
    contacts_added: 0, contacts_updated: 0, albums_created: 0, albums_updated: 0,
    tracks_created: 0, tracks_updated: 0, featuring_linked: 0, images_logged: 0, warnings,
  }

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

  // Build artist column payload (tik pateikti laukai + linkai į stulpelius)
  const col: Record<string, any> = {}
  if (p.country !== undefined) col.country = p.country
  if (p.type) col.type = ARTIST_TYPE_MAP[p.type] || 'group'
  if (p.birth_date) col.birth_date = p.birth_date
  if (p.active_year_start !== undefined && p.active_year_start !== null) col.active_from = p.active_year_start
  if (p.active_year_end !== undefined && p.active_year_end !== null) col.active_until = p.active_year_end
  if (p.is_active !== undefined) col.is_active = p.is_active
  if (p.gender) col.gender = p.gender
  if (p.bio) col.description = p.bio
  for (const l of payload.links || []) {
    if (!l?.platform || !l?.url) continue
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
  if (p.genre_group && GENRE_GROUPS.includes(p.genre_group as any)) {
    const gid = GENRE_IDS[p.genre_group]
    if (gid) {
      await sb.from('artist_genres').delete().eq('artist_id', artistId)
      const { error } = await sb.from('artist_genres').insert({ artist_id: artistId, genre_id: gid })
      if (error) warnings.push(`Stiliaus grupės nustatymas nepavyko: ${error.message}`)
    }
  } else if (p.genre_group) {
    warnings.push(`genre_group "${p.genre_group}" neteisinga — praleista.`)
  }

  // ── Sub-stiliai (artist_substyles) — union ──
  for (const name of p.genres || []) {
    if (!name?.trim()) continue
    try {
      let { data: sr } = await sb.from('substyles').select('id').eq('name', name).maybeSingle()
      if (!sr) {
        const { data: ns } = await sb.from('substyles').insert({ name, slug: slugify(name) }).select('id').single()
        sr = ns
      }
      if (sr?.id) {
        const { data: existsLink } = await sb.from('artist_substyles').select('artist_id').eq('artist_id', artistId).eq('substyle_id', sr.id).maybeSingle()
        if (!existsLink) await sb.from('artist_substyles').insert({ artist_id: artistId, substyle_id: sr.id })
      }
    } catch (e: any) { warnings.push(`Sub-stilius "${name}" nepavyko: ${e.message}`) }
  }

  // ── Kontaktai ──
  for (const c of payload.contacts || []) {
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
  for (const a of payload.albums || []) {
    if (!a?.title) continue
    const parts = parseDateParts(a.release_date)
    const year = a.release_year ?? parts.year
    const slug = albumSlug(a.title, year)
    // Type flags
    const typeFlags: Record<string, boolean> = {}
    if (a.type && ALBUM_TYPE_FLAG[a.type]) typeFlags[ALBUM_TYPE_FLAG[a.type]] = true
    // Spotify id iš URL
    const spotifyId = a.spotify_url?.match(/album\/([A-Za-z0-9]+)/)?.[1] || null

    let { data: existingAl } = await sb.from('albums').select('id, year, month, day, spotify_id').eq('artist_id', artistId).eq('slug', slug).maybeSingle()
    if (!existingAl) {
      const { data: byTitle } = await sb.from('albums').select('id, year, month, day, spotify_id').eq('artist_id', artistId).ilike('title', a.title).maybeSingle()
      existingAl = byTitle
    }
    if (existingAl) {
      // FILL missing fields (neperrašom esamų)
      const upd: Record<string, any> = {}
      if (!existingAl.year && year) upd.year = year
      if (!existingAl.month && parts.month) upd.month = parts.month
      if (!existingAl.day && parts.day) upd.day = parts.day
      if (!existingAl.spotify_id && spotifyId) upd.spotify_id = spotifyId
      Object.assign(upd, typeFlags)
      if (Object.keys(upd).length) {
        const { error } = await sb.from('albums').update(upd).eq('id', existingAl.id)
        if (!error) summary.albums_updated++
      }
      albumIdByTitle[normalizeName(a.title)] = existingAl.id
    } else {
      const insert: Record<string, any> = {
        title: a.title, slug, artist_id: artistId,
        year, month: parts.month, day: parts.day,
        spotify_id: spotifyId, source: 'json_import', ...typeFlags,
      }
      const { data: newAl, error } = await sb.from('albums').insert(insert).select('id').single()
      if (!error && newAl) { summary.albums_created++; albumIdByTitle[normalizeName(a.title)] = newAl.id }
      else warnings.push(`Albumas "${a.title}" insert nepavyko: ${error?.message}`)
    }
  }

  // ── Dainos ──
  for (const t of payload.tracks || []) {
    if (!t?.title) continue
    const map = (t.type && TRACK_TYPE_MAP[t.type]) || TRACK_TYPE_MAP.album_track
    const parts = parseDateParts(t.release_date)
    const spotifyId = t.spotify_url?.match(/track\/([A-Za-z0-9]+)/)?.[1] || null

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

    // Find/insert track
    let trackId: number | null = null
    const { data: existingTr } = await sb.from('tracks').select('id, release_date, release_year, spotify_id').eq('artist_id', artistId).eq('slug', slugify(t.title)).maybeSingle()
    if (existingTr) {
      trackId = existingTr.id
      const upd: Record<string, any> = {}
      if (!existingTr.release_date && t.release_date) upd.release_date = t.release_date
      if (!existingTr.release_year && parts.year) upd.release_year = parts.year
      if (parts.month) upd.release_month = parts.month
      if (parts.day) upd.release_day = parts.day
      if (!existingTr.spotify_id && spotifyId) upd.spotify_id = spotifyId
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
        release_year: parts.year, release_month: parts.month, release_day: parts.day,
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

  // ── Images — tik suskaičiuojam (logged į source_json), neaplikuojam ──
  summary.images_logged = (payload.images || []).filter(i => i?.license).length

  // ── Audit log ──
  try {
    await sb.from('artist_imports').insert({
      artist_id: artistId, artist_name: p.name, created,
      source_json: payload, summary, warnings, imported_by: opts.importedBy || null,
    })
  } catch (e: any) { warnings.push(`Audit log įrašas nepavyko: ${e.message}`) }

  return summary
}
