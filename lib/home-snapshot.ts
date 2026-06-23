/**
 * Homepage "snapshot" — PRECOMPUTED homepage'o "Naujos dainos / Nauji albumai /
 * Greitai pasirodys" duomenys, atnaujinami CRON'u 3x/dienoje (zr. /api/cron/
 * refresh-home + vercel.json). Homepage'as (page.tsx) ir /api/home/latest skaito
 * sita lentele (vienos eilutes jsonb fetch = <20ms) vietoj sunkios DB uzklausos
 * request'o metu. Taip homepage'as NIEKADA neturi laukti / timeout'inti /
 * degraduoti — sunkus skaiciavimas vyksta TIK CRON'e, kur letumas nesvarbus.
 *
 * Turinys gali buti iki ~8h pasenes — samoninga (Edvardo prasymu 2026-06-23).
 *
 * Fallback: jei snapshot dar nesukurtas (pirmas paleidimas) arba tuscias —
 * skaitytojai grizta prie "live" getLatest* (sena elgsena). Po pirmo CRON'o —
 * viskas is snapshot'o.
 */
import { createAdminClient } from '@/lib/supabase'
import {
  getLatestTracksForHome,
  getLatestAlbumsForHome,
  getUpcomingAlbumsForHome,
  mapTrackForHome,
  mapAlbumForHome,
} from '@/lib/home-latest'

export const HOME_SNAPSHOT_KEY = 'homepage_latest_v1'

export type HomeSnapshotPayload = {
  tracks: { lt: any[]; world: any[]; totalLt: number; totalWorld: number }
  albums: { lt: any[]; world: any[]; totalLt: number; totalWorld: number }
  upcoming: any[]
  upcomingTotal: number
}

/** SUNKUS skaiciavimas — kvieciamas TIK is CRON'o. */
export async function computeHomeSnapshot(): Promise<HomeSnapshotPayload> {
  const [t, a, u] = await Promise.all([
    getLatestTracksForHome(),
    getLatestAlbumsForHome(),
    getUpcomingAlbumsForHome(),
  ])
  return {
    tracks: {
      lt: t.lt.map(mapTrackForHome),
      world: t.world.map(mapTrackForHome),
      totalLt: t.totalLt,
      totalWorld: t.totalWorld,
    },
    albums: {
      lt: a.lt.map(mapAlbumForHome),
      world: a.world.map(mapAlbumForHome),
      totalLt: a.totalLt,
      totalWorld: a.totalWorld,
    },
    upcoming: u.items.map(mapAlbumForHome),
    upcomingTotal: u.total,
  }
}

export async function writeHomeSnapshot(payload: HomeSnapshotPayload): Promise<void> {
  const sb = createAdminClient()
  const { error } = await sb
    .from('home_snapshot')
    .upsert({ key: HOME_SNAPSHOT_KEY, payload: payload as any, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw error
}

/** GREITAS skaitymas — homepage page.tsx + /api/home/latest. null jei nera/tuscia. */
export async function readHomeSnapshot(): Promise<HomeSnapshotPayload | null> {
  try {
    const sb = createAdminClient()
    const { data, error } = await sb
      .from('home_snapshot')
      .select('payload')
      .eq('key', HOME_SNAPSHOT_KEY)
      .maybeSingle()
    if (error || !data?.payload) return null
    const p = data.payload as HomeSnapshotPayload
    if (!p.tracks || (p.tracks.lt.length + p.tracks.world.length) === 0) return null
    return p
  } catch {
    return null
  }
}
