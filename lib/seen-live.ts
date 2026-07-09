// lib/seen-live.ts
// ────────────────────────────────────────────────────────────────────────────
// „Matyti gyvai" — nariai susideda atlikėjus, kuriuos matė koncertuose,
// nebūtinai susietus su konkrečiu renginiu. Jei atlikėjo/renginio dar nėra DB —
// įrašas tampa DRAFT (status='pending'), kurį adminai patvirtina/koreguoja.
//
// Modeliuota pagal event_candidates (draft → promote) konvenciją. Visi rašymai
// eina per service-role klientą (createAdminClient) API route'uose.
// ────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase'
import { createEvent, setEventArtists } from '@/lib/supabase-events'
import { slugify } from '@/lib/slugify'

export type SeenLiveStatus = 'approved' | 'pending' | 'rejected'

// ── Nario įrašo forma (POST /api/mano-muzika/seen-live) ─────────────────────
export type SeenLiveInput = {
  // Atlikėjas: arba esamas (artist_id), arba pasiūlytas naujas (raw_artist_name).
  artist_id?: number | null
  raw_artist_name?: string | null
  // Renginys (nebūtina): esamas (event_id) arba pasiūlytas naujas (raw_event_*).
  event_id?: string | null
  raw_event_title?: string | null
  raw_event_country?: string | null
  raw_event_city?: string | null
  raw_event_venue?: string | null
  // Kada matė (nebūtina).
  seen_date?: string | null   // 'YYYY-MM-DD'
  seen_year?: number | null
  note?: string | null
}

// Nario „Mano muzika" sąrašo eilutė (įskaitant pending/rejected).
export type SeenLiveRow = {
  id: number
  status: SeenLiveStatus
  artist: { id: number; name: string; slug: string; cover_image_url: string | null } | null
  raw_artist_name: string | null
  event: { id: string; title: string; slug: string; start_date: string | null; city: string | null } | null
  raw_event_title: string | null
  raw_event_country: string | null
  raw_event_city: string | null
  raw_event_venue: string | null
  seen_date: string | null
  seen_year: number | null
  note: string | null
  created_at: string
  reject_reason: string | null
}

const ROW_SELECT = `
  id, status, raw_artist_name, raw_event_title, raw_event_country, raw_event_city,
  raw_event_venue, seen_date, seen_year, note, created_at, reject_reason,
  artist:artist_id ( id, name, slug, cover_image_url ),
  event:event_id ( id, title, slug, start_date, city )
`

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

function mapRow(r: any): SeenLiveRow {
  return {
    id: r.id,
    status: r.status,
    artist: one(r.artist),
    raw_artist_name: r.raw_artist_name ?? null,
    event: one(r.event),
    raw_event_title: r.raw_event_title ?? null,
    raw_event_country: r.raw_event_country ?? null,
    raw_event_city: r.raw_event_city ?? null,
    raw_event_venue: r.raw_event_venue ?? null,
    seen_date: r.seen_date ?? null,
    seen_year: r.seen_year ?? null,
    note: r.note ?? null,
    created_at: r.created_at,
    reject_reason: r.reject_reason ?? null,
  }
}

const clean = (v: any): string | null => {
  if (v == null) return null
  const s = String(v).trim()
  return s.length ? s : null
}

