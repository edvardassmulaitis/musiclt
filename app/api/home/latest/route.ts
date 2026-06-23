/**
 * GET /api/home/latest
 *
 * Vienas endpoint'as homepage „Naujos dainos" + „Nauji albumai" sekcijoms.
 * Grąžina LT + World lane'us atskirai, su tag-based cache (žr. lib/home-latest.ts).
 *
 * Anksčiau homepage darydavo:
 *   - /api/tracks?limit=24  (sortino abėcėliškai → LT lane'as dažnai tuščias)
 *   - /api/albums?limit=24  (year DESC su NULL priekyje → foreign be datų priekyje)
 *
 * Dabar — vienas request'as, server-side dedupe per artist'ą, tikras
 * `video_uploaded_at DESC` ordering tracks'ams ir `year IS NOT NULL` filter
 * albumams.
 */

import { NextResponse } from 'next/server'
import { readHomeSnapshot } from '@/lib/home-snapshot'
import { readHomeSnapshot } from '@/lib/home-snapshot'
import {
  getLatestTracksForHome,
  getLatestAlbumsForHome,
  getUpcomingAlbumsForHome,
  mapTrackForHome,
  mapAlbumForHome,
} from '@/lib/home-latest'

export async function GET() {
  // Precomputed snapshot (CRON) — greita, niekada ne-degraded. Fallback zemiau.
  const __snap = await readHomeSnapshot()
  if (__snap) {
    return NextResponse.json({ ...__snap, degraded: false }, { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=600', 'CDN-Cache-Control': 'public, s-maxage=900, stale-while-revalidate=600' } })
  }

  // Precomputed snapshot (CRON) — greita, niekada ne-degraded. Fallback zemiau.
  const __snap = await readHomeSnapshot()
  if (__snap) {
    return NextResponse.json({ ...__snap, degraded: false }, { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=600', 'CDN-Cache-Control': 'public, s-maxage=900, stale-while-revalidate=600' } })
  }

  try {
    // Parallel — visos trys užklausos vienu metu. Kiekviena turi savo
    // error handling'ą — jei viena fail'ina, kitos vis tiek grąžina duomenis.
    // Saugiklis: kiekviena uzklausa max 20s. Jei DB intermitentiskai pakimba,
    // grazinam „degraded" greitai (no-store -> klientas self-heal perbando), o
    // NE 180s Vercel hang. NEliesti page.tsx seed'o (zr. SESSION 2026-06-21).
    const withDeadline = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
        ),
      ])
    const [tracksResult, albumsResult, upcomingResult] = await Promise.allSettled([
      withDeadline(getLatestTracksForHome(), 20_000, 'tracks'),
      withDeadline(getLatestAlbumsForHome(), 20_000, 'albums'),
      withDeadline(getUpcomingAlbumsForHome(), 20_000, 'upcoming'),
    ])
    const tracks = tracksResult.status === 'fulfilled' ? tracksResult.value : (() => { console.error('home/latest tracks failed:', (tracksResult as any).reason?.message); return { lt: [], world: [], totalLt: 0, totalWorld: 0 } })()
    const albums = albumsResult.status === 'fulfilled' ? albumsResult.value : (() => { console.error('home/latest albums failed:', (albumsResult as any).reason?.message); return { lt: [], world: [], totalLt: 0, totalWorld: 0 } })()
    const upcoming = upcomingResult.status === 'fulfilled' ? upcomingResult.value : (() => { console.error('home/latest upcoming failed:', (upcomingResult as any).reason?.message); return { items: [], total: 0 } })()

    // ── DEGRADED detekcija (2026-06-14 cache-poisoning fix) ──
    // Iki šiol: jei DB transient'iškai fail'indavo, šis route grąžindavo 200 su
    // TUŠČIAIS lane'ais IR 15 min CDN cache header'iais → vienas hiccup'as
    // „užnuodydavo" edge cache 15-iai minučių ir VISI vartotojai matydavo
    // tuščias „Naujos dainos / Nauji albumai" sekcijas (intermitentinis „kartais
    // neužkrauna" bug'as). Fix: jei kuri nors esminė užklausa fail'ino, arba
    // rezultatas tuščias, NEcache'inam atsakymo (no-store) — tegul kitas
    // request'as bando iš naujo, o ne kabo ant užnuodyto edge'o.
    const tracksFailed = tracksResult.status === 'rejected'
    const albumsFailed = albumsResult.status === 'rejected'
    const tracksEmpty = (tracks.lt.length + tracks.world.length) === 0
    const albumsEmpty = (albums.lt.length + albums.world.length) === 0
    // „degraded" = bent viena esminė (tracks/albums) užklausa fail'ino ARBA
    // abi sekcijos tuščios (rodo galimą duomenų/DB problemą, ne realią tuštumą).
    const degraded = tracksFailed || albumsFailed || (tracksEmpty && albumsEmpty)

    const payload = {
      tracks: {
        lt: tracks.lt.map(mapTrackForHome),
        world: tracks.world.map(mapTrackForHome),
        totalLt: tracks.totalLt,
        totalWorld: tracks.totalWorld,
      },
      albums: {
        lt: albums.lt.map(mapAlbumForHome),
        world: albums.world.map(mapAlbumForHome),
        totalLt: albums.totalLt,
        totalWorld: albums.totalWorld,
      },
      // „Greitai pasirodys" — bendras LT + INTL sąrašas, rikiuotas pagal
      // artimiausią release datą ASC. UI rodo kaip atskirą sekciją po
      // „Nauji albumai" (be lane split).
      upcoming: upcoming.items.map(mapAlbumForHome),
      upcomingTotal: upcoming.total,
      degraded,
    }

    // Cache header'iai: SVEIKAS atsakymas — 15 min CDN cache (tag invalidation
    // per revalidateHomeTag instant'iškai išvalo unstable_cache layer'į; CDN
    // edge'ai pasipildo per s-maxage). DEGRADED atsakymas — no-store, kad
    // tuščio/dalinio rezultato NEužcache'intume edge'e (žr. paaiškinimą aukščiau).
    const cacheHeaders = degraded
      ? {
          'Cache-Control': 'no-store, must-revalidate',
          'CDN-Cache-Control': 'no-store',
          'Vercel-CDN-Cache-Control': 'no-store',
        }
      : {
          'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=600',
          'CDN-Cache-Control': 'public, s-maxage=900, stale-while-revalidate=600',
          'Vercel-CDN-Cache-Control': 'public, s-maxage=900, stale-while-revalidate=600',
        }

    return NextResponse.json(payload, { headers: cacheHeaders })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
