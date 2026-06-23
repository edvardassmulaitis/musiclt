/**
 * Homepage'o „Naujos dainos" + „Nauji albumai" + „Naujienos" fetcher'iai.
 *
 * Visi sąrašai keshuojami per Next.js `unstable_cache` su tag'ais — admin'as
 * po nauja įrašo INSERT/UPDATE iškviečia `revalidateHomeTag(...)` ir cache
 * iškart išsivalo. Antraip `revalidate: 300` (5 min) atnaujina automatiškai.
 *
 * Reikalavimai (žr. SESSION 2026-05-28 plan):
 *   Naujos dainos:
 *     - Order: `video_uploaded_at DESC` (YT upload date)
 *     - Filter: `video_uploaded_at IS NOT NULL` ir paskutinės 90 dienų
 *     - Country lane split: LT (Lietuva/LT/Lithuania ar NULL) vs World
 *     - Dedupe per artist: jei tas pats atlikėjas turi kelis fresh tracks,
 *       imam tą, kuris turi daugiausiai `video_views`
 *
 *   Nauji albumai:
 *     - Order: `year DESC, month DESC NULLS LAST, day DESC NULLS LAST`
 *     - Filter: `year IS NOT NULL` (kitaip Postgres'as deda NULL'us pradžiai)
 *     - Country lane split: ta pati LT/World logika
 *
 *   Naujienos (modern + legacy):
 *     - Filter: `published_at >= NOW() - 30 days`
 *     - Modern news priority — legacy discussions po jo
 */

