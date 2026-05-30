import { createAdminClient } from '@/lib/supabase'

// Vieninga slugify utility — palaiko Unicode (visos kalbos). Žr. lib/slugify.ts.
import { slugify } from './slugify'

// ── Get events list (public) ─────────────────────────────────────
export async function getEvents(opts: {
  city?: string
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
  const { city, status, period, showPast = false, limit = 20, offset = 0, order = 'asc' } = opts

  let q = supabase
    .from('events')
    .select(`
      id, title, slug, description, start_date, end_date,
      venue_name, venue_id, city, address, cover_image_url,
      ticket_url, price_from, price_to,
      status, is_featured, created_at,
      event_artists(
        artist_id, is_headliner, sort_order,
        artists(id, name, slug, cover_image_url, country)
      )
    `, { count: 'exact' })
    .order('start_date', { ascending: order !== 'desc' })
    .range(offset, offset + limit - 1)

  if (!showPast) {
    q = q.in('status', ['upcoming', 'ongoing'])
  }
  if (status) q = q.eq('status', status)
  if (city && city !== 'Visi') q = q.eq('city', city)

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

// ── Create event (admin) ─────────────────────────────────────────
export async function createEvent(eventData: {
  title: string
  description?: string
  start_date: string
  end_date?: string
  venue_name?: string
  city?: string
  address?: string
  cover_image_url?: string
  ticket_url?: string
  price_from?: number
  price_to?: number
  is_featured?: boolean
}, userId: string) {
  const supabase = createAdminClient()

  let slug = slugify(eventData.title)
  const { data: existing } = await supabase.from('events').select('id').eq('slug', slug).maybeSingle()
  if (existing) slug = slug + '-' + Date.now().toString(36)

  const { data, error } = await supabase
    .from('events')
    .insert({
      ...eventData,
      slug,
      status: 'upcoming',
    })
    .select('id, slug')
    .single()

  if (error) throw error
  return data
}

// ── Update event (admin) ─────────────────────────────────────────
export async function updateEvent(id: string, updates: Record<string, any>) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('events').update(updates).eq('id', id)
  if (error) throw error
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

// ── Get distinct cities ──────────────────────────────────────────
export async function getEventCities() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('events')
    .select('city')
    .not('city', 'is', null)
    .order('city')

  if (error) return []
  const cities = [...new Set((data || []).map(d => d.city).filter(Boolean))]
  return cities as string[]
}
