// lib/verta-keliones-db.ts
//
// SERVER data sluoksnis „Verta kelionės" puslapiui (/verta-keliones).
// Po merge (2026-06-26): užsienio koncertai gyvena UNIFIED `events` lentelėje
// su žyma `is_abroad=true` (+ dest_key → travel_destinations). Skaitom iš ten;
// jei DB tuščia / klaida — degrade į statinį seed (lib/verta-keliones-seed.ts),
// kad puslapis nelūžtų.
//
// Klientui (radar-client) perduodam jau paruoštus Destination[] / Concert[] —
// tas pats formatas kaip anksčiau, todėl UI ir kiti vartotojai (srautas,
// /koncertai) nepaliesti.

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

// Unified events select (užsienio koncertams). event_artists → lineup/žanrai.
const ABROAD_SELECT = `
  id, title, slug, description, start_date, end_date, venue_name, city,
  cover_image_url, ticket_url, is_festival, dest_key, why, popularity, verified, status,
  event_artists(artist_id, sort_order, artists(slug, cover_image_url))
`

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

function firstArtist(e: any): any | null {
  const list = (e.event_artists || [])
    .slice()
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((ea: any) => (Array.isArray(ea.artists) ? ea.artists[0] : ea.artists))
    .filter(Boolean)
  return list[0] || null
}

// events (is_abroad) eilutė → Concert (radar-client formatas).
function mapEvent(e: any): Concert {
  const a = firstArtist(e)
  const d = String(e.start_date || '')
  return {
    id: String(e.id),
    artist: e.title,
    destKey: e.dest_key || '',
    venue: e.venue_name || '',
    date: d.slice(0, 10),
    endDate: e.end_date ? String(e.end_date).slice(0, 10) : undefined,
    ticketUrl: e.ticket_url || undefined,
    genres: e._genres || [],
    popularity: e.popularity || 0,
    isFestival: !!e.is_festival,
    festivalName: e.is_festival ? e.title : undefined,
    image: e.cover_image_url || a?.cover_image_url || undefined,
    artistSlug: a?.slug || undefined,
    why: e.why || e.description || '',
    verified: !!e.verified,
  }
}

// Žanrų agregavimas lineup atlikėjams (vienas batch užklausimas).
async function attachGenres(sb: any, rows: any[]): Promise<void> {
  const artistIds = Array.from(new Set(
    rows.flatMap(e => (e.event_artists || []).map((ea: any) => ea.artist_id).filter(Boolean)),
  )) as number[]
  if (!artistIds.length) return
  try {
    const genreByArtist = new Map<number, string[]>()
    const { data: ag } = await sb.from('artist_genres').select('artist_id, genres(name)').in('artist_id', artistIds)
    for (const r of (ag || []) as any[]) {
      const name = r.genres?.name
      if (!name) continue
      const list = genreByArtist.get(r.artist_id) || []
      if (!list.includes(name)) list.push(name)
      genreByArtist.set(r.artist_id, list)
    }
    for (const e of rows) {
      const gset = new Set<string>()
      for (const ea of e.event_artists || []) for (const g of (genreByArtist.get(ea.artist_id) || [])) gset.add(g)
      e._genres = Array.from(gset)
    }
  } catch { /* žanrai nebūtini */ }
}

const ltToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

// ── Vieno koncerto detalė (/verta-keliones/[slug]) ───────────────
export { vkHref } from './verta-keliones-seed'

export type AbroadTopTrack = { id: number; title: string; slug: string | null; cover_url: string | null; video_url: string | null }
export type AbroadEventDetail = {
  concert: Concert
  dest: Destination | null
  topTrack: AbroadTopTrack | null
  related: Concert[]
}

// Pretty slug'as baigiasi events UUID'u (ne numeric — events.id yra uuid).
function trailingUuid(slug: string): string | null {
  const m = slug.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)
  return m ? m[1] : null
}

export const getAbroadEventBySlug = cache(async (slug: string): Promise<AbroadEventDetail | null> => {
  const id = trailingUuid(slug)
  if (id == null) return null
  try {
    const sb = createAdminClient()
    // Vieša detalė TIK verifikuotiems (neverifikuoti scout/seed nerodomi, kol
    // admin nepatvirtins) — atitinka /verta-keliones sąrašo logiką.
    const { data: ev } = await sb.from('events').select(ABROAD_SELECT)
      .eq('id', id).eq('is_abroad', true).eq('verified', true).maybeSingle()
    if (!ev) return null
    await attachGenres(sb, [ev])
    const concert = mapEvent(ev)
    const today = ltToday()

    const [{ data: destRow }, relatedRows, topTrack] = await Promise.all([
      sb.from('travel_destinations').select('*').eq('key', (ev as any).dest_key).maybeSingle(),
      sb.from('events').select(ABROAD_SELECT)
        .eq('is_abroad', true).eq('verified', true).eq('dest_key', (ev as any).dest_key).neq('id', id)
        .gte('start_date', today)
        .order('start_date', { ascending: true }).limit(6)
        .then((r: any) => r.data || []),
      (async (): Promise<AbroadTopTrack | null> => {
        const aid = firstArtist(ev)?.id ?? ((ev as any).event_artists || [])[0]?.artist_id
        if (!aid) return null
        const { data: trks } = await sb.from('tracks')
          .select('id, title, slug, cover_url, video_url, video_views')
          .eq('artist_id', aid).not('video_url', 'is', null)
          .order('video_views', { ascending: false, nullsFirst: false }).limit(1)
        const t = (trks || [])[0] as any
        return t ? { id: t.id, title: t.title, slug: t.slug, cover_url: t.cover_url, video_url: t.video_url } : null
      })(),
    ])

    await attachGenres(sb, relatedRows)
    const related = relatedRows.map(mapEvent)
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
      // Viešai TIK verifikuoti (verified=true) užsienio koncertai. Neverifikuoti
      // „seed"/scout įrašai nerodomi, kol admin jų nepatvirtins.
      sb.from('events').select(ABROAD_SELECT)
        .eq('is_abroad', true).eq('verified', true)
        .order('start_date', { ascending: true }),
    ])
    const dests = dRes.data || []
    // Tik BŪSIMI koncertai — praėję nerodomi nei sąraše, nei /srautas hero.
    // Daugiadieniai: end_date >= šiandien; vienadieniai: start_date >= šiandien (LT).
    const today = ltToday()
    const evs = (eRes.data || []).filter((e: any) => ((e.end_date || e.start_date || '') as string).slice(0, 10) >= today)
    // Seed (demo) TIK kai DB tikrai neprieinama (nėra krypčių). Jei kryptys yra,
    // bet verifikuotų koncertų nėra — grąžinam TUŠČIĄ (ne fake seed).
    if (!dests.length) {
      return { concerts: SEED_CONCERTS, destinations: SEED_DESTS }
    }
    await attachGenres(sb, evs)
    return {
      destinations: dests.map(mapDest),
      concerts: evs.map(mapEvent),
    }
  } catch {
    return { concerts: SEED_CONCERTS, destinations: SEED_DESTS }
  }
})