import { unstable_cache, revalidateTag, revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

/* ────────────────────────────── Constants ────────────────────────────── */

const LT_COUNTRIES = ['Lietuva', 'LT', 'Lithuania']

// ── Homepage block-list ──
// Atlikėjai iš šių šalių NIEKADA nerodomi homepage'o „Naujos dainos" /
// „Nauji albumai" / „Greitai pasirodys" sekcijose (politinis sprendimas,
// 2026-06-05). Filtruojam JS lygyje po fetch'o — null-safe (NULL country
// nelaikomas blokuotu; nežinomos kilmės įrašai praeina). Pastaba: Rusijos
// atlikėjai dažnai turi country=NULL + kirilicos slug'ą — tokius patagavom
// country='Rusija' DB lygyje, kad šis filtras juos pagautų.
const BLOCKED_HOME_COUNTRIES = ['Rusija']

function isBlockedCountry(country: string | null | undefined): boolean {
  if (!country) return false
  return BLOCKED_HOME_COUNTRIES.includes(country)
}

// 90 dienų — pakankamai šviežių LT releasų. Jei keisti, taip pat atnaujinti
// memory.md ir homepage SectionHead label'ą („Naujausios").
export const LATEST_TRACK_WINDOW_DAYS = 90
export const LATEST_ALBUM_WINDOW_DAYS = 90 * 4  // ~12 mėn (albumai retesni)
export const LATEST_NEWS_WINDOW_DAYS = 30

// Per lane'ą rodom 10 įrašų. Fetch'inam daugiau kandidatų prieš dedupe.
export const HOME_LANE_LIMIT = 10
// Candidate pool limitai. Reikia pakankamai didelių, kad LT turinys
// (mažuma) neiškristų: 90d tracks ~1100, albums year>=2025 ~700.
// Šie limitai taikomi prieš JS-lygio dedupe/filter — didesnis pool
// = tikslesnė LT juosta. Pro plan (1 GB RAM) laiko ~1200 be problemų.
// ⚠️ NEKELTI virš ~300! Su 500 tracks užklausa per Supabase JS klientą
// (sunkesnis SELECT) /api/home/latest virš 20s timeout'ina → tracks tušti →
// homepage „Naujos dainos" nebesikrauna. Patikrinta: 250→1.1s, 500→20s+ (DB
// užklausa indeksuota=18ms, lūžis transporto/serializacijos sluoksny, ne DB).
const TRACKS_CANDIDATE_FETCH_LIMIT = 250
const ALBUMS_CANDIDATE_FETCH_LIMIT = 800

/* ────────────────────────────── Tags ────────────────────────────── */

export const HOME_TAGS = {
  tracks: 'home:tracks-latest',
  albums: 'home:albums-latest',
  news: 'home:news-latest',
  events: 'home:events-latest',
} as const

/** Iškviečiamas iš POST/PUT/DELETE endpoint'ų po naujo track/album/news/event. */
// Debounce: kad bulk operacijos (importai, kurie kviečia revalidateHomeTag daug
// kartų) nehammerintų snapshot perskaičiavimo. Per-instance (serverless).
let __lastSnapRefresh = 0

/** Iškviečiamas iš POST/PUT/DELETE endpoint'ų po naujo track/album/news/event. */
export function revalidateHomeTag(kind: keyof typeof HOME_TAGS) {
  try {
    revalidateTag(HOME_TAGS[kind])
  } catch {
    /* dev mode silently no-ops */
  }
  // Admino pakeitimas (paslėpta daina, pakeista šalis, naujas track/album) → IŠKART
  // perskaičiuojam homepage snapshot'ą fone. after() = po HTTP atsako (neblokuoja
  // admino veiksmo), patikimas Vercel. Taip pakeitimai matosi ~per kelias sekundes,
  // ne tik po CRON'o (3x/d). Dynamic import — kad išvengtume circular dependency
  // (home-snapshot importuoja šį modulį).
  const now = Date.now()
  if (now - __lastSnapRefresh > 8000) {
    __lastSnapRefresh = now
    try {
      after(async () => {
        try {
          const m = await import('@/lib/home-snapshot')
          const payload = await m.computeHomeSnapshot()
          await m.writeHomeSnapshot(payload)
          try { revalidatePath('/') } catch {}
        } catch {
          /* nepavyko — CRON (3x/d) vis tiek atnaujins */
        }
      })
    } catch {
      /* after() ne request scope — CRON dengia */
    }
  }
}

/* ────────────────────────────── Entity page tags ──────────────────────────────
   Atskiri tag'ai entity page'ams (artist, album, track, user). Kviečiama iš
   admin PATCH/PUT/DELETE endpoint'ų — ISR cache iškart išvalo, kitas user'is
   gauna fresh duomenis. Skiriasi nuo HOME_TAGS tuo, kad šitie taikomi
   detail puslapiams, ne homepage'o lane'ams.
*/
export const ENTITY_TAGS = {
  artist: 'artist',
  album: 'album',
  track: 'track',
  user: 'user',
} as const

export function revalidateEntityTag(kind: keyof typeof ENTITY_TAGS) {
  try {
    revalidateTag(ENTITY_TAGS[kind])
  } catch {
    /* dev mode silently no-ops */
  }
}

/* ────────────────────────────── Types ────────────────────────────── */

type LatestTrackArtist = {
  id: number
  name: string
  slug: string
  cover_image_url: string | null
  country: string | null
  score: number | null
}

type LatestTrackRow = {
  id: number
  title: string
  slug: string | null
  cover_url: string | null
  video_url: string | null
  video_views: number | null
  video_uploaded_at: string | null
  release_year: number | null
  release_date: string | null
  created_at: string | null
  hide_from_homepage: boolean | null
  artist_id: number
  artists: LatestTrackArtist | null
  album_tracks?: Array<{ albums: { id: number; year: number | null } | null }> | null
}

type LatestAlbumRow = {
  id: number
  title: string
  slug: string | null
  cover_image_url: string | null
  year: number | null
  month: number | null
  day: number | null
  is_upcoming: boolean | null
  created_at: string | null
  artist_id: number
  artists: { id: number; name: string; slug: string; cover_image_url: string | null; country: string | null; score: number | null } | null
}

/* ────────────────────────────── Helpers ────────────────────────────── */

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

/* ────────────────────────────── Reliability ──────────────────────────────
   „kartais neužkrauna dainos/albumai" saugikliai (2026-06-15).

   Pamoka: `unstable_cache` cache'ina BET KOKĮ grąžintą reikšmę — įskaitant
   tuščią masyvą `[]`. Jei DB transient'iškai grąžindavo 0 eilučių (cold conn,
   statement timeout be error'o, pool hiccup), tas tuščias rezultatas būdavo
   užcache'inamas 300s ir VISI vartotojai 5 min matydavo „...netrukus" tuščią
   būseną. Ankstesnis `degraded → no-store` fix'as saugojo tik CDN/browser
   cache'ą, NE Next data cache'o (`unstable_cache`) sluoksnį — todėl bug'as
   kartodavosi. Šie trys saugikliai uždaro skylę source'e:
     1) withRetry — transient blip'as pats pasigydo prieš bubble-up;
     2) throw-on-empty cached fetcher'iuose — tuščias rezultatas NIEKADA
        nepatenka į `unstable_cache` (throw nėra cache'inamas);
     3) last-known-good — jei viskas vis tiek fail'ina, serve'inam paskutinį
        gerą rezultatą (ne tuščią) iš in-memory (warm instance). */

async function withRetry<T>(
  fn: () => Promise<T>,
  { tries = 3, baseDelayMs = 250, label = 'query' }: { tries?: number; baseDelayMs?: number; label?: string } = {},
): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (i < tries - 1) {
        await new Promise(res => setTimeout(res, baseDelayMs * (i + 1)))
      }
    }
  }
  console.error(`[home-latest] ${label} failed after ${tries} tries:`, (lastErr as any)?.message || lastErr)
  throw lastErr
}

