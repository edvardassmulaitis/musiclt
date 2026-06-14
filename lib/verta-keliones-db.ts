// lib/verta-keliones-db.ts
//
// SERVER data sluoksnis „Verta kelionės" puslapiui (/verta-keliones).
// Skaito iš DB (travel_destinations + abroad_events). Jei DB tuščia / klaida —
// degrade į statinį seed (lib/verta-keliones-seed.ts), kad puslapis nelūžtų.
//
// Klientui (radar-client) perduodam jau paruoštus Destination[] / Concert[].

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase'
import {
  CONCERTS as SEED_CONCERTS,
  DESTINATIONS as SEED_DESTS,
  type Concert,
  type Destination,
  type ReachMode,
} from './verta-keliones-seed'

export type VertaKelionesData = { concerts: Concert[]; destinations: Destination[] }

function mapDest(d: any): Destination {
  return {
    key: d.key,
    city: d.city,
    country: d.country,
    countryCode: d.country_code || '',
    reach: (d.reach_mode === 'car' ? 'car' : 'flight') as ReachMode,
    fromAirport: d.from_airport || undefined,
    carrier: d.carrier || undefined,
    priceFrom: d.price_from ?? undefined,
    driveHours: d.drive_hours != null ? Number(d.drive_hours) : undefined,
    driveFrom: d.drive_from || undefined,
  }
}

function mapEvent(e: any): Concert {
  return {
    id: String(e.id),
    artist: e.artist_name,
    destKey: e.dest_key,
    venue: e.venue_name || '',
    date: e.start_date,
    endDate: e.end_date || undefined,
    ticketUrl: e.ticket_url || undefined,
    genres: e.genres || [],
    popularity: e.popularity || 0,
    isFestival: !!e.is_festival,
    festivalName: e.festival_name || undefined,
    image: e.image_url || undefined,
    artistSlug: e.artist_slug || undefined,
    why: e.why || '',
    verified: !!e.verified,
  }
}

export const getVertaKelionesData = cache(async (): Promise<VertaKelionesData> => {
  try {
    const sb = createAdminClient()
    const [dRes, eRes] = await Promise.all([
      sb.from('travel_destinations').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
      sb.from('abroad_events').select('*').eq('is_published', true).order('start_date', { ascending: true }),
    ])
    const dests = dRes.data || []
    const evs = eRes.data || []
    if (!dests.length || !evs.length) {
      return { concerts: SEED_CONCERTS, destinations: SEED_DESTS }
    }
    return {
      destinations: dests.map(mapDest),
      concerts: evs.map(mapEvent),
    }
  } catch {
    return { concerts: SEED_CONCERTS, destinations: SEED_DESTS }
  }
})
