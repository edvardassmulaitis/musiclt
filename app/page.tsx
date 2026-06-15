// app/page.tsx — SERVER component (homepage shell).
//
// 2026-06-14 SSR refactor: „Naujos dainos / Nauji albumai / Greitai pasirodys"
// dabar fetch'inami SERVER-SIDE ir įdedami į pradinį HTML (per HomeClient
// `initialLatest` prop'ą). Anksčiau tai darė client useEffect → /api/home/latest
// (cold-start lėtumas, retry kabėjimas, tuščio cache rizika → „kartais
// neužkrauna" bug'as). Dabar turinys ateina kartu su HTML'u, akimirksniu ir
// patikimai. ISR (revalidate 300) regeneruoja puslapį kas 5 min, todėl sunki
// užklausa vykdoma daugiausiai kartą per 5 min (ne kiekvienam vartotojui).
//
// 2026-06-15 STABILUMO SAUGIKLIS: jei seed'as nepavyksta (gilus transient —
// query retry IR in-memory last-known-good abu nesuveikė), NErender'inam
// unseeded puslapio. Antraip Next ISR jį užcache'intų 300s ir VISI vartotojai
// 5 min matytų skeletonus → „nepavyko užkrauti" → rankinis „Bandyti dar kartą".
// Vietoj to THROW'inam: Next ISR išlaiko paskutinį GERĄ (seeded) cache'intą
// puslapį (stale-while-revalidate) ir perbando regeneraciją kitam request'ui.
// Background regeneracijos klaida vartotojui NEMATOMA — jis gauna stale gerą
// puslapį. Vienintelė rizika — pats pirmas generavimas po deploy be jokio
// stale; tą dengia app/error.tsx (loop-safe auto-reload).
//
// Visa interaktyvi logika lieka HomeClient.tsx ('use client').

import {
  getLatestTracksForHome,
  getLatestAlbumsForHome,
  getUpcomingAlbumsForHome,
  mapTrackForHome,
  mapAlbumForHome,
} from '@/lib/home-latest'
import HomeClient, { type InitialLatest } from './HomeClient'

// ISR — puslapio HTML (su seed'intais tracks/albums) cache'inamas 5 min;
// stale-while-revalidate serve'ina iškart, o regeneracija vyksta fone.
export const revalidate = 300

export default async function HomePage() {
  // Server-side fetch — paralelinis. Kiekvienas getLatest* viduje jau daro
  // query retry + grąžina in-memory last-known-good, jei DB transient'iškai krenta.
  const [tracksR, albumsR, upcomingR] = await Promise.allSettled([
    getLatestTracksForHome(),
    getLatestAlbumsForHome(),
    getUpcomingAlbumsForHome(),
  ])
  const tracks = tracksR.status === 'fulfilled' ? tracksR.value : { lt: [], world: [], totalLt: 0, totalWorld: 0 }
  const albums = albumsR.status === 'fulfilled' ? albumsR.value : { lt: [], world: [], totalLt: 0, totalWorld: 0 }
  const upcoming = upcomingR.status === 'fulfilled' ? upcomingR.value : { items: [], total: 0 }

  const tracksOk = (tracks.lt.length + tracks.world.length) > 0
  const albumsOk = (albums.lt.length + albums.world.length) > 0

  // Seed'as nepavyko → throw (NEcache'inam unseeded puslapio). Žr. header'į.
  if (!tracksOk || !albumsOk) {
    throw new Error(
      `Homepage seed unavailable (tracksOk=${tracksOk} albumsOk=${albumsOk}) — ` +
        'preserving last-good ISR page instead of caching an empty one'
    )
  }

  const initialLatest: InitialLatest = {
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

  return <HomeClient initialLatest={initialLatest} />
}
