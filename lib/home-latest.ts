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

import { unstable_cache, revalidateTag } from 'next/cache'
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
// Po 2026-05-28 Pro plan upgrade + architectural slim-down + VACUUM FULL:
// DB grįžo į healthy state, statement_timeout 60s, MICRO compute (1 GB RAM).
// Atstatom limit'ą į 200 — gauname pilnesnį candidate pool dedupe'ui.
const TRACKS_CANDIDATE_FETCH_LIMIT = 200
const ALBUMS_CANDIDATE_FETCH_LIMIT = 200

/* ────────────────────────────── Tags ────────────────────────────── */

export const HOME_TAGS = {
  tracks: 'home:tracks-latest',
  albums: 'home:albums-latest',
  news: 'home:news-latest',
  events: 'home:events-latest',
} as const

/** Iškviečiamas iš POST/PUT/DELETE endpoint'ų po naujo track/album/news/event. */
export function revalidateHomeTag(kind: keyof typeof HOME_TAGS) {
  try {
    revalidateTag(HOME_TAGS[kind])
  } catch {
    /* dev mode silently no-ops */
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
  artist_id: number
  artists: { id: number; name: string; slug: string; cover_image_url: string | null; country: string | null } | null
}

/* ────────────────────────────── Helpers ────────────────────────────── */

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

function isLT(country: string | null | undefined): boolean {
  if (!country) return true
  return LT_COUNTRIES.includes(country)
}

/* ────────────────────────────── Tracks ────────────────────────────── */

async function fetchLatestTracksRaw(): Promise<LatestTrackRow[]> {
  const supabase = createAdminClient()
  const since = isoDaysAgo(LATEST_TRACK_WINDOW_DAYS)
  // Po Pro plan + slim-down: galim atstatyti `album_tracks(albums(year))`
  // JOIN'ą reissue filter'iui. Su 200 candidates Pro tier (1 GB RAM,
  // 2-core ARM) atsako per ~500ms.
  const { data, error } = await supabase
    .from('tracks')
    .select(
      'id, title, slug, cover_url, video_url, video_views, video_uploaded_at, ' +
        'release_date, release_year, artist_id, ' +
        'artists!tracks_artist_id_fkey(id, name, slug, cover_image_url, country), ' +
        'album_tracks(albums(id, year))'
    )
    .not('video_uploaded_at', 'is', null)
    .gte('video_uploaded_at', since)
    .order('video_uploaded_at', { ascending: false })
    .limit(TRACKS_CANDIDATE_FETCH_LIMIT)
  if (error) throw error
  return (data || []) as unknown as LatestTrackRow[]
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
  const rows = await cachedFetchLatestTracksRaw('v5-pro-200')

  // Filtruojam mojibake / placeholder titles, kur title == artist name.
  // + block-list: Rusijos atlikėjai niekada nerodomi homepage'e.
  let valid = rows.filter(
    r => r.artists && r.title && r.title !== r.artists.name && !isBlockedCountry(r.artists.country)
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
  return {
    lt: ltFull.slice(0, HOME_LANE_LIMIT),
    world: worldFull.slice(0, HOME_LANE_LIMIT),
    totalLt: ltFull.length,
    totalWorld: worldFull.length,
    ltFull,
    worldFull,
    ltRaw,
    worldRaw,
  }
}

/* ────────────────────────────── Albums ────────────────────────────── */

async function fetchLatestAlbumsRaw(): Promise<LatestAlbumRow[]> {
  const supabase = createAdminClient()
  // Pinam ne tik 90d back ranges — albumai turi tik year/month/day be timestamp'o.
  // Skirta filter'is — bent metai turi būti šių arba praeitų metų (current-1 ar
  // current). Be šito „latest" rodytų visus kurie turi year != NULL.
  const currentYear = new Date().getFullYear()
  const { data, error } = await supabase
    .from('albums')
    .select(
      'id, title, slug, cover_image_url, year, month, day, is_upcoming, artist_id, ' +
        'artists!albums_artist_id_fkey(id, name, slug, cover_image_url, country)'
    )
    .not('year', 'is', null)
    .gte('year', currentYear - 1)
    .order('year', { ascending: false })
    .order('month', { ascending: false, nullsFirst: false })
    .order('day', { ascending: false, nullsFirst: false })
    .limit(ALBUMS_CANDIDATE_FETCH_LIMIT)
  if (error) throw error
  return (data || []) as unknown as LatestAlbumRow[]
}

const cachedFetchLatestAlbumsRaw = unstable_cache(
  async (_version: string) => fetchLatestAlbumsRaw(),
  ['home-latest-albums-raw'],
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
  const rows = await cachedFetchLatestAlbumsRaw('v1')
  const today = new Date()
  const isReleased = (a: LatestAlbumRow) => {
    if (a.is_upcoming) return false
    if (!a.year) return false
    if (a.year < today.getFullYear()) return true
    if (a.year > today.getFullYear()) return false
    const m = a.month ?? 12
    const d = a.day ?? 31
    const cm = today.getMonth() + 1
    const cd = today.getDate()
    if (m < cm) return true
    if (m > cm) return false
    return d <= cd
  }
  // Albumai BE jokio paveikslėlio (nei savo cover, nei atlikėjo nuotraukos)
  // nerodomi — kitaip homepage'e atsiranda tušti 💿 placeholder'iai. Edvardo
  // prašymu 2026-06-09. (Atlikėjo nuotrauka kaip fallback'as leidžiama.)
  const hasCover = (r: LatestAlbumRow) => !!(r.cover_image_url || r.artists?.cover_image_url)
  const released = rows.filter(
    r => r.artists && isReleased(r) && hasCover(r) && !isBlockedCountry(r.artists.country)
  )
  const ltAll = released.filter(r => isLT(r.artists!.country))
  const worldAll = released.filter(r => !isLT(r.artists!.country))
  return {
    lt: ltAll.slice(0, HOME_LANE_LIMIT),
    world: worldAll.slice(0, HOME_LANE_LIMIT),
    totalLt: ltAll.length,
    totalWorld: worldAll.length,
    ltFull: ltAll,
    worldFull: worldAll,
  }
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
  const { data, error } = await supabase
    .from('albums')
    .select(
      'id, title, slug, cover_image_url, year, month, day, is_upcoming, artist_id, ' +
        'artists!albums_artist_id_fkey(id, name, slug, cover_image_url, country)'
    )
    .not('year', 'is', null)
    .gte('year', currentYear)
    .order('year', { ascending: true })
    .order('month', { ascending: true, nullsFirst: true })
    .order('day', { ascending: true, nullsFirst: true })
    .limit(ALBUMS_CANDIDATE_FETCH_LIMIT)
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
  const rows = await cachedFetchUpcomingAlbumsRaw('v1')
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
  return {
    items: filtered.slice(0, HOME_LANE_LIMIT * 2),
    total: filtered.length,
    full: filtered,
  }
}

/* ────────────────────────────── Map helpers ──────────────────────────────
   Backward-compat'us output'o formavimas — homepage UI'ui reikalingi `artists`
   nested objektai + flat aliases (artist_slug, artist_name). Adapt'inam į tą
   patį shape'ą, kaip ir esamas /api/tracks ir /api/albums.
*/

export function mapTrackForHome(t: LatestTrackRow) {
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
  }
}

export function mapAlbumForHome(a: LatestAlbumRow) {
  const release_date =
    a.year && a.month && a.day
      ? `${a.year}-${String(a.month).padStart(2, '0')}-${String(a.day).padStart(2, '0')}`
      : a.year && a.month
        ? `${a.year}-${String(a.month).padStart(2, '0')}-01`
        : null
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
    release_date,
    artist_id: a.artist_id,
    artists: a.artists,
    artist_name: a.artists?.name || '',
    artist_slug: a.artists?.slug || '',
  }
}
