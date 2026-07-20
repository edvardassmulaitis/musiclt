// app/v2/page.tsx — SERVER component.
//
// Alternatyvus pagrindinio puslapio variantas (/v2), NELIEČIANT main page.
// Tikslas: „nauja muzika" viena didele zona (~65%), bendruomenės dalis šone
// (~35%) su tikrais įdomiausiais features, tada renginių afišos, ir galiausiai
// vienas bendras muzikos istorijos / nostalgijos sprendimas.
//
// Duomenys — TIKRI, reuse'inam tuos pačius šaltinius kaip homepage:
//   • muzika: readHomeSnapshot() (CRON snapshot) → fallback getLatest*
//   • renginiai: /api/events (homepage kontekstas, compact)
//   • istorija: /api/istorija/today
//   • bendruomenė: /api/home/community (agreguotas feed'as)
//   • topai: /api/top/entries (turi prev_position → judėjimo delta)
//   • dienos daina: /api/dienos-daina/nominations (šios dienos balsavimas)
//
// noindex — kad alternatyvus variantas nepatektų į paiešką.

import {
  getLatestTracksForHome,
  getLatestAlbumsForHome,
  getUpcomingAlbumsForHome,
  mapTrackForHome,
  mapAlbumForHome,
} from '@/lib/home-latest'
import { readHomeSnapshot, type HomeSnapshotPayload } from '@/lib/home-snapshot'
import V2Client from './V2Client'

export const revalidate = 300

export const metadata = {
  title: 'Music.lt v2 — alternatyvus variantas',
  robots: { index: false, follow: false },
}

async function jget(path: string): Promise<any> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://musiclt.vercel.app'
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 3000)
    const r = await fetch(base + path, { next: { revalidate: 300 }, signal: ctrl.signal })
    clearTimeout(t)
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
}

async function getMusic(): Promise<HomeSnapshotPayload> {
  const snap = await readHomeSnapshot()
  if (snap) return snap
  const [t, a, u] = await Promise.allSettled([
    getLatestTracksForHome(),
    getLatestAlbumsForHome(),
    getUpcomingAlbumsForHome(),
  ])
  const tracks = t.status === 'fulfilled' ? t.value : { lt: [], world: [], totalLt: 0, totalWorld: 0 }
  const albums = a.status === 'fulfilled' ? a.value : { lt: [], world: [], totalLt: 0, totalWorld: 0 }
  const upcoming = u.status === 'fulfilled' ? u.value : { items: [], total: 0 }
  return {
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
    upcoming: upcoming.items.map(mapAlbumForHome),
    upcomingTotal: upcoming.total,
  }
}

export default async function V2Page() {
  const [music, eventsR, historyR, communityR, topR, ddR] = await Promise.all([
    getMusic(),
    jget('/api/events?homepage=1&compact=1&limit=12&period=all&order=asc'),
    jget('/api/istorija/today'),
    jget('/api/home/community'),
    jget('/api/top/entries?type=top40'),
    jget('/api/dienos-daina/nominations'),
  ])

  return (
    <V2Client
      music={music}
      events={(eventsR?.events ?? []) as any[]}
      history={(historyR?.items ?? []) as any[]}
      community={(communityR?.items ?? []) as any[]}
      top={(topR?.entries ?? []) as any[]}
      nominations={(ddR?.nominations ?? []) as any[]}
    />
  )
}
