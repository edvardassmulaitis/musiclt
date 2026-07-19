/**
 * MusicBrainz — laisva, atvira muzikos metaduomenų bazė, be autentifikacijos
 * (~1200 užklausų/val anoniminiam klientui, žr. `x-ratelimit-*` header'ius).
 *
 * Naudojama patikrinti, ar quick-add'inama YouTube daina priklauso (ar
 * priklausys) kokiam nors ALBUM/EP tipo release'ui. Palyginta su Wikipedia:
 * MusicBrainz DAŽNAI turi pilną tracklist'ą greičiau — Wikipedia
 * `{{Track listing}}` šablonas dažnai lieka beveik tuščias savaites po albumo
 * anonso (editoriai sukuria skeletą iš karto, bet pildo pavadinimus vėliau).
 *
 * Testuota gyvai 2026-07-16 (žr. MUSIC_DISCOVERY_AUTOMATION_PLAN.md): Carly Rae
 * Jepsen „On Wires" → MusicBrainz jau turėjo pilną 25 dainų „Day and Night"
 * tracklist'ą (rel. 2026-09-18), kai Wikipedia track listing šablone buvo
 * užpildyti tik 2 iš 12 laukų (likusieji — tušti placeholder'iai).
 *
 * API dokumentacija: https://musicbrainz.org/doc/MusicBrainz_API
 * Etiketas: reikalauja aprašomo User-Agent'o, be to — anoniminiams klientams
 * rekomenduojama ~1 req/sek (žemiau throttle'inam paprastu module-level laiku).
 */

const MB_BASE = 'https://musicbrainz.org/ws/2'
const MB_USER_AGENT = 'musiclt/1.0 (+https://music.lt)'

let _lastCall = 0
async function mbThrottle(): Promise<void> {
  const now = Date.now()
  const wait = _lastCall + 500 - now
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  _lastCall = Date.now()
}