// Last-known-good in-memory store (per serverless instance, ephemeral). Užpildomas
// tik su NETUŠČIU rezultatu. Naudojamas kaip paskutinė gynybos linija, kad
// homepage'as rodytų ankstesnį turinį, o ne „...netrukus", kai DB trumpam krenta.
const lastGood: { tracks: any | null; albums: any | null; upcoming: any | null } = {
  tracks: null,
  albums: null,
  upcoming: null,
}

function isLT(country: string | null | undefined): boolean {
  // NULL/nenustatyta šalis NEBĖRA LT (Edvardo prašymu 2026-06-23): nenustatyto
  // atlikėjo NErodome „LT atlikėjai" juostoje. Admin'as turi nustatyti šalį.
  if (!country) return false
  return LT_COUNTRIES.includes(country)
}

/** „Nauja" badge: ar įrašas pridėtas per paskutines N dienų. */
export const NEW_BADGE_DAYS = 3

/* ──────────────────────── Homepage „tik populiarūs" juosta ────────────────────────
   (2026-06-23, Edvardo prašymu) Anksčiau homepage juostos buvo rikiuojamos
   hibridiniu balu (70% šviežumas + 30% populiarumas) — todėl scrollinant į šoną
   datos „šokinėdavo" (mišri tvarka, ne chronologinė). Dabar:

     • Juostoje rodom TIK populiarius releasus, surikiuotus pagal DATĄ (naujausi
       kairėje) → scrollinant datos eina nuosekliai naujausi→seniausi.
     • Mažiau populiarūs lieka TIK po „Daugiau →" (pilnas sąrašas /api/home/list,
       kuris ima ltFull/worldFull su savo sort toggle).

   Populiarumo slenkstis yra LANE-AWARE: LT scenoje populiarumo balai natūraliai
   žemesni nei pasaulio (LT track score med ~33 vs pasaulio ~52; LT album med ~13
   vs ~47), todėl LT riba švelnesnė — kitaip LT juosta tuštėtų. Track'as
   populiarus jei artist.score >= score ARBA video_views >= views; albumas —
   pagal artist.score (albumo per-track peržiūros čia neužkraunamos).

   Floor (STRIP_MIN_ITEMS): jei riba praleidžia per mažai, papildom artimiausiais
   pagal populiarumą — kad juosta neliktų tuščia / su „...netrukus", kai šviežio
   turinio realiai yra. */
const POP_THRESHOLDS = {
  tracks: {
    lt: { score: 40, views: 50_000 },
    world: { score: 55, views: 300_000 },
  },
  albums: {
    lt: { score: 30 },
    world: { score: 50 },
  },
} as const

// Minimalus juostos ilgis — žemiau jo papildom „kitais geriausiais", kad
// nerodytume tuščios juostos lėtomis savaitėmis.
const STRIP_MIN_ITEMS = 5

/**
 * Homepage juostos atranka: paliekam tik populiarius (per `isPopular`), o jei jų
 * mažiau nei STRIP_MIN_ITEMS — papildom artimiausiais pagal `popScore`. Galutinis
 * sąrašas VISADA rikiuojamas pagal datą DESC (naujausi pirma) ir apkarpomas iki
 * `limit`.
 */
function selectPopularStrip<T>(
  full: T[],
  isPopular: (r: T) => boolean,
  popScore: (r: T) => number,
  dateMs: (r: T) => number,
  limit: number,
): T[] {
  let chosen = full.filter(isPopular)
  if (chosen.length < STRIP_MIN_ITEMS) {
    const fill = full
      .filter(r => !isPopular(r))
      .sort((a, b) => popScore(b) - popScore(a))
      .slice(0, STRIP_MIN_ITEMS - chosen.length)
    chosen = [...chosen, ...fill]
  }
  return [...chosen].sort((a, b) => dateMs(b) - dateMs(a)).slice(0, limit)
}

/* ────────────────────────────── Tracks ────────────────────────────── */

const TRACK_SELECT =
  'id, title, slug, cover_url, video_url, video_views, video_uploaded_at, ' +
  'release_date, release_year, created_at, hide_from_homepage, artist_id, ' +
  'artists!tracks_artist_id_fkey(id, name, slug, cover_image_url, country, score), ' +
  'album_tracks(albums(id, year))'

