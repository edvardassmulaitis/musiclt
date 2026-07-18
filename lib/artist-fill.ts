/**
 * lib/artist-fill.ts — vieno-click AI atlikėjo užpildymas (grounded).
 *
 * Kodėl atsirado (2026-07-17, Edvardo prašymas): esamas `/admin/artist-import`
 * yra copy-paste-į-GPT srautas (nukopijuoji promptą → paleidi išoriniame LLM →
 * įklijuoji JSON atgal). Norima serverio pusėje, vienu paspaudimu.
 *
 * KRITINĖ testų išvada (žr. `claude/musiclt-punktas-a-discovery-tests-2026-07-17b.md`
 * projekto dokumente): plain Haiku BE įžeminimo LT/nišiniams atlikėjams NEtinka
 * (blank'ina net dabartinius čarto atlikėjus, pvz. Jessica Shy → visi null).
 * Lemia GROUNDING, ne modelis. Todėl čia:
 *   1) deterministiškai fetch'inam faktus iš MusicBrainz (artist + release-groups
 *      su datomis/tipais) — tikslūs albumai/metai, kaip GPT output'e;
 *   2) paduodam tuos faktus modeliui (default Sonnet) kaip įžeminimą;
 *   3) modelis parašo lietuvišką bio + priskiria genre_group iš 8 leistinų +
 *      suformuoja import JSON pagal esamą ARTIST_IMPORT_PROMPT schemą.
 * Rezultatas grąžinamas į TĄ PATĮ `/admin/artist-import` preview/apply srautą —
 * `validateImportJson` sugauna schemos klaidas prieš išsaugant (saugu).
 *
 * Užsienio atlikėjams (Edvardo prioritetas — tie, kurių NĖRA Wikipedijoj):
 * MusicBrainz juos dažnai turi ten, kur Wikipedia tuščia — todėl MB įžeminimas
 * čia tinkamesnis nei `/api/artists/import` Wikipedia kelias.
 *
 * Best-effort visur: MB klaida → įžeminimas praleidžiamas, modelis kviečiamas be
 * jo (degraduoja į knowledge-only, bet niekada nemeta). Nėra ANTHROPIC_API_KEY →
 * grąžina aiškią klaidą.
 */

import { ARTIST_IMPORT_PROMPT } from './artist-import-prompt'

// Modelis: default Sonnet (aukštos vertės, mažo kiekio vieno-click veiksmas —
// kaina nereikšminga, kokybė svarbi, kad prilygtų GPT). Perrašoma env var'u.
const ARTIST_FILL_MODEL = process.env.ARTIST_FILL_MODEL || 'claude-sonnet-4-5'

// ── MusicBrainz įžeminimas ────────────────────────────────────────────────────
// Savarankiškas fetch (ne importuojam iš lib/musicbrainz.ts, kad neliestume to
// failo) — ta pati UA/throttle konvencija.

const MB_BASE = 'https://musicbrainz.org/ws/2'
const MB_USER_AGENT = 'musiclt/1.0 (+https://music.lt)'

let _mbLast = 0
async function mbThrottle(): Promise<void> {
  const now = Date.now()
  const wait = _mbLast + 500 - now
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  _mbLast = Date.now()
}

