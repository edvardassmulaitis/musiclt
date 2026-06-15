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
  let initialLatest: InitialLatest | undefined

  // Server-side fetch — paralelinis, atsparus klaidoms. Jei VISKAS fail'ina,
  // initialLatest lieka undefined → HomeClient grįžta prie client-fetch +
  // equalizer skeletonų (graceful fallback, ne white screen).
  try {
    const [tracksR, albumsR, upcomingR] = await Promise.allSettled([
      getLatestTracksForHome(),
      getLatestAlbumsForHome(),
      getUpcomingAlbumsForHome(),
    ])
    const tracks = tracksR.status === 'fulfilled' ? tracksR.value : { lt: [], world: [], totalLt: 0, totalWorld: 0 }
    const albums = albumsR.status === 'fulfilled' ? albumsR.value : { lt: [], world: [], totalLt: 0, totalWorld: 0 }
    const upcoming = upcomingR.status === 'fulfilled' ? upcomingR.value : { items: [], total: 0 }

    // 2026-06-15: seed'inam TIK kai ABI esminės sekcijos (dainos IR albumai)
    // turi turinio. Anksčiau užteko bet kurios → jei dainos transient'iškai
    // grįždavo tuščios, bet albumai ne, SSR užfiksuodavo TUŠČIAS dainų juostas
    // į 300s ISR cache'ą BE client retry (seeded=true praleidžia fetch'ą) →
    // „Lietuviškų dainų netrukus" 5 min. Dabar jei kuri sekcija tuščia,
    // paliekam initialLatest=undefined → client'as fetch'ina su retry +
    // last-known-good, ir tuščia būsena niekada neužrakinama.
    const tracksOk = (tracks.lt.length + tracks.world.length) > 0
    const albumsOk = (albums.lt.length + albums.world.length) > 0
    if (tracksOk && albumsOk) {
      initialLatest = {
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
  } catch {
    initialLatest = undefined
  }

  return <HomeClient initialLatest={initialLatest} />
}