// ── Nario sąrašas (mano-muzika) — visi statusai ─────────────────────────────
export async function getUserSeenLive(userId: string): Promise<SeenLiveRow[]> {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('profile_seen_live')
    .select(ROW_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(mapRow)
}

// ── Viešas profilio sąrašas — TIK approved ──────────────────────────────────
export async function getProfileSeenLive(userId: string): Promise<SeenLiveRow[]> {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('profile_seen_live')
    .select(ROW_SELECT)
    .eq('user_id', userId)
    .eq('status', 'approved')
    .order('seen_year', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(mapRow)
}

// ── Pridėti įrašą ───────────────────────────────────────────────────────────
// Logika:
//   - Esamas atlikėjas (+ nebūtinai esamas renginys, be naujų pasiūlymų)
//       → status='approved', iškart matosi profilyje.
//   - Pasiūlytas NAUJAS atlikėjas ARBA naujas renginys (raw_event_title be
//       event_id) → status='pending', patenka į admin eilę.
export async function addSeenLive(userId: string, input: SeenLiveInput): Promise<SeenLiveRow> {
  const sb = createAdminClient()

  const artistId = Number.isFinite(Number(input.artist_id)) && Number(input.artist_id) > 0
    ? Number(input.artist_id) : null
  const rawArtist = clean(input.raw_artist_name)
  if (!artistId && !rawArtist) throw new Error('Reikia atlikėjo')

  const eventId = clean(input.event_id)
  const rawEventTitle = clean(input.raw_event_title)
  const rawCountry = clean(input.raw_event_country)
  const rawCity = clean(input.raw_event_city)
  const rawVenue = clean(input.raw_event_venue)

  // Naujas renginys pasiūlytas jei nurodytas pavadinimas be esamo event_id,
  // arba nurodyta vieta/venue be esamo renginio.
  const proposesNewEvent = !eventId && !!(rawEventTitle || rawVenue || rawCity)

  // Draft jei: naujas atlikėjas arba naujas renginys.
  const status: SeenLiveStatus = (!artistId || proposesNewEvent) ? 'pending' : 'approved'

  let seenYear: number | null = null
  if (input.seen_year != null && Number.isFinite(Number(input.seen_year))) {
    const y = Math.trunc(Number(input.seen_year))
    if (y >= 1900 && y <= 2100) seenYear = y
  }
  const seenDate = clean(input.seen_date)
  // Jei nurodyta pilna data — išvedam metus automatiškai.
  if (!seenYear && seenDate) {
    const y = Number(seenDate.slice(0, 4))
    if (Number.isFinite(y) && y >= 1900 && y <= 2100) seenYear = y
  }

  // Dedupe: tas pats atlikėjas + renginys jau pridėtas.
  if (artistId) {
    const dupQ = sb.from('profile_seen_live').select('id').eq('user_id', userId).eq('artist_id', artistId)
    const { data: dup } = eventId
      ? await dupQ.eq('event_id', eventId).limit(1)
      : await dupQ.is('event_id', null).is('raw_event_title', null).limit(1)
    if (dup && dup.length) throw new Error('Jau pridėta')
  }

  const insert = {
    user_id: userId,
    artist_id: artistId,
    event_id: eventId,
    raw_artist_name: artistId ? null : rawArtist,
    raw_event_title: eventId ? null : rawEventTitle,
    raw_event_country: eventId ? null : rawCountry,
    raw_event_city: eventId ? null : rawCity,
    raw_event_venue: eventId ? null : rawVenue,
    seen_date: seenDate,
    seen_year: seenYear,
    note: clean(input.note),
    status,
  }

  const { data, error } = await sb
    .from('profile_seen_live')
    .insert(insert)
    .select(ROW_SELECT)
    .single()
  if (error) throw error
  return mapRow(data)
}

// ── Pašalinti savo įrašą ────────────────────────────────────────────────────
export async function removeSeenLive(userId: string, id: number): Promise<void> {
  const sb = createAdminClient()
  const { error } = await sb
    .from('profile_seen_live')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw error
}

// ── ADMIN: pending eilė ─────────────────────────────────────────────────────
export type SeenLivePending = SeenLiveRow & {
  user: { id: string; username: string | null; avatar_url: string | null } | null
}

export async function listPendingSeenLive(limit = 100): Promise<SeenLivePending[]> {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('profile_seen_live')
    .select(ROW_SELECT + `, user:user_id ( id, username, avatar_url )`)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data || []).map((r: any) => ({ ...mapRow(r), user: one(r.user) }))
}

// ── ADMIN: sukurti naują atlikėją iš pasiūlymo (minimalus) ──────────────────
async function createArtistFromRaw(name: string): Promise<number> {
  const sb = createAdminClient()
  const base = slugify(name)
  let finalSlug = base || `atlikejas-${Date.now().toString(36)}`
  const ex = await sb.from('artists').select('id').eq('slug', finalSlug).maybeSingle()
  if (ex.data) finalSlug = `${finalSlug}-${Date.now().toString(36)}`
  const { data, error } = await sb
    .from('artists')
    .insert({ name: name.trim(), slug: finalSlug, type: 'solo', type_music: true, source: 'seen_live' })
    .select('id')
    .single()
  if (error || !data) throw error || new Error('Nepavyko sukurti atlikėjo')
  return data.id as number
}

// ── ADMIN: patvirtinti / atmesti / koreguoti ────────────────────────────────
export type SeenLiveReviewOverrides = {
  // Atlikėjas: pririšti prie esamo, arba sukurti naują iš (pakoreguoto) pavadinimo.
  artist_id?: number | null
  create_artist?: boolean
  artist_name?: string | null       // pakoreguotas naujo atlikėjo pavadinimas
  // Renginys: pririšti prie esamo, sukurti naują, arba palikti be renginio.
  event_id?: string | null
  create_event?: boolean
  event_title?: string | null
  event_country?: string | null
  event_city?: string | null
  event_venue?: string | null
  event_date?: string | null        // 'YYYY-MM-DD' — reikalinga kuriant renginį
  seen_year?: number | null
  note?: string | null
}

export async function reviewSeenLive(
  id: number,
  action: 'approve' | 'reject',
  overrides: SeenLiveReviewOverrides,
  reviewerId: string,
): Promise<void> {
  const sb = createAdminClient()

  const { data: row, error: loadErr } = await sb
    .from('profile_seen_live')
    .select('*')
    .eq('id', id)
    .single()
  if (loadErr || !row) throw loadErr || new Error('Nerasta')
  if (row.status !== 'pending') throw new Error('Jau peržiūrėta')

  if (action === 'reject') {
    const { error } = await sb
      .from('profile_seen_live')
      .update({
        status: 'rejected',
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        reject_reason: clean(overrides.note) || null,
      })
      .eq('id', id)
    if (error) throw error
    return
  }

  // ── APPROVE ──
  // 1) Atlikėjas
  let artistId: number | null = row.artist_id ?? null
  if (!artistId) {
    if (overrides.artist_id && Number(overrides.artist_id) > 0) {
      artistId = Number(overrides.artist_id)
    } else if (overrides.create_artist) {
      const name = clean(overrides.artist_name) || clean(row.raw_artist_name)
      if (!name) throw new Error('Trūksta atlikėjo pavadinimo')
      artistId = await createArtistFromRaw(name)
    } else {
      throw new Error('Pririšk atlikėją arba sukurk naują')
    }
  }

  // 2) Renginys (nebūtina)
  let eventId: string | null = row.event_id ?? null
  if (!eventId) {
    if (overrides.event_id && clean(overrides.event_id)) {
      eventId = clean(overrides.event_id)
    } else if (overrides.create_event) {
      const title = clean(overrides.event_title) || clean(row.raw_event_title)
      const date = clean(overrides.event_date)
      if (!title) throw new Error('Trūksta renginio pavadinimo')
      if (!date) throw new Error('Kuriant renginį reikia datos')
      const ev = await createEvent({
        title,
        start_date: new Date(date + 'T00:00:00').toISOString(),
        city: clean(overrides.event_city) || clean(row.raw_event_city) || undefined,
        venue_name: clean(overrides.event_venue) || clean(row.raw_event_venue) || undefined,
        is_abroad: (clean(overrides.event_country) || clean(row.raw_event_country) || 'Lietuva').toLowerCase() !== 'lietuva',
        verified: true,
      }, reviewerId)
      eventId = ev?.id ?? null
      if (eventId && artistId) {
        await setEventArtists(eventId, [{ artist_id: artistId, is_headliner: true }])
      }
    }
    // else: paliekam be renginio (approved be event_id)
  }

  let seenYear: number | null = row.seen_year ?? null
  if (overrides.seen_year != null && Number.isFinite(Number(overrides.seen_year))) {
    seenYear = Math.trunc(Number(overrides.seen_year))
  }

  const { error } = await sb
    .from('profile_seen_live')
    .update({
      status: 'approved',
      artist_id: artistId,
      event_id: eventId,
      // Išvalom raw laukus kai esybės susietos (kad profilyje rodytų kanonines).
      raw_artist_name: artistId ? null : row.raw_artist_name,
      raw_event_title: eventId ? null : (clean(overrides.event_title) ?? row.raw_event_title),
      raw_event_country: eventId ? null : (clean(overrides.event_country) ?? row.raw_event_country),
      raw_event_city: eventId ? null : (clean(overrides.event_city) ?? row.raw_event_city),
      raw_event_venue: eventId ? null : (clean(overrides.event_venue) ?? row.raw_event_venue),
      seen_year: seenYear,
      note: overrides.note !== undefined ? clean(overrides.note) : row.note,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}
