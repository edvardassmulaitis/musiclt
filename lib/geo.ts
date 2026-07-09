// lib/geo.ts
// ────────────────────────────────────────────────────────────────────────────
// Geo helperiai: countries → cities → venues (connected). Find-or-create logika,
// kad admin galėtų kurti renginius su švaria, susieta duombaze (o ne laisvu
// tekstu). Visi rašymai per service-role klientą.
// ────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase'
import { slugify } from '@/lib/slugify'

export type Country = { id: number; name: string; code: string | null; sort_order: number }
export type City = { id: number; name: string; slug: string | null; country_id: number | null }
export type Venue = { id: number; name: string; city: string | null; city_id: number | null; country_id: number | null }

const clean = (v: any): string | null => {
  if (v == null) return null
  const s = String(v).trim()
  return s.length ? s : null
}

// ── Countries ───────────────────────────────────────────────────────────────
export async function listCountries(): Promise<Country[]> {
  const sb = createAdminClient()
  const { data } = await sb
    .from('countries')
    .select('id, name, code, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  return (data || []) as Country[]
}

export async function findOrCreateCountry(name: string): Promise<Country> {
  const sb = createAdminClient()
  const nm = clean(name)
  if (!nm) throw new Error('Trūksta šalies pavadinimo')
  const { data: ex } = await sb.from('countries').select('id, name, code, sort_order').ilike('name', nm).maybeSingle()
  if (ex) return ex as Country
  let slug = slugify(nm) || `salis-${Date.now().toString(36)}`
  const { data, error } = await sb.from('countries')
    .insert({ name: nm, slug, sort_order: 100 })
    .select('id, name, code, sort_order').single()
  if (error || !data) throw error || new Error('Nepavyko sukurti šalies')
  return data as Country
}

// ── Cities ────────────────────────────────────────────────────────────────
export async function findOrCreateCity(name: string, countryId?: number | null): Promise<City> {
  const sb = createAdminClient()
  const nm = clean(name)
  if (!nm) throw new Error('Trūksta miesto pavadinimo')
  // Ieškom pagal pavadinimą (case-insensitive); jei nurodyta šalis — jos ribose.
  let q = sb.from('cities').select('id, name, slug, country_id').ilike('name', nm)
  if (countryId) q = q.eq('country_id', countryId)
  const { data: ex } = await q.maybeSingle()
  if (ex) return ex as City
  let slug = slugify(nm) || `miestas-${Date.now().toString(36)}`
  const exSlug = await sb.from('cities').select('id').eq('slug', slug).maybeSingle()
  if (exSlug.data) slug = `${slug}-${Date.now().toString(36)}`
  const { data, error } = await sb.from('cities')
    .insert({ name: nm, slug, country_id: countryId ?? null, is_active: true, sort_order: 100 })
    .select('id, name, slug, country_id').single()
  if (error || !data) throw error || new Error('Nepavyko sukurti miesto')
  return data as City
}

// ── Venues ────────────────────────────────────────────────────────────────
export async function findOrCreateVenue(input: {
  name: string
  cityName?: string | null
  cityId?: number | null
  countryName?: string | null
  countryId?: number | null
  address?: string | null
}): Promise<Venue> {
  const sb = createAdminClient()
  const nm = clean(input.name)
  if (!nm) throw new Error('Trūksta vietos pavadinimo')
  // Ieškom esamos pagal pavadinimą (ir miestą, jei nurodyta).
  let q = sb.from('venues').select('id, name, city, city_id, country_id').ilike('name', nm)
  if (input.cityId) q = q.eq('city_id', input.cityId)
  const { data: ex } = await q.limit(1).maybeSingle()
  if (ex) return ex as Venue
  let slug = slugify(nm) || `vieta-${Date.now().toString(36)}`
  const exSlug = await sb.from('venues').select('id').eq('slug', slug).maybeSingle()
  if (exSlug.data) slug = `${slug}-${Date.now().toString(36)}`
  const { data, error } = await sb.from('venues')
    .insert({
      name: nm,
      slug,
      city: clean(input.cityName),
      city_id: input.cityId ?? null,
      country: clean(input.countryName) || 'Lietuva',
      country_id: input.countryId ?? null,
      address: clean(input.address),
    })
    .select('id, name, city, city_id, country_id').single()
  if (error || !data) throw error || new Error('Nepavyko sukurti vietos')
  return data as Venue
}

// ── Bendras vietos rezolveris (šalis → miestas → vieta) ─────────────────────
// Priima ID (pirmenybė) arba pavadinimus; find-or-create'ina trūkstamus ir
// grąžina galutinius ID + denormalizuotus pavadinimus + is_abroad vėliavą.
export type ResolveLocationInput = {
  countryId?: number | null
  countryName?: string | null
  cityId?: number | null
  cityName?: string | null
  venueId?: number | null
  venueName?: string | null
  address?: string | null
}
export type ResolvedLocation = {
  countryId: number | null
  countryName: string | null
  cityId: number | null
  cityName: string | null
  venueId: number | null
  venueName: string | null
  isAbroad: boolean
}

export async function resolveLocation(input: ResolveLocationInput): Promise<ResolvedLocation> {
  // Šalis
  let countryId = input.countryId && Number(input.countryId) > 0 ? Number(input.countryId) : null
  let countryName = clean(input.countryName)
  if (!countryId && countryName) {
    const c = await findOrCreateCountry(countryName)
    countryId = c.id; countryName = c.name
  } else if (countryId && !countryName) {
    const sb = createAdminClient()
    const { data } = await sb.from('countries').select('name').eq('id', countryId).maybeSingle()
    countryName = data?.name ?? null
  }
  if (!countryName) countryName = 'Lietuva'

  // Miestas
  let cityId = input.cityId && Number(input.cityId) > 0 ? Number(input.cityId) : null
  let cityName = clean(input.cityName)
  if (!cityId && cityName) {
    const c = await findOrCreateCity(cityName, countryId)
    cityId = c.id; cityName = c.name
  } else if (cityId && !cityName) {
    const sb = createAdminClient()
    const { data } = await sb.from('cities').select('name').eq('id', cityId).maybeSingle()
    cityName = data?.name ?? null
  }

  // Vieta
  let venueId = input.venueId && Number(input.venueId) > 0 ? Number(input.venueId) : null
  let venueName = clean(input.venueName)
  if (!venueId && venueName) {
    const v = await findOrCreateVenue({ name: venueName, cityName, cityId, countryName, countryId, address: input.address })
    venueId = v.id; venueName = v.name
  } else if (venueId && !venueName) {
    const sb = createAdminClient()
    const { data } = await sb.from('venues').select('name').eq('id', venueId).maybeSingle()
    venueName = data?.name ?? null
  }

  return {
    countryId, countryName, cityId, cityName, venueId, venueName,
    isAbroad: (countryName || 'Lietuva').toLowerCase() !== 'lietuva',
  }
}
