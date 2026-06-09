import { createAdminClient } from '@/lib/supabase'

// Vieninga slugify utility — palaiko Unicode (visos kalbos). Žr. lib/slugify.ts.
import { slugify } from './slugify'

// ── Festivalio euristika ─────────────────────────────────────────
// Naudojama kaip atsarginis variantas, kol `events.is_festival` stulpelio dar
// nėra (migracija 20260603) arba renginys dar nepažymėtas admin'e. Pavadinimo
// raktažodžiai + kelių dienų trukmė.
const FESTIVAL_RE = /festival|fest(?:as|is|ai|ą|o)?\b|fiesta|granatos|devilstone|karkl[ėe]|positivus|bliuzo nakt|tundra|sala festival|m[ėe]nuo juodaragis|roko naktys|žalgirio nakt/i
export function festivalHeuristic(ev: { title?: string | null; start_date?: string | null; end_date?: string | null }): boolean {
  const t = (ev.title || '')
  if (FESTIVAL_RE.test(t)) return true
  if (ev.start_date && ev.end_date) {
    const days = (new Date(ev.end_date).getTime() - new Date(ev.start_date).getTime()) / 86_400_000
    if (days >= 1) return true
  }
  return false
}

// ── Get events list (public) ─────────────────────────────────────
export async function getEvents(opts: {
  city?: string
  /** Filtravimas pagal konkrečią vietą (venues.id). */
  venueId?: number
  status?: string
  period?: 'week' | 'month' | 'all'
  showPast?: boolean
  limit?: number
  offset?: number
  /** start_date rikiavimas. 'asc' (default) — soonest first (homepage).
   *  'desc' — newest first (admin'ui, kad scrape'inti 2026 renginiai būtų viršuje). */
  order?: 'asc' | 'desc'
} = {}) {
  const supabase = createAdminClient()
  const { city, venueId, status, period, showPast = false, limit = 20, offset = 0, order = 'asc' } = opts

  let q = supabase
    .from('events')
    .select(`
      id, title, slug, description, start_date, end_date,
      venue_name, venue_id, city, city_id, address, cover_image_url,
      ticket_url, price_from, price_to,
      status, is_featured, created_at,
      venues:venue_id(id, name, slug, city, address),
      event_artists(
        artist_id, is_headliner, sort_order,
        artists(id, name, slug, cover_image_url, country)
      )
    `, { count: 'exact' })
    .order('start_date', { ascending: order !== 'desc' })
    .range(offset, offset + limit - 1)

  if (!showPast) {
    // SVARBU: nepakanka filtruoti pagal `status` — daug įrašų liko 'upcoming'
    // nors data jau praėjo (statusas neatnaujinamas). Pridedam DATOS grindis:
    //   - daugiadieniai renginiai: end_date >= šiandien (LT) → dar vyksta;
    //   - vienadieniai (end_date NULL): start_date >= šiandien (LT).
    // Naudojam LT (Europe/Vilnius) dieną, kad nedingtų šiandienos vakaro
    // koncertai. 2026-06-09.
    const ltToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    q = q
      .in('status', ['upcoming', 'ongoing'])
      .or(`end_date.gte.${ltToday},and(end_date.is.null,start_date.gte.${ltToday})`)
  }
  if (status) q = q.eq('status', status)
  if (city && city !== 'Visi') q = q.eq('city', city)
  if (venueId) q = q.eq('venue_id', venueId)

  if (period === 'week') {
    const end = new Date()
    end.setDate(end.getDate() + 7)
    q = q.lte('start_date', end.toISOString())
  } else if (period === 'month') {
    const end = new Date()
    end.setMonth(end.getMonth() + 1)
    q = q.lte('start_date', end.toISOString())
  }

  const { data, error, count } = await q
  if (error) throw error

  // Žanrų praturtinimas (atskira užklausa — saugiau nei nested embed). Kiekvienam
  // renginiui prisegam jo atlikėjų žanrų sąjungą → leidžia stiliaus filtrą modale.
  const events = (data || []) as any[]
  try {
    const artistIds = Array.from(new Set(
      events.flatMap(e => (e.event_artists || []).map((ea: any) => ea.artist_id).filter(Boolean)),
    ))
    if (artistIds.length) {
      const genreByArtist = new Map<number, string[]>()
      const { data: ag } = await supabase
        .from('artist_genres')
        .select('artist_id, genres(name)')
        .in('artist_id', artistIds)
      for (const r of (ag || []) as any[]) {
        const name = r.genres?.name
        if (!name) continue
        const list = genreByArtist.get(r.artist_id) || []
        if (!list.includes(name)) list.push(name)
        genreByArtist.set(r.artist_id, list)
      }
      for (const e of events) {
        const gset = new Set<string>()
        for (const ea of e.event_artists || []) for (const g of (genreByArtist.get(ea.artist_id) || [])) gset.add(g)
        e.genres = Array.from(gset)
      }
    }
  } catch { /* žanrai nebūtini — nelaužiam renginių */ }

  // Festivalio žyma. Bandome iš `is_festival` stulpelio (migracija 20260603);
  // jei jo dar nėra — krentam į euristiką, kad puslapis nelūžtų.
  try {
    const ids = events.map(e => e.id).filter(Boolean)
    if (ids.length) {
      const { data: fest, error: fe } = await supabase
        .from('events')
        .select('id')
        .eq('is_festival', true)
        .in('id', ids)
      if (fe) throw fe
      const fset = new Set((fest || []).map((r: any) => r.id))
      for (const e of events) e.is_festival = fset.has(e.id)
    }
  } catch {
    for (const e of events) e.is_festival = festivalHeuristic(e)
  }

  return { events, total: count || 0 }
}