async function mbFetch(path: string): Promise<any | null> {
  await mbThrottle()
  try {
    const res = await fetch(`${MB_BASE}${path}`, {
      headers: { 'User-Agent': MB_USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

function escapeLucene(s: string): string {
  return (s || '').replace(/["\\]/g, '').trim()
}

function foldCompare(s: string): string {
  const nfd = (s || '').toLowerCase().normalize('NFD')
  let out = ''
  for (const ch of nfd) {
    const cp = ch.codePointAt(0) || 0
    if (cp >= 0x0300 && cp <= 0x036f) continue
    out += /[a-z0-9]/.test(ch) ? ch : ' '
  }
  return out.replace(/\s+/g, ' ').trim()
}

export type MbGroundingRelease = {
  title: string
  type: string // Album / EP / Single / ...
  secondary: string[] // Live, Compilation, Remix, ...
  year: number | null
}

export type MbGrounding = {
  found: boolean
  mbid?: string
  name?: string
  sortName?: string
  type?: string | null // Person / Group
  country?: string | null // ISO kodas, pvz. LT / GB / US
  gender?: string | null
  beginYear?: number | null
  endYear?: number | null
  ended?: boolean
  disambiguation?: string | null
  releases: MbGroundingRelease[]
}

function yearOf(d?: string | null): number | null {
  if (!d) return null
  const m = String(d).match(/^(\d{4})/)
  return m ? +m[1] : null
}

/**
 * Fetch'ina atlikėją + jo release-group'us iš MusicBrainz. Du kvietimai:
 * search (rasti MBID) + artist su inc=release-groups. Bounded ir greitas.
 */
export async function fetchMbArtistGrounding(name: string): Promise<MbGrounding> {
  const q = escapeLucene(name)
  if (!q) return { found: false, releases: [] }

  const search = await mbFetch(`/artist/?query=${encodeURIComponent(`artist:"${q}"`)}&fmt=json&limit=8`)
  const cands: any[] = search?.artists || []
  if (!cands.length) return { found: false, releases: [] }

  // Pirmenybė: tikslus (fold) vardo sutapimas + aukščiausias MB score.
  const want = foldCompare(name)
  const exact = cands.filter((a) => foldCompare(a.name || '') === want)
  const pool = exact.length ? exact : cands
  pool.sort((a, b) => (b.score || 0) - (a.score || 0))
  const artist = pool[0]
  if (!artist?.id) return { found: false, releases: [] }

  const full = await mbFetch(`/artist/${artist.id}?inc=release-groups&fmt=json&limit=100`)
  const rgs: any[] = full?.['release-groups'] || []

  const releases: MbGroundingRelease[] = rgs
    .map((rg) => ({
      title: rg.title || '',
      type: rg['primary-type'] || 'Other',
      secondary: Array.isArray(rg['secondary-types']) ? rg['secondary-types'] : [],
      year: yearOf(rg['first-release-date']),
    }))
    .filter((r) => r.title)
    .sort((a, b) => (a.year || 9999) - (b.year || 9999))

  const lifeBegin = yearOf(artist['life-span']?.begin)
  const lifeEnd = yearOf(artist['life-span']?.end)

  return {
    found: true,
    mbid: artist.id,
    name: artist.name || name,
    sortName: artist['sort-name'] || null,
    type: artist.type || null,
    country: artist.country || artist.area?.['iso-3166-1-codes']?.[0] || null,
    gender: artist.gender || null,
    beginYear: lifeBegin,
    endYear: lifeEnd,
    ended: artist['life-span']?.ended === true,
    disambiguation: artist.disambiguation || null,
    releases,
  }
}

/** Įžeminimo faktus paverčia tekstu, kurį paduodam modeliui. */
function groundingToText(g: MbGrounding): string {
  if (!g.found) {
    return 'MusicBrainz: atlikėjas nerastas. Naudok tik tai, ką patikimai žinai; ko nežinai — null / tuščia.'
  }
  const albums = g.releases.filter((r) => r.type === 'Album' && !r.secondary.length)
  const eps = g.releases.filter((r) => r.type === 'EP')
  const singles = g.releases.filter((r) => r.type === 'Single')
  const other = g.releases.filter((r) => !['Album', 'EP', 'Single'].includes(r.type) || r.secondary.length)

  const fmt = (list: MbGroundingRelease[]) =>
    list.map((r) => `- ${r.title}${r.year ? ` (${r.year})` : ''}${r.secondary.length ? ` [${r.secondary.join(', ')}]` : ''}`).join('\n') || '  (nėra)'

  return [
    'MusicBrainz įžeminimo faktai (naudok kaip patikimą šaltinį albumams/datoms; NEišgalvok papildomų):',
    `Vardas: ${g.name}${g.sortName ? ` (sort: ${g.sortName})` : ''}`,
    `Tipas: ${g.type || 'nežinoma'} | Šalis (ISO): ${g.country || 'nežinoma'} | Lytis: ${g.gender || 'nežinoma'}`,
    `Veiklos pradžia: ${g.beginYear ?? 'nežinoma'} | Pabaiga: ${g.endYear ?? (g.ended ? 'nutraukta' : 'aktyvus')}`,
    g.disambiguation ? `Patikslinimas: ${g.disambiguation}` : '',
    '',
    `Albumai:\n${fmt(albums)}`,
    `EP:\n${fmt(eps)}`,
    `Singlai:\n${fmt(singles)}`,
    other.length ? `Kita (live/kompiliacijos/rinkiniai):\n${fmt(other)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

// ── Modelio kvietimas ─────────────────────────────────────────────────────────

// Fallback grandinė: default env → sonnet → haiku (garantuotai galiojantis).
// Kadangi iš sandbox'o API iškviesti negalima, neguess'inam vieno teisingo
// modelio — bandom iš eilės, kol vienas grąžina parse'inamą JSON.
function modelChain(): string[] {
  const chain = [ARTIST_FILL_MODEL, 'claude-sonnet-4-5', 'claude-haiku-4-5-20251001']
  return [...new Set(chain.filter(Boolean))]
}

type ModelCall = { obj: any; stopReason: string | null; apiError: string | null }

// Tool-based structured output — API grąžina VALIDŲ JSON objektą kaip tool_use
// input'ą (jokio teksto parse'inimo, jokių newline/kabučių problemų). Tai tikras
// sprendimas vietoj prefill+regex, kuris lūžo dėl modelio bio formatavimo.
// PLOKŠČIA schema — VISI atlikėjo laukai top-level (ne įdėtas artist_patch
// objektas). Priežastis: modelis įdėtą objektą kartais grąžina kaip JSON-stringą
// su neescape'intomis kabutėmis/newline'ais bio viduje → neparsinasi. Kai laukai
// plokšti (scalar + masyvai su items), API juos grąžina kaip native reikšmes ir
// pats teisingai suescape'ina. `artist_patch` struktūrą sudėliojam kode.
const IMPORT_TOOL = {
  name: 'emit_artist_import',
  description: 'Grąžina Music.lt importui paruoštus atlikėjo duomenis (plokšti laukai).',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      type: { type: 'string' }, // solo_artist | group | project
      country: { type: 'string' },
      birth_date: { type: ['string', 'null'] },
      active_year_start: { type: ['integer', 'null'] },
      active_year_end: { type: ['integer', 'null'] },
      is_active: { type: 'boolean' },
      gender: { type: ['string', 'null'] },
      genre_group: { type: 'string' },
      genres: { type: 'array', items: { type: 'string' } },
      bio: { type: 'string' },
      links: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, url: { type: 'string' } } } },
      contacts: { type: 'array', items: { type: 'object' } },
      albums: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' }, source_title: { type: 'string' },
            type: { type: 'string' }, release_date: { type: ['string', 'null'] },
            release_year: { type: ['integer', 'null'] }, total_tracks: { type: ['integer', 'null'] },
            description: { type: 'string' }, spotify_url: { type: 'string' },
            apple_music_url: { type: 'string' }, youtube_music_url: { type: 'string' },
            bandcamp_url: { type: 'string' }, official_url: { type: 'string' },
          },
        },
      },
      tracks: { type: 'array', items: { type: 'object' } },
    },
    required: ['name'],
  },
}

/** Masyvą grąžinam kaip masyvą; jei modelis vis dėlto paduoda JSON-stringą —
 *  parse'inam (su sanitize), o nepavykus — tuščias masyvas (kad neblokuotų). */
function coerceArray(v: any): any[] {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') { const p = safeJsonParse(v); return Array.isArray(p) ? p : [] }
  return []
}

/** Jei albums[] tuščias, bet tracks[] turi album_title — sudėliojam albumus iš
 *  dainų (grupuojam pagal album_title). Kad dainos prisikabintų prie albumų,
 *  nepriklausomai nuo to, ar modelis užpildė albums[]. */
function albumsFromTracks(tracks: any[]): any[] {
  const byTitle = new Map<string, { source_title: string; year: number | null; count: number }>()
  for (const t of tracks) {
    if (!t || typeof t !== 'object') continue
    const title = typeof t.album_title === 'string' ? t.album_title.trim() : ''
    if (!title) continue
    const cur = byTitle.get(title) || { source_title: (t.source_album_title || title), year: null, count: 0 }
    cur.count++
    if (!cur.year && typeof t.release_year === 'number') cur.year = t.release_year
    byTitle.set(title, cur)
  }
  const out: any[] = []
  for (const [title, info] of byTitle) {
    out.push({
      title,
      source_title: info.source_title,
      type: info.count <= 6 ? 'ep' : 'studio_album', // apytikris; admin gali pakeisti
      release_date: null,
      release_year: info.year,
      total_tracks: info.count,
      description: '',
      spotify_url: '', apple_music_url: '', youtube_music_url: '', bandcamp_url: '', official_url: '',
    })
  }
  return out
}

/** Iš plokščių tool laukų sudėliojam standartinę import struktūrą. */
function buildImport(inp: any): any {
  if (!inp || typeof inp !== 'object') return null
  const tracks = coerceArray(inp.tracks)
  let albums = coerceArray(inp.albums)
  if (albums.length === 0 && tracks.length > 0) albums = albumsFromTracks(tracks)
  return {
    artist_patch: {
      name: inp.name,
      type: inp.type,
      country: inp.country,
      birth_date: inp.birth_date ?? null,
      active_year_start: inp.active_year_start ?? null,
      active_year_end: inp.active_year_end ?? null,
      is_active: inp.is_active ?? true,
      gender: inp.gender ?? null,
      genre_group: inp.genre_group,
      genres: coerceArray(inp.genres),
      bio: typeof inp.bio === 'string' ? inp.bio : '',
    },
    links: coerceArray(inp.links),
    contacts: coerceArray(inp.contacts),
    albums,
    tracks,
    images: [],
  }
}

/** Escape'ina literal control simbolius (\n \r \t) string'ų VIDUJE — modelio
 *  stringifikuotas artist_patch/albums turi tikras naujas eilutes bio viduje,
 *  o JSON.parse to nepriima. */
function sanitizeControlChars(s: string): string {
  const out: string[] = []
  let inStr = false, esc = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inStr) {
      if (esc) { out.push(ch); esc = false; continue }
      if (ch === '\\') { out.push(ch); esc = true; continue }
      if (ch === '"') { out.push(ch); inStr = false; continue }
      if (ch === '\n') { out.push('\\n'); continue }
      if (ch === '\r') { out.push('\\r'); continue }
      if (ch === '\t') { out.push('\\t'); continue }
      const code = ch.charCodeAt(0)
      if (code < 0x20) { out.push('\\u' + code.toString(16).padStart(4, '0')); continue }
      out.push(ch); continue
    }
    out.push(ch)
    if (ch === '"') inStr = true
  }
  return out.join('')
}

function safeJsonParse(str: string): any {
  try { return JSON.parse(str) } catch { /* toliau */ }
  const s = sanitizeControlChars(str)
  try { return JSON.parse(s) } catch { /* toliau */ }
  try { return JSON.parse(s.replace(/,(\s*[}\]])/g, '$1')) } catch { return undefined }
}

// Web search default'u ĮJUNGTA (kad kokybė prilygtų ChatGPT flow'ui — modelis
// naršo Spotify/oficialius/žiniasklaidą, ne tik MB). Išjungiama env=0.
const WEB_SEARCH = process.env.ARTIST_FILL_WEB_SEARCH !== '0'
const WEB_SEARCH_TOOL = { type: 'web_search_20250305', name: 'web_search', max_uses: 6 }

async function callModel(model: string, system: string, user: string, maxTokens: number): Promise<ModelCall> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { obj: null, stopReason: null, apiError: 'ANTHROPIC_API_KEY nenustatytas' }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model, max_tokens: maxTokens, system,
        messages: [{ role: 'user', content: user }],
        // Su web search modelis PIRMA naršo (server tool, ciklas API viduje),
        // TADA emit'ina. tool_choice=auto (ne forced), kad naršymas būtų leidžiamas.
        tools: WEB_SEARCH ? [WEB_SEARCH_TOOL, IMPORT_TOOL] : [IMPORT_TOOL],
        tool_choice: WEB_SEARCH ? { type: 'auto' } : { type: 'tool', name: 'emit_artist_import' },
      }),
      signal: AbortSignal.timeout(WEB_SEARCH ? 110000 : 40000),
    })
    const json = await res.json()
    if (json?.error) return { obj: null, stopReason: null, apiError: `${json.error.type || 'error'}: ${json.error.message || ''}`.slice(0, 200) }
    const blocks: any[] = json?.content || []
    // Paskutinis emit_artist_import tool_use (po web_search blokų)
    const tu = [...blocks].reverse().find((b) => b?.type === 'tool_use' && b?.name === 'emit_artist_import')
    return { obj: tu?.input ?? null, stopReason: json?.stop_reason || null, apiError: null }
  } catch (e: any) {
    return { obj: null, stopReason: null, apiError: String(e?.message || e).slice(0, 200) }
  }
}

export type ArtistFillResult =
  | {
      ok: true
      json: string // pretty-printed import JSON (drop'inam į /admin/artist-import textarea)
      model: string
      grounded: boolean
      grounding_summary: string
      mb_release_count: number
    }
  | { ok: false; error: string }

/**
 * Pagrindinis: atlikėjo pavadinimas → įžemintas import JSON.
 * `input` gali būti bet kuris ARTIST_IMPORT_PROMPT palaikomas formatas
 * (pvz. „Atlikėjas" arba „Atlikėjas - Albumas"); MB įžeminimas taikomas tik
 * grynam atlikėjo pavadinimui (kitiems formatams modelis dirba kaip anksčiau).
 */
export async function fillArtist(input: string): Promise<ArtistFillResult> {
  const name = (input || '').trim()
  if (!name) return { ok: false, error: 'Tuščias įvestis' }
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: 'ANTHROPIC_API_KEY nenustatytas serveryje' }

  // Įžeminimą taikom tik grynam atlikėjo pavadinimui (be „ - Albumas" ir pan.).
  const isPlainArtist = !/[-,]/.test(name)
  const grounding: MbGrounding = isPlainArtist ? await fetchMbArtistGrounding(name) : { found: false, releases: [] }

  const groundingText = isPlainArtist ? groundingToText(grounding) : ''
  const userMsg = [
    WEB_SEARCH
      ? 'PIRMA pasinaršyk internete (web_search) ir patikrink faktus iš patikimų šaltinių: oficialus puslapis, Spotify, Apple Music, YouTube, Discogs, MusicBrainz, žiniasklaida. Ypač svarbu užsienio ir nišiniams atlikėjams, kurių gali nebūti Wikipedijoj. TADA, kai turi faktus, PRIVALAI iškviesti įrankį emit_artist_import su galutiniu JSON — neatsakinėk tekstu.'
      : '',
    groundingText,
    `Įvestis: ${name}`,
    '',
    'genre_group turi būti TIKSLIAI viena iš 8 leistinų reikšmių. Šalį rašyk lietuvišku pavadinimu (pvz. „Lietuva", „Jungtinė Karalystė", „JAV").',
    'Surask VISĄ diskografiją — įskaitant ankstyvus EP ir singlus, ne tik pagrindinius albumus.',
    'BŪTINAI užpildyk albums[] KIEKVIENAM albumui/EP/kompiliacijai atskiru įrašu su: title, type (studio_album|ep|compilation|live_album|single), release_year (ir release_date jei žinoma), total_tracks, description (2–4 sakiniai) ir stream linkais jei randi. NEPALIK albums[] tuščio, jei atlikėjas turi albumų — net jei tas pačias dainas dedi ir į tracks[].',
    'Į tracks[] įtrauk svarbiausias/žinomiausias dainas su album_title.',
    'Tekste (bio, aprašymai) kabutėms naudok TIK lietuviškas „ " nuosekliai — niekada ASCII " ar \\".',
  ].filter(Boolean).join('\n')

  // Bandom modelius iš eilės, kol vienas grąžina tool_use objektą.
  const attempts: string[] = []
  for (const model of modelChain()) {
    const call = await callModel(model, ARTIST_IMPORT_PROMPT, userMsg, 8000)
    if (call.apiError) { attempts.push(`${model}: ${call.apiError}`); continue }
    const obj = buildImport(call.obj)
    if (obj && obj.artist_patch && obj.artist_patch.name) {
      return {
        ok: true,
        json: JSON.stringify(obj, null, 2),
        model,
        grounded: grounding.found,
        grounding_summary: grounding.found
          ? `MusicBrainz: ${grounding.name} (${grounding.country || '?'}), ${grounding.releases.length} leidinių`
          : 'MusicBrainz: nerasta (naudota tik modelio žinios)',
        mb_release_count: grounding.releases.length,
      }
    }
    attempts.push(call.stopReason === 'max_tokens' ? `${model}: truncated` : `${model}: nėra tool_use`)
  }
  return { ok: false, error: `Nepavyko sugeneruoti. Bandymai — ${attempts.join(' | ')}` }
}