async function fetchLatestTracksRaw(): Promise<LatestTrackRow[]> {
  const supabase = createAdminClient()
  const since = isoDaysAgo(LATEST_TRACK_WINDOW_DAYS)
  const currentYear = new Date().getFullYear()

  // Du query lygiagrečiai:
  // 1) Dainos su video_uploaded_at per 90d (pagrindinis šaltinis)
  // 2) Dainos BE video_uploaded_at, bet su release_year >= currentYear-1
  //    (admin'o suvestos dainos, kurioms YT data nenustatyta)
  // Sujungiam ir dedupliuojam pagal id.
  // Kiekviena užklausa su retry (transient blip → self-heal). Jei query grąžina
  // error'ą, withRetry perbando; po visų bandymų — throw (NEcache'inama).
  const [r1, r2] = await Promise.all([
    withRetry(async () => {
      const res = await supabase
        .from('tracks')
        .select(TRACK_SELECT)
        .not('video_uploaded_at', 'is', null)
        .gte('video_uploaded_at', since)
        .order('video_uploaded_at', { ascending: false })
        .limit(TRACKS_CANDIDATE_FETCH_LIMIT)
      if (res.error) throw res.error
      return res
    }, { label: 'tracks.primary' }),
    withRetry(async () => {
      const res = await supabase
        .from('tracks')
        .select(
          'id, title, slug, cover_url, video_url, video_views, video_uploaded_at, ' +
          'release_date, release_year, created_at, hide_from_homepage, artist_id, ' +
          'artists!tracks_artist_id_fkey(id, name, slug, cover_image_url, country, score)'
        )
        .is('video_uploaded_at', null)
        .not('release_year', 'is', null)
        .gte('release_year', currentYear - 1)
        .not('video_url', 'is', null)
        .order('id', { ascending: false })
        .limit(200)
      if (res.error) throw res.error
      return res
    }, { label: 'tracks.fallback' }),
  ])

  // Dedupe pagal id (jei kažkodėl dubliuotųsi)
  const byId = new Map<number, LatestTrackRow>()
  for (const row of [...(r1.data || []), ...(r2.data || [])] as unknown as LatestTrackRow[]) {
    if (!byId.has(row.id)) byId.set(row.id, row)
  }
  const out = Array.from(byId.values())

  // ── Empty-guard (cache-poisoning saugiklis) ──
  // Sveikoje DB visada yra šviežių dainų per 90d langą (+ release_year fallback).
  // 0 eilučių ≈ transient DB problema, NE reali tuštuma. Throw'inam, kad
  // `unstable_cache` NEUŽCACHE'INTŲ tuščio rezultato 300s (būtent tai sukeldavo
  // „kartais neužkrauna" bug'ą). Throw → cache praleidžiamas → kitas request
  // bando iš naujo su švariu cache'u.
  if (out.length === 0) {
    throw new Error('fetchLatestTracksRaw returned 0 rows — treating as transient failure (not caching)')
  }
  return out
}

/** Cache'inta raw fetch'inimo funkcija. Vidinis arg pirmiausia veikia kaip
 *  hash-key komponentas (pliusas Vercel'iui), bet versija „v1" leis ateityje
 *  bump'inti cache'ą be tag invalidation'o. */
const cachedFetchLatestTracksRaw = unstable_cache(
  async (_version: string) => fetchLatestTracksRaw(),
  ['home-latest-tracks-raw'],
  { tags: [HOME_TAGS.tracks], revalidate: 300 }
)


/**
 * Grąžina LT + World lane'us su top N (po dedupe per artist).
 * Dedupe taisyklė: kai artist'as turi >=2 šviežius tracks, paliekam tą su
 * didžiausiu video_views skaičiumi. Po dedupe rūšiuojam vėl pagal datą DESC.
 */