// ── Get featured events ──────────────────────────────────────────
export async function getFeaturedEvents(limit = 3) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('events')
    .select(`
      id, title, slug, description, start_date, end_date,
      venue_name, city, cover_image_url,
      ticket_url, price_from, price_to, status, is_featured,
      event_artists(
        artist_id, is_headliner, sort_order,
        artists(id, name, slug, cover_image_url)
      )
    `)
    .eq('is_featured', true)
    .in('status', ['upcoming', 'ongoing'])
    .order('start_date', { ascending: true })
    .limit(limit)

  if (error) throw error
  return data || []
}

// ── Get single event by slug ─────────────────────────────────────
export async function getEventBySlug(slug: string) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('events')
    .select(`
      id, title, slug, description, start_date, end_date,
      venue_name, venue_id, city, address, cover_image_url,
      ticket_url, price_from, price_to,
      status, is_featured, created_at, updated_at,
      event_artists(
        artist_id, is_headliner, sort_order,
        artists(id, name, slug, cover_image_url)
      )
    `)
    .eq('slug', slug)
    .single()

  if (error || !data) return null

  // Attendees ("Eis"/"Patiks") — atskira lentelė event_attendees.
  // Po 2026-05-28c architectural slim-down: profile data (avatar, rank)
  // dabar fetch'inami per JOIN į profiles (anksčiau buvo denormalized).
  const { data: attendeesRaw } = await supabase
    .from('event_attendees')
    .select('user_username, user_id, created_at, profiles:user_id(avatar_url, rank)')
    .eq('event_id', (data as any).id)
    .order('created_at', { ascending: false })
  const attendees = (attendeesRaw || []).map((a: any) => ({
    user_username: a.user_username,
    user_rank: a.profiles?.rank || null,
    user_avatar_url: a.profiles?.avatar_url || null,
    created_at: a.created_at,
  }))

  return { ...(data as any), attendees }
}

// ── Get single event by id ───────────────────────────────────────
export async function getEventById(id: string) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('events')
    .select(`
      id, title, slug, description, start_date, end_date,
      venue_name, venue_id, city, address, cover_image_url,
      ticket_url, price_from, price_to,
      status, is_featured, created_at, updated_at,
      event_artists(
        artist_id, is_headliner, sort_order,
        artists(id, name, slug, cover_image_url)
      )
    `)
    .eq('id', id)
    .single()

  if (error) return null

  // Festivalio žyma (atskirai — resilient, jei stulpelio dar nėra).
  try {
    const { data: f, error: fe } = await supabase.from('events').select('is_festival').eq('id', id).maybeSingle()
    if (!fe && f) (data as any).is_festival = (f as any).is_festival ?? false
  } catch { /* stulpelio dar nėra */ }

  return data
}

// ── Get events by artist ─────────────────────────────────────────
export async function getEventsByArtist(artistId: number, limit = 5) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('event_artists')
    .select(`
      event_id, is_headliner,
      events(id, title, slug, start_date, end_date, venue_name, city, cover_image_url, status, is_featured)
    `)
    .eq('artist_id', artistId)
    .order('sort_order', { ascending: true })
    .limit(limit)

  if (error) throw error
  return (data || []).map(d => ({ ...((d as any).events || {}), is_headliner: d.is_headliner }))
}

