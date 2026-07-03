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
import HomeClient, { type InitialLatest, type InitialHero } from './HomeClient'
import { readHomeSnapshot } from '@/lib/home-snapshot'

// ISR — puslapio HTML (su seed'intais tracks/albums) cache'inamas 5 min;
// stale-while-revalidate serve'ina iškart, o regeneracija vyksta fone.
export const revalidate = 300

// SSR HERO SEED: hero endpoint'us (edge-cache'inti) paimam server-side ir įdedam
// į pradinį HTML, kad hero NEBŪTŲ „pop-in" po hydration'o. ISR (revalidate 300)
// amortizuoja. Niekada nemeta: timeout + null fallback → be seed'o client'as
// fetchina kaip anksčiau.
async function fetchInitialHero(): Promise<InitialHero> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://musiclt.vercel.app'
  const j = async (path: string): Promise<any> => {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 2500)
      const r = await fetch(base + path, { next: { revalidate: 300 }, signal: ctrl.signal })
      clearTimeout(t)
      return r.ok ? await r.json() : null
    } catch { return null }
  }
  const [news, ev, posts, win] = await Promise.all([
    j('/api/news?limit=12&include=songs&since_days=7'),
    j('/api/events?home_hero=1&limit=8'),
    j('/api/blog/home-hero'),
    j('/api/dienos-daina/winners?limit=7'),
  ])
  const hero = {
    news: (news?.news ?? []) as any[],
    heroEvents: (ev?.events ?? []) as any[],
    heroPosts: (posts?.posts ?? []) as any[],
    dailyWinners: (win?.winners ?? []) as any[],
  }
  const total = hero.news.length + hero.heroEvents.length + hero.heroPosts.length + hero.dailyWinners.length
  return total > 0 ? hero : null
}

export default async function HomePage() {
  // 1) Precomputed snapshot (CRON 3x/d) + hero seed'as (paraleliai).
  const [__snap, __hero] = await Promise.all([readHomeSnapshot(), fetchInitialHero()])
  if (__snap) return <HomeClient initialLatest={__snap as InitialLatest} initialHero={__hero} />

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

  // Seed'as nepavyko:
  //  • RUNTIME (ISR revalidacija) → throw, kad Next išlaikytų paskutinį gerą
  //    cache'intą puslapį (ne tuščią).
  //  • BUILD prerender (NEXT_PHASE='phase-production-build') → NEcrashinam viso
  //    deploy'o dėl lėto DB. Atiduodam unseeded puslapį — HomeClient pasiima
  //    /api/home/latest client-side, o ISR regeneruos seeded versiją kai DB
  //    atsigaus. Be šito kiekvienas build'as priklauso nuo DB greičio (flaky red).
  if (!tracksOk || !albumsOk) {
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      return <HomeClient />
    }
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

  return <HomeClient initialLatest={initialLatest} initialHero={__hero} />
}