export async function getLatestTracksForHome(): Promise<{
  lt: LatestTrackRow[]
  world: LatestTrackRow[]
  /** Total kandidatų skaičius po dedupe per artist, prieš slice. Naudojam
   *  „+N" badge'uose, kad user'is matytų realų DB count'ą (ne tik 10 UI). */
  totalLt: number
  totalWorld: number
  /** Pilni (ne-sliced) lane'ai — DEDUPLICATED per artist (homepage juostai). */
  ltFull: LatestTrackRow[]
  worldFull: LatestTrackRow[]
  /** Ne-dedup'inti (visi šviežūs track'ai, keli per atlikėją) — naudojami
   *  /api/home/list modal'o pilnam sąrašui, kad rodytų DAUGIAU dainų. */
  ltRaw: LatestTrackRow[]
  worldRaw: LatestTrackRow[]
}> {
  let rows: LatestTrackRow[]
  try {
    // v6: cache-key bump'as — naujas deploy startuoja su ŠVARIU cache'u
    // (neserve'inam jokio anksčiau užnuodyto tuščio entry po deploy).
    rows = await cachedFetchLatestTracksRaw('v6-saugiklis')
  } catch (e) {
    // Empty-guard arba DB klaida → jei turim paskutinį gerą rezultatą warm
    // instance'e, serve'inam jį (ne tuščią „...netrukus"). Antraip propaguojam.
    if (lastGood.tracks) {
      console.error('[home-latest] tracks fetch failed — serving last-known-good:', (e as any)?.message)
      return lastGood.tracks
    }
    throw e
  }

  // Filtruojam mojibake / placeholder titles, kur title == artist name.
  // + block-list: Rusijos atlikėjai niekada nerodomi homepage'e.
  // + hide_from_homepage: admin'as rankiniu būdu paslėpė dainą iš homepage
  //   (juostose IR „Daugiau" modale). Daina lieka matoma visur kitur. 2026-06-23.
  let valid = rows.filter(
    r => r.artists && r.title && r.title !== r.artists.name &&
      !isBlockedCountry(r.artists.country) && !r.hide_from_homepage
  )

  // ── Reissue filter ──
  // YT video_uploaded_at recent (90d) gali būti tik perleidimas seno track'o.
  // Atfiltruojam jei:
  //   - track.release_year < currentYear - 1 (track aiškiai senesnis), arba
  //   - track turi entry album_tracks lentelėje, kur albums.year < currentYear - 1
  //     (track yra senesniame albume).
  // Pora paskutinių metų laikom „nauju" — kompiliacijos, late releases gali turėti.
  const currentYear = new Date().getFullYear()
  const FRESH_YEAR_THRESHOLD = currentYear - 1
  valid = valid.filter(r => {
    // Track'o paties release_year arba release_date metai
    const tYear = r.release_year ?? (r.release_date ? Number(r.release_date.slice(0, 4)) : null)
    if (tYear && tYear < FRESH_YEAR_THRESHOLD) return false
    // Bet kuris linked album'as senesnis → reissue
    const albumYears = (r.album_tracks || [])
      .map(at => at.albums?.year ?? null)
      .filter((y): y is number => typeof y === 'number')
    if (albumYears.length > 0) {
      const minYear = Math.min(...albumYears)
      if (minYear < FRESH_YEAR_THRESHOLD) return false
    }
    return true
  })

  const uploadMs = (r: LatestTrackRow) =>
    r.video_uploaded_at ? Date.parse(r.video_uploaded_at)
      : r.release_date ? Date.parse(r.release_date) : 0
  // Įkėlimo DIENA (YYYY-MM-DD) — be valandų, kad to paties tako kelios versijos
  // įkeltos tą pačią dieną būtų laikomos „ta pačia diena".
  const uploadDay = (r: LatestTrackRow) => {
    const src = r.video_uploaded_at || r.release_date || ''
    return src.slice(0, 10)
  }

  // ── Tos pačios DAINOS dedup ──
  // Ta pati daina gali turėti kelis įrašus (perįkėlimai, „(Live)"/„(Acoustic)"
  // versijos). Rodom TIK vieną:
  //   - skirtingos įkėlimo dienos → naujausia;
  //   - ta pati diena → daugiausiai YT peržiūrų.
  // Raktas = atlikėjas + normalizuotas pavadinimas (be skliaustų/skyrybos).
  // Edvardo prašymu 2026-06-09.
  const normTitle = (t: string) =>
    (t || '')
      .toLowerCase()
      .replace(/[\(\[\{].*?[\)\]\}]/g, ' ')   // pašalinam (Live), [Remix] ir pan.
      .replace(/feat\.?.*$/i, ' ')            // feat ... uodegą
      .replace(/[^\p{L}\p{N}]+/gu, ' ')       // skyryba/diakritika → tarpas
      .trim()
      .replace(/\s+/g, ' ')
  const pickBetter = (a: LatestTrackRow, b: LatestTrackRow) => {
    const da = uploadDay(a), db = uploadDay(b)
    if (da !== db) return db > da ? b : a          // skirtinga diena → naujausia
    return (b.video_views ?? 0) > (a.video_views ?? 0) ? b : a  // ta pati diena → peržiūros
  }
  const songDedupe = (arr: LatestTrackRow[]) => {
    const byKey = new Map<string, LatestTrackRow>()
    for (const r of arr) {
      const k = `${r.artist_id}::${normTitle(r.title)}`
      const ex = byKey.get(k)
      byKey.set(k, ex ? pickBetter(ex, r) : r)
    }
    return Array.from(byKey.values()).sort((a, b) => uploadMs(b) - uploadMs(a))
  }

  // Per-atlikėją dedup — VIENA daina per atlikėją (ir homepage juostai, IR
  // modalui). Atlikėjui išleidus albumą per dieną atsiranda daug takelių (pvz.
  // Latto 9 dainų) — rodom tik vieną reprezentatyvią. Atranka per pickBetter:
  // skirtingos dienos → naujausia, ta pati diena → daugiausiai YT peržiūrų.
  // Edvardo prašymu 2026-06-09 (modalas vis tiek rodė kelias to paties atlikėjo).
  const dedupe = (arr: LatestTrackRow[]) => {
    const byArtist = new Map<number, LatestTrackRow>()
    for (const r of arr) {
      const existing = byArtist.get(r.artist_id)
      byArtist.set(r.artist_id, existing ? pickBetter(existing, r) : r)
    }
    // Atstatom rūšiavimą pagal upload datą DESC (Map saugojo paskutinį, ne tvarką).
    return Array.from(byArtist.values()).sort((a, b) => uploadMs(b) - uploadMs(a))
  }

  // raw = vienas įrašas per DAINĄ (paliekam suderinamumui; modalas dabar naudoja
  // Full = vienas per atlikėją). Full = per-artist dedup ant song-dedup'into raw.
  const ltRaw = songDedupe(valid.filter(r => isLT(r.artists?.country)))
  const worldRaw = songDedupe(valid.filter(r => !isLT(r.artists?.country)))
  const ltFull = dedupe(ltRaw)
  const worldFull = dedupe(worldRaw)

  // ── Rikiavimas pagal DATĄ (naujausi pirma) ──
  // Visi pilni sąrašai (ltFull/worldFull/raw) — chronologiškai. „Daugiau →"
  // modalas (/api/home/list) ima ltFull/worldFull ir turi savo sort toggle.
  ltFull.sort((a, b) => uploadMs(b) - uploadMs(a))
  worldFull.sort((a, b) => uploadMs(b) - uploadMs(a))
  ltRaw.sort((a, b) => uploadMs(b) - uploadMs(a))
  worldRaw.sort((a, b) => uploadMs(b) - uploadMs(a))

  // ── Homepage juosta: TIK populiarūs, surikiuoti pagal datą ──
  const trackPopScore = (r: LatestTrackRow) => {
    const s = (r.artists?.score ?? 0) / 100
    const v = (r.video_views ?? 0) > 0 ? Math.log10(r.video_views as number) / 8 : 0
    return s * 0.7 + v * 0.3
  }
  const isPopTrack = (lane: 'lt' | 'world') => (r: LatestTrackRow) =>
    (r.artists?.score ?? 0) >= POP_THRESHOLDS.tracks[lane].score ||
    (r.video_views ?? 0) >= POP_THRESHOLDS.tracks[lane].views

  const result = {
    lt: selectPopularStrip(ltFull, isPopTrack('lt'), trackPopScore, uploadMs, HOME_LANE_LIMIT),
    world: selectPopularStrip(worldFull, isPopTrack('world'), trackPopScore, uploadMs, HOME_LANE_LIMIT),
    totalLt: ltFull.length,
    totalWorld: worldFull.length,
    ltFull,
    worldFull,
    ltRaw,
    worldRaw,
  }
  // Įsimenam kaip last-known-good tik jei realiai turim turinio.
  if (result.lt.length + result.world.length > 0) lastGood.tracks = result
  return result
}