async function mbFetch(path: string): Promise<any> {
  await mbThrottle()
  const res = await fetch(`${MB_BASE}${path}`, {
    headers: { 'User-Agent': MB_USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`MusicBrainz HTTP ${res.status}`)
  return res.json()
}

/** Diakritikos/case-insensitive palyginimui (ne DB paieškai — tik in-memory match).
 *  NFD išskaido raidę į bazę + combining mark'us (U+0300..U+036F rėžyje) —
 *  filtruojam pagal code point'ą, ne regex \u escape (patikimiau editoriuose). */
function foldCompare(s: string): string {
  const nfd = (s || '').toLowerCase().normalize('NFD')
  let out = ''
  for (const ch of nfd) {
    const cp = ch.codePointAt(0) || 0
    if (cp >= 0x0300 && cp <= 0x036f) continue // combining diacritical mark — drop
    out += /[a-z0-9]/.test(ch) ? ch : ' '
  }
  return out.replace(/\s+/g, ' ').trim()
}

/** MB Lucene query viduje kabutės/backslash'ai laužytų sintaksę — nuimam. */
function escapeLucene(s: string): string {
  return (s || '').replace(/["\\]/g, '').trim()
}

function msToDuration(ms: number | null): string | undefined {
  if (!ms || !Number.isFinite(ms)) return undefined
  const totalSec = Math.round(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function parseIsoDate(d?: string | null): { year: number | null; month: number | null; day: number | null } {
  if (!d) return { year: null, month: null, day: null }
  const m = d.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/)
  if (!m) return { year: null, month: null, day: null }
  return { year: +m[1], month: m[2] ? +m[2] : null, day: m[3] ? +m[3] : null }
}

export type MbTrack = { position: number; title: string; length: number | null; discNumber: number; recordingId: string | null }

export type MbReleaseTracklist = {
  releaseId: string
  releaseGroupId: string | null
  title: string
  primaryType: string | null
  year: number | null
  month: number | null
  day: number | null
  tracks: MbTrack[]
}

/** Pilnas release'o tracklist'as pagal MB release ID. Naudojama tiek preview,
 *  tiek commit (re-fetch commit metu, kad turėtume šviežiausius duomenis). */
export async function fetchReleaseTracklist(releaseId: string): Promise<MbReleaseTracklist | null> {
  let full: any
  try {
    full = await mbFetch(`/release/${releaseId}?fmt=json&inc=recordings+release-groups`)
  } catch {
    return null
  }
  const tracks: MbTrack[] = []
  let globalPos = 0
  ;(full.media || []).forEach((medium: any, discIdx: number) => {
    for (const t of medium.tracks || []) {
      globalPos++
      const title = t.title || t.recording?.title || ''
      tracks.push({
        position: globalPos, title,
        length: t.length ?? t.recording?.length ?? null,
        discNumber: discIdx + 1,
        recordingId: t.recording?.id || null,
      })
    }
  })
  if (!tracks.length) return null

  const { year, month, day } = parseIsoDate(full.date)
  return {
    releaseId: full.id,
    releaseGroupId: full['release-group']?.id || null,
    title: full['release-group']?.title || full.title,
    primaryType: full['release-group']?.['primary-type'] || null,
    year, month, day,
    tracks,
  }
}

export type MbAlbumMatch = {
  releaseId: string
  releaseGroupId: string | null
  title: string
  primaryType: string | null
  year: number | null
  month: number | null
  day: number | null
  trackCount: number
  matchedPosition: number | null
  tracks: MbTrack[]
  isPlaceholderish: boolean
}

export type MbRecordingAnalysis = {
  /** Ar duota daina priklauso kokiam nors ALBUM/EP tipo official release'ui. */
  albumMatch: MbAlbumMatch | null
  /** Ar bent viena šios dainos release'ų grupė yra tipo "Single" (release-group
   *  primary-type='Single') — MB dažnas atvejis: daina gali BŪTI ir single'as,
   *  IR priklausyti albumui vienu metu (pvz. lead single). Naudojama
   *  track.is_single žymėjimui (žr. lib/album-lookup.ts). */
  isSingleRelease: boolean
}

/**
 * Vienas recording paieškos kvietimas, iš kurio ištraukiam DVI faktais: (a) ar
 * daina priklauso ALBUM/EP release'ui, (b) ar egzistuoja atskiras "Single" tipo
 * release'as tai pačiai dainai. Sąmoningai VIENAS query (ne du atskiri), kad
 * nedvigubintume tinklo apkrovos/latency (žr. album-lookup.ts komentarą apie
 * quick-add preview greitį).
 *
 * Best-effort: tinklo/klaidų atveju grąžina null (niekada nemeta).
 */
export async function analyzeRecording(artistName: string, trackTitle: string): Promise<MbRecordingAnalysis | null> {
  const artistQ = escapeLucene(artistName)
  const titleQ = escapeLucene(trackTitle)
  if (!artistQ || !titleQ) return null

  let json: any
  try {
    json = await mbFetch(
      `/recording/?query=${encodeURIComponent(`recording:"${titleQ}" AND artist:"${artistQ}"`)}&fmt=json&limit=10`
    )
  } catch {
    return null
  }

  const recordings: any[] = json?.recordings || []
  const wantTitle = foldCompare(trackTitle)
  const wantArtist = foldCompare(artistName)

  type Candidate = { release: any; releaseGroup: any }
  const albumCandidates: Candidate[] = []
  let isSingleRelease = false

  for (const rec of recordings) {
    if (foldCompare(rec.title || '') !== wantTitle) continue
    const creditOk = (rec['artist-credit'] || []).some(
      (ac: any) => foldCompare(ac?.artist?.name || ac?.name || '') === wantArtist
    )
    if (!creditOk) continue
    for (const rel of rec.releases || []) {
      const rg = rel['release-group']
      const type = rg?.['primary-type']
      if (type === 'Single') isSingleRelease = true
      if (type !== 'Album' && type !== 'EP') continue
      if (rel.status && rel.status !== 'Official') continue
      albumCandidates.push({ release: rel, releaseGroup: rg })
    }
  }

  if (!albumCandidates.length) return { albumMatch: null, isSingleRelease }

  // Pirmenybė pilniausiam (daugiausiai track'ų) official release'ui — dažnai
  // egzistuoja keli variantai (standard/deluxe), norim to, kuris turi
  // daugiausiai duomenų.
  albumCandidates.sort((a, b) => (b.release['track-count'] || 0) - (a.release['track-count'] || 0))
  const best = albumCandidates[0]

  const full = await fetchReleaseTracklist(best.release.id)
  if (!full) return { albumMatch: null, isSingleRelease }

  let matchedPosition: number | null = null
  for (const t of full.tracks) {
    if (foldCompare(t.title) === wantTitle) { matchedPosition = t.position; break }
  }
  // Jei track'as nerastas šio release'o tracklist'e (retas atvejis — recording
  // buvo susietas, bet track title skiriasi) — vis tiek grąžinam, bet be pozicijos.

  const placeholderish =
    full.tracks.length > 0 &&
    full.tracks.filter((t) => !t.title || /^track\s*\d+$/i.test(t.title.trim())).length / full.tracks.length > 0.15

  return {
    albumMatch: {
      releaseId: full.releaseId,
      releaseGroupId: full.releaseGroupId,
      title: full.title,
      primaryType: full.primaryType,
      year: full.year, month: full.month, day: full.day,
      trackCount: full.tracks.length,
      matchedPosition,
      tracks: full.tracks,
      isPlaceholderish: placeholderish,
    },
    isSingleRelease,
  }
}

/**
 * Ar konkretus recording'as (žinomas MBID, ne tekstinė paieška) priklauso
 * bent vienam "Single" tipo release-group'ui. Naudojama pažymėti VISŲ albumo
 * track'ų (ne tik pirminio quick-add'into) `is_single` MB-sourced albumo
 * kūrimo metu (žr. lib/quick-add.ts createAlbumFromMusicBrainz) — 2026-07-17,
 * Edvardo pastaba: anksčiau tik viena (quick-add'inta) daina gaudavo
 * is_single žymę, likę albumo track'ai — ne, nors MB dažnai turi tą info
 * kiekvienam track'ui atskirai.
 *
 * Tikslesnis nei `analyzeRecording()` šiam konkrečiam patikrinimui, nes
 * naudoja jau žinomą recording ID (iš `fetchReleaseTracklist`), o ne
 * tekstinę artist+title paiešką — nėra vardo/pavadinimo dviprasmybės rizikos.
 * Best-effort: klaidos atveju grąžina false (niekad nemeta, niekad nesulaiko
 * albumo sukūrimo).
 */
export async function isRecordingSingle(recordingId: string): Promise<boolean> {
  if (!recordingId) return false
  try {
    const json = await mbFetch(`/recording/${recordingId}?inc=releases+release-groups&fmt=json`)
    const releases: any[] = json?.releases || []
    return releases.some((r) => r?.['release-group']?.['primary-type'] === 'Single')
  } catch {
    return false
  }
}

/** Cover Art Archive — nemokamas, be auth, susietas su MB release ID.
 *  Grąžina URL tik jei viršelis realiai egzistuoja (HEAD patikra). */
export async function fetchMbCoverUrl(releaseId: string): Promise<string | null> {
  const url = `https://coverartarchive.org/release/${releaseId}/front-500`
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(8000) })
    if (res.ok) return url
  } catch { /* ignore — dažnai release'as tiesiog neturi cover art */ }
  return null
}

export type MbAlbumByTitle = {
  releaseId: string
  releaseGroupId: string | null
  title: string
  primaryType: string | null
  /** MB antriniai tipai: Remix / Live / Soundtrack / Compilation / DJ-mix / … */
  secondaryTypes: string[]
  year: number | null
  month: number | null
  day: number | null
  tracks: MbTrack[]
  coverUrl: string | null
}

/** Cover Art Archive pagal RELEASE-GROUP (kanoninis grupės viršelis) — dažnai
 *  teisingesnis nei konkretaus release'o (booklet/variantų art). */
async function fetchMbGroupCoverUrl(releaseGroupId: string): Promise<string | null> {
  const url = `https://coverartarchive.org/release-group/${releaseGroupId}/front-500`
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(8000) })
    if (res.ok) return url
  } catch { /* ignore */ }
  return null
}