// ── Venue → įvykio vietos laukų denormalizacija ──────────────────
// Kai renginys susiejamas su `venues` įrašu, vietos laukai (venue_name,
// city, city_id, address) imami IŠ vietos — kad nebūtų desync'o tarp laisvo
// teksto ir kanoninės vietos. Grąžina patched updates objektą.
async function applyVenueFields(updates: Record<string, any>): Promise<Record<string, any>> {
  if (!updates.venue_id) return updates
  const supabase = createAdminClient()
  const { data: v } = await supabase
    .from('venues')
    .select('name, city, city_id, address')
    .eq('id', updates.venue_id)
    .maybeSingle()
  if (!v) return updates
  return {
    ...updates,
    venue_name: v.name ?? updates.venue_name ?? null,
    city: v.city ?? updates.city ?? null,
    city_id: v.city_id ?? updates.city_id ?? null,
    address: v.address ?? updates.address ?? null,
  }
}

// ── Create event (admin) ─────────────────────────────────────────
export async function createEvent(eventData: {
  title: string
  description?: string
  start_date: string
  end_date?: string
  venue_name?: string
  venue_id?: number | null
  city?: string
  city_id?: number | null
  address?: string
  cover_image_url?: string
  ticket_url?: string
  price_from?: number
  price_to?: number
  is_featured?: boolean
  is_festival?: boolean
}, userId: string) {
  const supabase = createAdminClient()

  let slug = slugify(eventData.title)
  const { data: existing } = await supabase.from('events').select('id').eq('slug', slug).maybeSingle()
  if (existing) slug = slug + '-' + Date.now().toString(36)

  const insertData = await applyVenueFields({ ...eventData })

  let payload: Record<string, any> = { ...insertData, slug, status: 'upcoming' }
  let res = await supabase.from('events').insert(payload).select('id, slug').single()
  // Resilient: jei `is_festival` stulpelio dar nėra (migracija neaplikuota) —
  // pakartojam be jo, kad renginio kūrimas nelūžtų.
  if (res.error && /is_festival/.test(res.error.message || '')) {
    delete payload.is_festival
    res = await supabase.from('events').insert(payload).select('id, slug').single()
  }
  if (res.error) throw res.error
  return res.data
}

// ── Update event (admin) ─────────────────────────────────────────
export async function updateEvent(id: string, updates: Record<string, any>) {
  const supabase = createAdminClient()
  const patched = await applyVenueFields({ ...updates })
  let res = await supabase.from('events').update(patched).eq('id', id)
  if (res.error && /is_festival/.test(res.error.message || '')) {
    delete (patched as any).is_festival
    res = await supabase.from('events').update(patched).eq('id', id)
  }
  if (res.error) throw res.error
}

// ── Delete event (admin) ─────────────────────────────────────────
export async function deleteEvent(id: string) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) throw error
}

// ── Set event artists (admin) ────────────────────────────────────
export async function setEventArtists(eventId: string, artists: { artist_id: number; is_headliner?: boolean }[]) {
  const supabase = createAdminClient()

  await supabase.from('event_artists').delete().eq('event_id', eventId)

  if (artists.length === 0) return

  const rows = artists.map((a, i) => ({
    event_id: eventId,
    artist_id: a.artist_id,
    is_headliner: a.is_headliner || false,
    sort_order: i,
  }))

  const { error } = await supabase.from('event_artists').insert(rows)
  if (error) throw error
}

// ── Get upcoming events for homepage ─────────────────────────────
export async function getUpcomingEvents(limit = 5) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('events')
    .select(`
      id, title, slug, start_date, venue_name, city,
      cover_image_url, ticket_url, price_from, status, is_featured,
      event_artists(artist_id, is_headliner, artists(id, name, slug))
    `)
    .in('status', ['upcoming', 'ongoing'])
    .order('start_date', { ascending: true })
    .limit(limit)

  if (error) throw error
  return data || []
}

// ── Search events (admin) ────────────────────────────────────────
export async function searchEvents(query: string, limit = 20) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('events')
    .select('id, title, slug, start_date, city, status, is_featured')
    .ilike('title', `%${query}%`)
    .order('start_date', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

// ── Get cities for filter ────────────────────────────────────────
// Fiksuotas `cities` sąrašas, bet rodom TIK tuos miestus, kurie realiai turi
// renginių (kad filtras nebūtų užterštas tuščiais). Kanoniniai pavadinimai,
// rikiuoti pagal sort_order.
export async function getEventCities() {
  const supabase = createAdminClient()
  const [{ data: cityRows }, { data: evRows }] = await Promise.all([
    supabase.from('cities').select('name, city_id:id, sort_order').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase.from('events').select('city_id').not('city_id', 'is', null),
  ])
  const present = new Set((evRows || []).map((e: any) => e.city_id))
  const cities = (cityRows || [])
    .filter((c: any) => present.has(c.city_id))
    .map((c: any) => c.name as string)
  return cities
}