/* ────────────────────────────── Albums ────────────────────────────── */

// Vienas query su padidintu limitu (buvo 200, bet albumų year>=2025 yra 600+ —
// LT albumai nustumiami, nes world albumų yra žymiai daugiau). 800 padengia
// visus 2025+2026 metus su atsarga. JS-lygio LT/World split pagal isLT().
async function fetchLatestAlbumsRaw(): Promise<LatestAlbumRow[]> {
  const supabase = createAdminClient()
  const currentYear = new Date().getFullYear()
  const { data, error } = await withRetry(async () => {
    const res = await supabase
      .from('albums')
      .select(
        'id, title, slug, cover_image_url, year, month, day, is_upcoming, created_at, artist_id, ' +
          'artists!albums_artist_id_fkey(id, name, slug, cover_image_url, country, score)'
      )
      .not('year', 'is', null)
      .gte('year', currentYear - 1)
      .order('year', { ascending: false })
      .order('month', { ascending: false, nullsFirst: false })
      .order('day', { ascending: false, nullsFirst: false })
      .limit(800)
    if (res.error) throw res.error
    return res
  }, { label: 'albums.latest' })
  if (error) throw error
  const out = (data || []) as unknown as LatestAlbumRow[]
  // Empty-guard — žr. fetchLatestTracksRaw. year>=currentYear-1 albumų sveikoje
  // DB visada yra; 0 eilučių = transient → throw (necache'inam tuščio).
  if (out.length === 0) {
    throw new Error('fetchLatestAlbumsRaw returned 0 rows — treating as transient failure (not caching)')
  }
  return out
}

const cachedFetchLatestAlbumsRaw = unstable_cache(
  async (_version: string) => fetchLatestAlbumsRaw(),
  ['home-latest-albums-raw-v2'],
  { tags: [HOME_TAGS.albums], revalidate: 300 }
)


