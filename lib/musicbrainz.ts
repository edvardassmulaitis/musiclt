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
  const wait = _lastCall + 700 - now
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

export type MbTrack = { position: number; title: string; length: number | null; discNumber: number }

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
      tracks.push({ position: globalPos, title, length: t.length ?? t.recording?.length ?? null, discNumber: discIdx + 1 })
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

/**
 * Ieško, ar duota daina (artist + title) priklauso kokiam nors ALBUM/EP tipo
 * official release'ui. Grąžina geriausią (pilniausią) kandidatą arba null.
 * Best-effort: tinklo/klaidų atveju grąžina null (niekada nemeta).
 */
export async function findAlbumForRecording(artistName: string, trackTitle: string): Promise<MbAlbumMatch | null> {
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
  const candidates: Candidate[] = []
  for (const rec of recordings) {
    if (foldCompare(rec.title || '') !== wantTitle) continue
    const creditOk = (rec['artist-credit'] || []).some(
      (ac: any) => foldCompare(ac?.artist?.name || ac?.name || '') === wantArtist
    )
    if (!creditOk) continue
    for (const rel of rec.releases || []) {
      const rg = rel['release-group']
      const type = rg?.['primary-type']
      if (type !== 'Album' && type !== 'EP') continue
      if (rel.status && rel.status !== 'Official') continue
      candidates.push({ release: rel, releaseGroup: rg })
    }
  }
  if (!candidates.length) return null

  // Pirmenybė pilniausiam (daugiausiai track'ų) official release'ui — dažnai
  // egzistuoja keli variantai (standard/deluxe), norim to, kuris turi
  // daugiausiai duomenų.
  candidates.sort((a, b) => (b.release['track-count'] || 0) - (a.release['track-count'] || 0))
  const best = candidates[0]

  const full = await fetchReleaseTracklist(best.release.id)
  if (!full) return null

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
    releaseId: full.releaseId,
    releaseGroupId: full.releaseGroupId,
    title: full.title,
    primaryType: full.primaryType,
    year: full.year, month: full.month, day: full.day,
    trackCount: full.tracks.length,
    matchedPosition,
    tracks: full.tracks,
    isPlaceholderish: placeholderish,
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

export { msToDuration, foldCompare }
