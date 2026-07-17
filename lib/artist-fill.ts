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

type ModelCall = { text: string | null; stopReason: string | null; apiError: string | null }

async function callModel(model: string, system: string, user: string, maxTokens: number): Promise<ModelCall> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { text: null, stopReason: null, apiError: 'ANTHROPIC_API_KEY nenustatytas' }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
      signal: AbortSignal.timeout(40000),
    })
    const json = await res.json()
    if (json?.error) return { text: null, stopReason: null, apiError: `${json.error.type || 'error'}: ${json.error.message || ''}`.slice(0, 200) }
    return { text: json?.content?.[0]?.text || null, stopReason: json?.stop_reason || null, apiError: null }
  } catch (e: any) {
    return { text: null, stopReason: null, apiError: String(e?.message || e).slice(0, 200) }
  }
}

/** Ištraukia JSON objektą iš modelio atsakymo (nuima ```fences, greedy iki }). */
function extractJsonObject(text: string | null): { obj: any; raw: string } | null {
  if (!text) return null
  const cleaned = text.replace(/```(?:json)?/gi, '')
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    return { obj: JSON.parse(m[0]), raw: m[0] }
  } catch {
    return null
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
    groundingText,
    `Įvestis: ${name}`,
    '',
    'Grąžink TIK validų JSON pagal aukščiau aprašytą schemą. NErašyk „Pastabos" ar jokio teksto prieš/po JSON — VIEN JSON objektą.',
    'genre_group turi būti TIKSLIAI viena iš 8 leistinų reikšmių. Šalį rašyk lietuvišku pavadinimu (pvz. „Lietuva", „Jungtinė Karalystė", „JAV").',
    'Kad atsakymas tilptų: į tracks[] įtrauk iki ~20 svarbiausių/žinomiausių dainų (ne visą katalogą), į albums[] — pilną sąrašą.',
  ].join('\n')

  // Bandom modelius iš eilės, kol vienas grąžina parse'inamą JSON.
  let lastErr = 'nežinoma'
  let usedModel = ''
  for (const model of modelChain()) {
    const call = await callModel(model, ARTIST_IMPORT_PROMPT, userMsg, 8000)
    if (call.apiError) { lastErr = `${model}: ${call.apiError}`; continue }
    const extracted = extractJsonObject(call.text)
    if (extracted) {
      usedModel = model
      return {
        ok: true,
        json: JSON.stringify(extracted.obj, null, 2),
        model: usedModel,
        grounded: grounding.found,
        grounding_summary: grounding.found
          ? `MusicBrainz: ${grounding.name} (${grounding.country || '?'}), ${grounding.releases.length} leidinių`
          : 'MusicBrainz: nerasta (naudota tik modelio žinios)',
        mb_release_count: grounding.releases.length,
      }
    }
    lastErr = call.stopReason === 'max_tokens'
      ? `${model}: atsakymas per ilgas (truncated)`
      : `${model}: negrąžino JSON${call.text ? ' (gautas tekstas be JSON)' : ''}`
  }
  return { ok: false, error: `Nepavyko sugeneruoti JSON. Paskutinė klaida — ${lastErr}` }
}
