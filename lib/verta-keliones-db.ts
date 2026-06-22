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

// ── Vieno koncerto detalė (/verta-keliones/[slug]) ───────────────
export { vkHref } from './verta-keliones-seed'

export type AbroadTopTrack = { id: number; title: string; slug: string | null; cover_url: string | null; video_url: string | null }
export type AbroadEventDetail = {
  concert: Concert
  dest: Destination | null
  topTrack: AbroadTopTrack | null
  related: Concert[]
}

function trailingId(slug: string): number | null {
  const m = slug.match(/-(\d+)$/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

export const getAbroadEventBySlug = cache(async (slug: string): Promise<AbroadEventDetail | null> => {
  const id = trailingId(slug)
  if (id == null) return null
  try {
    const sb = createAdminClient()
    const { data: ev } = await sb.from('abroad_events').select('*').eq('id', id).eq('is_published', true).maybeSingle()
    if (!ev) return null
    const concert = mapEvent(ev)

    const [{ data: destRow }, related, topTrack] = await Promise.all([
      sb.from('travel_destinations').select('*').eq('key', (ev as any).dest_key).maybeSingle(),
      sb.from('abroad_events').select('*').eq('is_published', true).eq('dest_key', (ev as any).dest_key).neq('id', id).order('start_date', { ascending: true }).limit(6)
        .then(r => (r.data || []).map(mapEvent)),
      (async (): Promise<AbroadTopTrack | null> => {
        const aid = (ev as any).artist_id
        if (!aid) return null
        const { data: trks } = await sb.from('tracks')
          .select('id, title, slug, cover_url, video_url, video_views')
          .eq('artist_id', aid).not('video_url', 'is', null)
          .order('video_views', { ascending: false, nullsFirst: false }).limit(1)
        const t = (trks || [])[0] as any
        return t ? { id: t.id, title: t.title, slug: t.slug, cover_url: t.cover_url, video_url: t.video_url } : null
      })(),
    ])

    return { concert, dest: destRow ? mapDest(destRow) : null, topTrack, related }
  } catch {
    return null
  }
})

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