export async function getLatestAlbumsForHome(): Promise<{
  lt: LatestAlbumRow[]
  world: LatestAlbumRow[]
  totalLt: number
  totalWorld: number
  ltFull: LatestAlbumRow[]
  worldFull: LatestAlbumRow[]
}> {
  let rows: LatestAlbumRow[]
  try {
    rows = await cachedFetchLatestAlbumsRaw('v3-saugiklis')
  } catch (e) {
    if (lastGood.albums) {
      console.error('[home-latest] albums fetch failed — serving last-known-good:', (e as any)?.message)
      return lastGood.albums
    }
    throw e
  }
  const today = new Date()
  const isReleased = (a: LatestAlbumRow) => {
    if (a.is_upcoming) return false
    if (!a.year) return false
    if (a.year < today.getFullYear()) return true
    if (a.year > today.getFullYear()) return false
    // month=NULL šių metų albumui → laikome išleistu (albumas jau egzistuoja,
    // tiesiog neturi tikslios datos). Anksčiau default'ino į 12 → klaidingai
    // filtruodavo kaip „neišleistą" kai dabartinis mėnuo < 12.
    const m = a.month ?? 1
    const d = a.day ?? 1
    const cm = today.getMonth() + 1
    const cd = today.getDate()
    if (m < cm) return true
    if (m > cm) return false
    return d <= cd
  }
  // Albumai BE jokio paveikslėlio (nei savo cover, nei atlikėjo nuotraukos)
  // nerodomi — kitaip homepage'e atsiranda tušti placeholder'iai. Edvardo
  // prašymu 2026-06-09. (Atlikėjo nuotrauka kaip fallback'as leidžiama.)
  const hasCover = (r: LatestAlbumRow) => !!(r.cover_image_url || r.artists?.cover_image_url)
  const released = rows.filter(
    r => r.artists && isReleased(r) && hasCover(r) && !isBlockedCountry(r.artists!.country)
  )
  const ltAll = released.filter(r => isLT(r.artists!.country))
  const worldAll = released.filter(r => !isLT(r.artists!.country))

  // ── Rikiavimas pagal DATĄ (naujausi pirma) ──
  // Albumų „data" = year/month/day konvertuota į ms. ltAll/worldAll naudoja
  // „Daugiau →" modalas (su savo sort toggle).
  const albumDateMs = (a: LatestAlbumRow) => {
    if (!a.year) return 0
    return new Date(a.year, (a.month ?? 1) - 1, a.day ?? 1).getTime()
  }
  ltAll.sort((a, b) => albumDateMs(b) - albumDateMs(a))
  worldAll.sort((a, b) => albumDateMs(b) - albumDateMs(a))

  // ── Homepage juosta: TIK populiarūs (pagal artist.score), pagal datą ──
  const albumPopScore = (a: LatestAlbumRow) => (a.artists?.score ?? 0) / 100
  const isPopAlbum = (lane: 'lt' | 'world') => (a: LatestAlbumRow) =>
    (a.artists?.score ?? 0) >= POP_THRESHOLDS.albums[lane].score

  const result = {
    lt: selectPopularStrip(ltAll, isPopAlbum('lt'), albumPopScore, albumDateMs, HOME_LANE_LIMIT),
    world: selectPopularStrip(worldAll, isPopAlbum('world'), albumPopScore, albumDateMs, HOME_LANE_LIMIT),
    totalLt: ltAll.length,
    totalWorld: worldAll.length,
    ltFull: ltAll,
    worldFull: worldAll,
  }
  if (result.lt.length + result.world.length > 0) lastGood.albums = result
  return result
}

/* ────────────────────────────── Upcoming Albums ──────────────────────────────
   „Greitai pasirodys" — albumai, kurie dar neišleisti (is_upcoming=true arba
   release data ateityje). Bendras sąrašas (be LT/World split), rikiuojam pagal
   data ASC (artimiausi pirmiausia). */

async function fetchUpcomingAlbumsRaw(): Promise<LatestAlbumRow[]> {
  const supabase = createAdminClient()
  const currentYear = new Date().getFullYear()
  // Plati selection: is_upcoming=true ARBA year >= currentYear (po-filter'inam
  // future dates inline). NULL year'us praleidžiam (be info — neaiški data).
  // Retry kaip ir kitur. PASTABA: upcoming gali būti realiai tuščias (gali
  // nebūti būsimų albumų) — todėl ČIA NĖRA empty-guard throw'o.
  const { data, error } = await withRetry(async () => {
    const res = await supabase
      .from('albums')
      .select(
        'id, title, slug, cover_image_url, year, month, day, is_upcoming, created_at, artist_id, ' +
          'artists!albums_artist_id_fkey(id, name, slug, cover_image_url, country, score)'
      )
      .not('year', 'is', null)
      .gte('year', currentYear)
      .order('year', { ascending: true })
      .order('month', { ascending: true, nullsFirst: true })
      .order('day', { ascending: true, nullsFirst: true })
      .limit(ALBUMS_CANDIDATE_FETCH_LIMIT)
    if (res.error) throw res.error
    return res
  }, { label: 'albums.upcoming' })
  if (error) throw error
  return (data || []) as unknown as LatestAlbumRow[]
}

const cachedFetchUpcomingAlbumsRaw = unstable_cache(
  async (_version: string) => fetchUpcomingAlbumsRaw(),
  ['home-upcoming-albums-raw'],
  { tags: [HOME_TAGS.albums], revalidate: 300 }
)