/**
 * Albumo paieška MusicBrainz pagal ATLIKĖJĄ + ALBUMO PAVADINIMĄ (ne pagal dainą).
 * Naudojama naujo albumų siūlymo flow'e (Wiki album scout kandidatams praturtinti
 * BE priklausomybės nuo Wikipedia straipsnio): grąžina tikrą tracklist'ą + datą +
 * viršelį, jei MB turi šį release'ą.
 *
 * Best-effort: tinklo/klaidų atveju grąžina null (niekada nemeta).
 */
export async function searchAlbumByTitle(
  artistName: string,
  albumTitle: string,
  preferYear?: number | null,
): Promise<MbAlbumByTitle | null> {
  const artistQ = escapeLucene(artistName)
  const titleQ = escapeLucene(albumTitle)
  if (!artistQ || !titleQ) return null

  let json: any
  try {
    json = await mbFetch(
      `/release-group/?query=${encodeURIComponent(`releasegroup:"${titleQ}" AND artist:"${artistQ}" AND (primarytype:album OR primarytype:ep)`)}&fmt=json&limit=10`
    )
  } catch {
    return null
  }

  const wantTitle = foldCompare(albumTitle)
  const wantArtist = foldCompare(artistName)
  const groups: any[] = json?.['release-groups'] || []

  // Tikslus title + artist-credit atitikmuo; pirmenybė metų atitikmeniui, tada
  // Album prieš EP, tada aukščiausiam MB score'ui.
  const scored = groups
    .filter((rg) => {
      if (foldCompare(rg.title || '') !== wantTitle) return false
      return (rg['artist-credit'] || []).some(
        (ac: any) => foldCompare(ac?.artist?.name || ac?.name || '') === wantArtist
      )
    })
    .map((rg) => {
      const y = parseIsoDate(rg['first-release-date']).year
      const yearMatch = preferYear && y ? (y === preferYear ? 2 : (Math.abs(y - preferYear) <= 1 ? 1 : 0)) : 0
      const typeScore = rg['primary-type'] === 'Album' ? 1 : 0
      return { rg, rank: yearMatch * 10 + typeScore * 2 + (rg.score || 0) / 100 }
    })
    .sort((a, b) => b.rank - a.rank)

  const bestRg = scored[0]?.rg
  if (!bestRg?.id) return null

  // Release'ai grupėje → renkam oficialų su daugiausiai track'ų (pilniausias).
  let releases: any[] = []
  try {
    const rgFull = await mbFetch(`/release-group/${bestRg.id}?fmt=json&inc=releases+media`)
    releases = rgFull?.releases || []
  } catch {
    return null
  }
  if (!releases.length) return null

  const trackCountOf = (r: any) =>
    (r.media || []).reduce((s: number, m: any) => s + (m['track-count'] || 0), 0)
  const official = releases.filter((r) => !r.status || r.status === 'Official')
  const pool = official.length ? official : releases
  pool.sort((a, b) => trackCountOf(b) - trackCountOf(a))
  const bestRelease = pool[0]
  if (!bestRelease?.id) return null

  const full = await fetchReleaseTracklist(bestRelease.id)
  // Viršelis: pirma kanoninis release-group front, tada konkretaus release'o.
  const cover = (await fetchMbGroupCoverUrl(bestRg.id)) || (await fetchMbCoverUrl(bestRelease.id))

  const d = parseIsoDate(bestRg['first-release-date'])
  const secondaryTypes: string[] = Array.isArray(bestRg['secondary-types']) ? bestRg['secondary-types'] : []
  return {
    releaseId: bestRelease.id,
    releaseGroupId: bestRg.id,
    title: bestRg.title || albumTitle,
    primaryType: bestRg['primary-type'] || full?.primaryType || null,
    secondaryTypes,
    year: full?.year ?? d.year,
    month: full?.month ?? d.month,
    day: full?.day ?? d.day,
    tracks: full?.tracks || [],
    coverUrl: cover,
  }
}

export { msToDuration, foldCompare }