export async function getUpcomingAlbumsForHome(): Promise<{
  items: LatestAlbumRow[]
  total: number
  full: LatestAlbumRow[]
}> {
  let rows: LatestAlbumRow[]
  try {
    rows = await cachedFetchUpcomingAlbumsRaw('v2-saugiklis')
  } catch (e) {
    if (lastGood.upcoming) {
      console.error('[home-latest] upcoming fetch failed — serving last-known-good:', (e as any)?.message)
      return lastGood.upcoming
    }
    throw e
  }
  const today = new Date()
  const isFuture = (a: LatestAlbumRow) => {
    if (a.is_upcoming) return true
    if (!a.year) return false
    // Reikia bent mėnesio: vien metai (be tikslesnės datos) NĖRA „greitai
    // pasirodys". Be šito year-only albumas gaudavo default month=12/day=31 ir
    // klaidingai patekdavo į sekciją kaip ateities data.
    if (!a.month) return false
    if (a.year > today.getFullYear()) return true
    if (a.year < today.getFullYear()) return false
    const m = a.month
    const d = a.day ?? 31
    const cm = today.getMonth() + 1
    const cd = today.getDate()
    if (m > cm) return true
    if (m < cm) return false
    return d > cd
  }
  // Be paveikslėlio (savo cover ar atlikėjo nuotraukos) — nerodom (žr.
  // getLatestAlbumsForHome). 2026-06-09.
  const hasCover = (r: LatestAlbumRow) => !!(r.cover_image_url || r.artists?.cover_image_url)
  const filtered = rows.filter(
    r => r.artists && isFuture(r) && hasCover(r) && !isBlockedCountry(r.artists!.country)
  )

  // Upcoming: artimiausia data pirma, bet boost'inam populiarius.
  // Naudojam inverse šviežumą (arčiausiai = aukščiau) + artist score.
  const nowMs = Date.now()
  const upcomingHybrid = (a: LatestAlbumRow) => {
    const dateMs = a.year && a.month
      ? new Date(a.year, (a.month) - 1, a.day ?? 15).getTime()
      : nowMs + 365 * 86_400_000 // is_upcoming be datos → toliausia
    // Artimesni = didesnis šviežumas (inverse: kuo arčiau šiandien, tuo geriau)
    const distDays = Math.max(0, (dateMs - nowMs) / 86_400_000)
    const closeness = Math.max(0, 1 - distDays / 365) // 0–1
    const popArtist = Math.min(1, ((a.artists?.score ?? 0) || 0) / 80)
    return closeness * 0.7 + popArtist * 0.3
  }
  filtered.sort((a, b) => upcomingHybrid(b) - upcomingHybrid(a))

  const result = {
    items: filtered.slice(0, HOME_LANE_LIMIT * 2),
    total: filtered.length,
    full: filtered,
  }
  // Upcoming gali būti realiai tuščias — last-good tik kai turim turinio.
  if (result.items.length > 0) lastGood.upcoming = result
  return result
}

/* ────────────────────────────── Map helpers ──────────────────────────────
   Backward-compat'us output'o formavimas — homepage UI'ui reikalingi `artists`
   nested objektai + flat aliases (artist_slug, artist_name). Adapt'inam į tą
   patį shape'ą, kaip ir esamas /api/tracks ir /api/albums.
*/

export function mapTrackForHome(t: LatestTrackRow) {
  const isNew = t.created_at
    ? (Date.now() - Date.parse(t.created_at)) < NEW_BADGE_DAYS * 86_400_000
    : false
  return {
    id: t.id,
    title: t.title,
    slug: t.slug,
    cover_url: t.cover_url,
    video_url: t.video_url,
    video_views: t.video_views ?? null,
    video_uploaded_at: t.video_uploaded_at,
    release_year: t.release_year ?? null,
    release_date: t.release_date ?? null,
    artist_id: t.artist_id,
    artists: t.artists,
    artist_name: t.artists?.name || '',
    artist_slug: t.artists?.slug || '',
    is_new: isNew,
  }
}

export function mapAlbumForHome(a: LatestAlbumRow) {
  const release_date =
    a.year && a.month && a.day
      ? `${a.year}-${String(a.month).padStart(2, '0')}-${String(a.day).padStart(2, '0')}`
      : a.year && a.month
        ? `${a.year}-${String(a.month).padStart(2, '0')}-01`
        : null
  const isNew = a.created_at
    ? (Date.now() - Date.parse(a.created_at)) < NEW_BADGE_DAYS * 86_400_000
    : false
  return {
    id: a.id,
    title: a.title,
    slug: a.slug,
    cover_image_url: a.cover_image_url,
    cover_url: a.cover_image_url,
    year: a.year,
    month: a.month,
    day: a.day,
    is_upcoming: a.is_upcoming,
    is_new: isNew,
    release_date,
    artist_id: a.artist_id,
    artists: a.artists,
    artist_name: a.artists?.name || '',
    artist_slug: a.artists?.slug || '',
  }
}
