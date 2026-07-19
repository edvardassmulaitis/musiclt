/**
 * chart-resolve.ts — external_chart_entries → katalogo dainų/albumų susiejimas.
 *
 * Modelis (žr. EXTERNAL_CHARTS_PLAN.md §3): „review queue first".
 *  - findConfidentMatch: auto-match (atlikėjas IR pavadinimas sutampa po
 *    normalizacijos) → resolve_state='matched'.
 *  - Neaiškūs lieka 'pending' → admin per /admin/charts patvirtina rankiniu būdu.
 *
 * 2026-06-21 perrašyta atlikėjo rezoliucija (žr. CHARTS_AUDIT_2026-06-04.md follow-up):
 *  - Atlikėjas ieškomas per INDEKSUOTĄ `artists.name_norm` (= lower(unaccent(name)))
 *    tikslia lygybe — atsparu diakritikai ABIEM kryptim (jautì↔jauti, mésh↔Mesh,
 *    Kamaniu↔Kamanių) ir nesugriūna ant trumpų/dažnų vardų. Senasis `ilike %tok%
 *    limit 60` apkapodavo tikrąjį atlikėją (pvz. „ba." — DB 508 vardų su „ba",
 *    realus „ba." nepatekdavo į pirmus 60 → niekada nematch'ino).
 *  - Atlikėjo atomai: bandomas PILNAS vardas pirma (grupės su &/+ nesuskyla:
 *    „G&G Sindikatas", „8 Kambarys + Kotryna Aurėja"), tada featuring segmentai,
 *    tada be „The" prefikso („JACKSON 5" ↔ „The Jackson 5").
 *  - Pavadinimo match'as: exact → aggressive(be skliaustų) → tight(be tarpų,
 *    „Les"↔„L.E.S.") → gated prefix (Apple sutrumpina „u + me =" ↔ „u + me = <3")
 *    → gated containment („…TOUR COLLECTION" ↔ „+−=÷× (Tour Collection)").
 *
 * 2026-06-21 PASTOVI ATMINTIS (chart_resolution_memory): kiekvienas sujungimas
 *  įsimenamas globaliai (norm_key+kind → entity). Per ingest, jei auto-match nerado,
 *  konsultuojam atmintį — taip rankiniai sujungimai NEpradingsta kai topas
 *  atsinaujina nauju period_label (žr. chart_store.py carry-over bug fix).
 */
type Sb = any

// Postgres `unaccent` + LT diakritika. ł/ø/đ/æ/œ/ß — NFKD jų neskaido, todėl
// pridedam rankiniu būdu, kad atitiktų DB `name_norm` (lower(unaccent(name))).
const LT_MAP: Record<string, string> = {
  ą: 'a', č: 'c', ę: 'e', ė: 'e', į: 'i', š: 's', ų: 'u', ū: 'u', ž: 'z',
  ł: 'l', ø: 'o', đ: 'd', æ: 'ae', œ: 'oe', ß: 'ss',
}

/** Spotify-stiliaus versijų/leidimų raktažodžiai (po „ - " be skliaustų). */
const VERSION_KW =
  'remaster|remastered|re-?master(?:ed)?|version|edit|mix|remix|mono|stereo|live|' +
  'acoustic|unplugged|demo|single|radio|instrumental|karaoke|bonus|expanded|deluxe|' +
  'anniversary|re-?recorded|reprise|explicit|clean|extended|club|dub|session|' +
  "sped\\s*up|slowed|soundtrack|ost|taylor['’]s version"

function stripVersionSuffix(s: string): string {
  const re = new RegExp(`\\s[-–—]\\s[^-–—]*\\b(?:${VERSION_KW})\\b.*$`, 'i')
  let out = s, prev = ''
  do { prev = out; out = out.replace(re, '') } while (out !== prev)
  return out.trim()
}

/** Deakcentas: lower + LT/extra map + NFKD combining nuėmimas. KIRILICA/ne-lotyniški
 *  rašmenys IŠLAIKOMI (nedarom ascii-strip) — kad „Шадэ" nepavirstų į „". Atitinka
 *  Postgres `lower(unaccent(...))`. */
function deaccent(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[ąčęėįšųūžłøđæœß]/g, c => LT_MAP[c] || c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
}

/** colNorm — VEIDRODIS `artists.name_norm` / `tracks.title_norm` stulpeliui:
 *  tik lower+unaccent, BE punktuacijos/tarpų normalizacijos. Naudojam tiksliai
 *  `name_norm=eq.` užklausai (indeksuota, diakritikai atspari abiem kryptim). */
export function colNorm(s: string): string {
  return deaccent(s).trim()
}

/** Normalizuoja palyginimui: deaccent, versijų priesaga, feat/() nuėmimas, tik
 *  raidės/skaitmenys (UNICODE — kirilica išlaikoma), vedantis „the" nuimamas
 *  (CHEMICAL BROTHERS == The Chemical Brothers). */
export function normalizeForMatch(s: string): string {
  let out = stripVersionSuffix(deaccent(s))
  out = out.replace(
    /\([^)]*\b(?:feat|ft|featuring)[^)]*\)|\([^)]*remix[^)]*\)|\([^)]*version[^)]*\)|\([^)]*w\/[^)]*\)|\b(?:feat|ft|featuring)\.?\b.*$/g,
    '',
  )
  return out.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/^the\s+/, '')
}

/** Agresyvi normalizacija: pašalina VISUS skliaustus (...) ir [...]. */
export function normalizeAggressive(s: string): string {
  let out = stripVersionSuffix(deaccent(s))
  out = out.replace(/\b(?:feat|ft|featuring)\.?\b.*$/, '').replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '')
  return out.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/^the\s+/, '')
}

/** „Tight" raktas — be tarpų. „Les" ↔ „L.E.S." (initializmai/punktuacija). */
export function normalizeTight(s: string): string {
  return normalizeForMatch(s).replace(/\s+/g, '')
}

/** Jungtukai (and/y/&/und…) — daugiakalbiai „ir". Naudojami looseNorm'e, kad
 *  „Nalguita y Teta" == „Nalguita & Teta", „Florence + the Machine" ==
 *  „Florence And The Machine". */
const CONNECTORS = new Set(['and', 'und', 'et', 'y', 'e', 'ir', 'con', 'n'])

/** „Loose" raktas — matchNorm be jungtukų tokenų. */
export function looseNorm(s: string): string {
  return normalizeForMatch(s).split(' ').filter(t => t && !CONNECTORS.has(t)).join(' ')
}

/** Atlikėjo vardo variantai alias'ams: pilnas, be skliaustų, skliaustų turinys.
 *  „The Jacksons (Jackson 5)" → {„jacksons", „the jacksons" be the→jacksons, „jackson 5"}. */
function parenVariants(name: string): Set<string> {
  const out = new Set<string>()
  out.add(normalizeForMatch(name))
  out.add(normalizeForMatch(name.replace(/\([^)]*\)|\[[^\]]*\]/g, '')))
  const m = name.matchAll(/\(([^)]*)\)|\[([^\]]*)\]/g)
  for (const g of m) { const v = normalizeForMatch(g[1] || g[2] || ''); if (v) out.add(v) }
  out.delete('')
  return out
}

/** Dice bigramų koeficientas (0..1) — fuzzy match'ui (misspelling / „de la"↔„del la").
 *  Deterministinis, identiškas TS↔Python. */
function bigrams(s: string): string[] {
  const t = '  ' + s.replace(/ /g, '') + '  '
  const r: string[] = []
  for (let i = 0; i < t.length - 1; i++) r.push(t.slice(i, i + 2))
  return r
}
export function dice(a: string, b: string): number {
  const A = bigrams(a), B = bigrams(b)
  if (!A.length || !B.length) return 0
  const m = new Map<string, number>()
  for (const g of A) m.set(g, (m.get(g) || 0) + 1)
  let inter = 0
  for (const g of B) { const c = m.get(g) || 0; if (c > 0) { inter++; m.set(g, c - 1) } }
  return (2 * inter) / (A.length + B.length)
}

/** Pirmas atlikėjas iš „Xcho, By Индия, МОТ" / „A feat. B" / „A & B".
 *  Skiria su TARPAIS aplink & ir x — kad „G&G Sindikatas"/„HUNTR/X" nesuskiltų.
 *  „:" — K-pop kreditams („Grupė: nariai"). */
export function primaryArtist(name: string): string {
  return (name || '').split(/,| & |\bfeaturing\b|\bfeat\.?\b|\bft\.?\b| x |\bvs\.?\b|\bw\/|:/i)[0].trim()
}

/** Atlikėjo „atomai" lookup'ui — PILNAS vardas pirma (grupės su &/+ nesuskyla,
 *  nes skiriam tik su TARPAIS aplink & ir x), tada featuring segmentai, tada be
 *  „The" prefikso. */
function artistAtoms(name: string): string[] {
  const raw = (name || '').trim()
  const parts = raw.split(/,| & |\bfeaturing\b|\bfeat\.?\b|\bft\.?\b| x |\bvs\.?\b|\bw\/|\/| \+ |:/i)
    .map(p => p.trim()).filter(Boolean)
  const base = [raw, ...parts]
  const out: string[] = []
  for (const a of base) {
    out.push(a)
    const noThe = a.replace(/^the\s+/i, '').trim()
    if (noThe && noThe !== a) out.push(noThe)
  }
  const seen = new Set<string>()
  return out.filter(a => {
    const k = a.toLowerCase()
    if (!a || seen.has(k)) return false
    seen.add(k); return true
  })
}

/** Ilgiausias colNorm token'as ilike fallback'ui. */
function longestColToken(s: string): string {
  const toks = colNorm(s).split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 2)
  return (toks.sort((a, b) => b.length - a.length)[0] || colNorm(s)).replace(/[%_]/g, '')
}

/** Ilgiausias RAW (su diakritikais) token'as ilike prefiltrui. SVARBU: Postgres
 *  `ilike` diakritikams JAUTRUS — deaccentintas 'leidziasi' NEPAGAUNA accentinto
 *  'Leidžiasi'. Tad ilike prieš raw `title` stulpelį reikia accentinto token'o. */
function longestRawToken(s: string): string {
  const toks = (s || '').split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 2)
  return (toks.sort((a, b) => b.length - a.length)[0] || (s || '')).replace(/[%_,()]/g, '')
}

/**
 * Atlikėjo ID kandidatai pagal RAW vardą. Per `name_norm` tikslią lygybę
 * (indeksuota, diakritikai atspari) + token ilike fallback. Grąžina visus
 * sutampančius (primary + featuring + „The"-variantai).
 */
export async function resolveArtistIds(sb: Sb, rawArtist: string): Promise<number[]> {
  const found = new Set<number>()
  for (const atom of artistAtoms(rawArtist)) {
    const cn = colNorm(atom)
    if (!cn) continue
    // 1) Tikslus name_norm match.
    const { data: exact } = await sb.from('artists').select('id').eq('name_norm', cn).limit(10)
    if (exact && exact.length) { for (const a of exact) found.add(a.id); continue }
    // 2) Fallback: token ilike ant name_norm + matchNorm/loose/paren filtras
    //    (punktuacija, jungtukai, alias skliausteliuose), tada gated fuzzy.
    const tok = longestColToken(atom)
    if (!tok || tok.length < 3) continue
    const { data: cand } = await sb.from('artists').select('id, name')
      .ilike('name_norm', `%${tok}%`).limit(120)
    const an = normalizeForMatch(atom), al = looseNorm(atom), ap = parenVariants(atom)
    let strong = (cand || []).filter((a: any) => {
      if (normalizeForMatch(a.name) === an) return true
      if (al && looseNorm(a.name) === al) return true
      for (const v of parenVariants(a.name)) if (ap.has(v)) return true
      return false
    })
    if (!strong.length) {
      // Gated fuzzy: aiškus nugalėtojas (≥0.88 ir ≥0.06 atotrūkis) — misspelling.
      const sc = (cand || []).map((a: any) => ({ a, s: dice(normalizeForMatch(a.name), an) }))
        .sort((x: any, y: any) => y.s - x.s)
      if (sc.length && sc[0].s >= 0.88 && (sc.length < 2 || sc[0].s - sc[1].s >= 0.06)) strong = [sc[0].a]
    }
    for (const a of strong) found.add(a.id)
  }
  return [...found]
}

type CatHit = { id: number; title: string; artist_id: number; artists?: any }

/** Suranda atitikmenį atlikėjo kataloge. Lygiai: exact → aggressive → tight →
 *  (fuzzy) gated prefix → gated containment. Grąžina geriausią eilutę arba null. */
function matchInCatalog(rows: CatHit[], rawTitle: string, fuzzy: boolean): CatHit | null {
  const tn = normalizeForMatch(rawTitle)
  const ta = normalizeAggressive(rawTitle)
  const tt = normalizeTight(rawTitle)
  const tl = looseNorm(rawTitle)
  if (!tn) return null
  // 1) exact (pirmenybė tiksliam raw sutapimui, tada mažiausias id = kanoninis)
  let hits = rows.filter(t => normalizeForMatch(t.title) === tn)
  // 2) aggressive
  if (!hits.length && ta && ta !== tn) hits = rows.filter(t => normalizeAggressive(t.title) === ta)
  // 3) tight (be tarpų) — gate len>=3
  if (!hits.length && tt.length >= 3) hits = rows.filter(t => normalizeTight(t.title) === tt)
  // 4) connector (be jungtukų) — „Nalguita y Teta" == „Nalguita & Teta"
  if (!hits.length && tl && tl !== tn) hits = rows.filter(t => looseNorm(t.title) === tl)
  if (hits.length) {
    hits.sort((a, b) => a.id - b.id)
    return hits.find(h => (h.title || '').trim() === (rawTitle || '').trim()) || hits[0]
  }
  if (!fuzzy) return null
  // 4b) censorship — „I'M DAT N***A": nuimam masked tokeną, prefiksuojam likutį.
  if (rawTitle.includes('*')) {
    const head = normalizeForMatch(rawTitle.replace(/\s*\S*\*\S*.*$/, ''))
    if (head && (head.length >= 6 || head.split(' ').length >= 2)) {
      const pf = rows.filter(t => { const dn = normalizeForMatch(t.title); return dn !== head && dn.startsWith(head + ' ') })
      if (new Set(pf.map(t => normalizeForMatch(t.title))).size === 1) return pf.sort((a, b) => a.id - b.id)[0]
    }
  }
  // 4) gated prefix — Apple sutrumpina ilgus pavadinimus. Tik 1 unikalus kandidatas,
  //    chart pavadinimas pakankamai ilgas (>=6 simb. arba >=2 žodžiai).
  if (tn.length >= 6 || tn.split(' ').length >= 2) {
    const pf = rows.filter(t => {
      const dn = normalizeForMatch(t.title)
      return dn !== tn && dn.startsWith(tn + ' ')
    })
    const distinct = new Set(pf.map(t => normalizeForMatch(t.title)))
    if (distinct.size === 1) return pf.sort((a, b) => a.id - b.id)[0]
  }
  // 5) gated containment — trumpesnė (sutampanti) pusė >=8 simb. ir >=2 žodžiai,
  //    tik 1 unikalus kandidatas. („…TOUR COLLECTION" ⊃ „tour collection").
  const cont = rows.filter(t => {
    const dn = normalizeForMatch(t.title)
    if (!dn || dn === tn) return false
    const short = dn.length <= tn.length ? dn : tn
    return short.length >= 8 && short.split(' ').length >= 2 && (dn.includes(tn) || tn.includes(dn))
  })
  const distinctC = new Set(cont.map(t => normalizeForMatch(t.title)))
  if (distinctC.size === 1) return cont.sort((a, b) => a.id - b.id)[0]
  // 6) gated fuzzy (Dice) — aiškus nugalėtojas. „el bachaton de la l" ↔ „… del la l".
  //    Scoped į VIENO atlikėjo katalogą, todėl rizika maža.
  if (tn.length >= 8) {
    const sc = rows.map(t => ({ t, s: dice(normalizeForMatch(t.title), tn) }))
      .sort((x, y) => y.s - x.s)
    if (sc.length && sc[0].s >= 0.86 && (sc.length < 2 || sc[0].s - sc[1].s >= 0.06)) return sc[0].t
  }
  return null
}

const YT_TAGS = new RegExp(
  '\\((?:official|lyric|visuali[sz]er|audio|video|music\\s*video|mv|clip|teaser|' +
  'performance|live\\s*session|color\\s*coded)[^)]*\\)|' +
  '\\[(?:official|lyric|audio|video|mv)[^\\]]*\\]', 'i')

/** YouTube/junk pavadinimo valymas (fallback kai exact nerado). Nuima „| Live…"
 *  uodegą, (Official Video) žymas, hashtagus, atlikėjo vardo prefiksą
 *  („Gabrielius Vagelis – Užteko" → „Užteko"). */
export function cleanTitle(title: string, artist = ''): string {
  let t = title || ''
  t = t.replace(/\s[|•·]\s.*$/, '')
  t = t.replace(YT_TAGS, '')
  t = t.replace(/#\w+/g, '')
  t = t.replace(/\s+\bofficial\b.*$/i, '')
  const m = t.match(/^(.*?)\s*[-–—:]\s*(.+)$/)
  if (artist && m) {
    const an = normalizeForMatch(artist)
    if (an && normalizeForMatch(m[1]) === an) t = m[2]
  }
  return t.replace(/^[\s\t\-–—|·•✦*~“”"']+|[\s\t\-–—|·•✦*~“”"']+$/g, '').trim()
}

/**
 * Title-anchored fuzzy artist: kai pavadinimas DB yra TIKSLUS (per indeksuotą
 * title_norm), bet atlikėjas su rašybos klaida („LOS DOS DE TAMAULIPAS" vs DB
 * „Los Dos De Tampaulipas"). SAUGU, nes pavadinimas privalo sutapti tiksliai, o
 * atlikėjas — tik aiškus high-similarity nugalėtojas. Gate: pavadinimas/atlikėjas
 * pakankamai ilgi (ne trumpi „Hello"/„Sia" atsitiktinumai), Dice≥0.85, ≥0.08 atotrūkis.
 */
async function titleAnchoredMatch(
  sb: Sb, table: 'tracks' | 'albums', rawArtist: string, rawTitle: string,
): Promise<CatHit | null> {
  const tq = colNorm(rawTitle)
  if (!tq || (tq.length < 5 && tq.split(' ').length < 2)) return null
  const an = normalizeForMatch(primaryArtist(rawArtist))
  if (!an || an.length < 6) return null
  const sel = table === 'albums'
    ? 'id, title, artist_id, artists:artist_id(name, slug)'
    : 'id, title, artist_id, artists:artist_id(name)'
  const { data } = await sb.from(table).select(sel).eq('title_norm', tq).limit(50)
  const scored = (data || []).map((t: any) => {
    const nm = Array.isArray(t.artists) ? t.artists[0]?.name : t.artists?.name
    return { t, s: dice(normalizeForMatch(nm || ''), an) }
  }).filter((x: any) => x.s >= 0.85).sort((a: any, b: any) => b.s - a.s)
  if (scored.length && (scored.length < 2 || scored[0].s - scored[1].s >= 0.08)) return scored[0].t as CatHit
  return null
}

export type ConfidentMatch = { trackId: number; artistId: number; trackTitle: string; artistName: string }

/**
 * Atlikėjas (per name_norm) + daina (per katalogo match). `opts.fuzzy` įjungia
 * prefix/containment lygius (naudoja chart auto-resolve; bendro naudojimo
 * iškvietimai lieka griežti — tik exact/aggressive/tight).
 */
export async function findConfidentMatch(
  sb: Sb, rawArtist: string, rawTitle: string, opts?: { fuzzy?: boolean },
): Promise<ConfidentMatch | null> {
  if (!normalizeForMatch(rawTitle)) return null
  const ids = await resolveArtistIds(sb, rawArtist)
  let hit: CatHit | null = null
  if (ids.length) {
    const { data: tracks } = await sb.from('tracks')
      .select('id, title, artist_id, artists:artist_id(name)')
      .in('artist_id', ids).limit(1200)
    hit = matchInCatalog((tracks || []) as CatHit[], rawTitle, !!opts?.fuzzy)
    if (!hit) {
      const ct = cleanTitle(rawTitle, rawArtist)
      if (ct && ct !== rawTitle && normalizeForMatch(ct)) hit = matchInCatalog((tracks || []) as CatHit[], ct, !!opts?.fuzzy)
    }
  }
  // SWAP fallback (tik fuzzy/chart kelyje): YouTube'as kartais sukeičia atlikėją↔
  // pavadinimą. Bandom atlikėją iš pavadinimo, o vardą — kaip dainą (TIK exact).
  if (!hit && opts?.fuzzy) {
    const sids = await resolveArtistIds(sb, rawTitle)
    if (sids.length) {
      const { data: st } = await sb.from('tracks')
        .select('id, title, artist_id, artists:artist_id(name)').in('artist_id', sids).limit(1200)
      hit = matchInCatalog((st || []) as CatHit[], rawArtist, false)
    }
  }
  // Title-anchored fuzzy artist (rašybos klaida atlikėjo varde, tikslus pavadinimas).
  if (!hit && opts?.fuzzy) hit = await titleAnchoredMatch(sb, 'tracks', rawArtist, rawTitle)
  if (!hit) return null
  const ar = Array.isArray(hit.artists) ? hit.artists[0] : hit.artists
  return { trackId: hit.id, artistId: hit.artist_id, trackTitle: hit.title, artistName: ar?.name || rawArtist }
}

export type ConfidentAlbumMatch = { albumId: number; artistId: number; albumTitle: string; artistName: string }

export async function findConfidentAlbumMatch(
  sb: Sb, rawArtist: string, rawTitle: string, opts?: { fuzzy?: boolean },
): Promise<ConfidentAlbumMatch | null> {
  if (!normalizeForMatch(rawTitle)) return null
  const ids = await resolveArtistIds(sb, rawArtist)
  if (!ids.length) return null
  const { data: albums } = await sb.from('albums')
    .select('id, title, artist_id, artists:artist_id(name, slug)')
    .in('artist_id', ids).limit(1200)
  let hit = matchInCatalog((albums || []) as CatHit[], rawTitle, !!opts?.fuzzy)
  if (!hit) {
    const ct = cleanTitle(rawTitle, rawArtist)
    if (ct && ct !== rawTitle && normalizeForMatch(ct)) hit = matchInCatalog((albums || []) as CatHit[], ct, !!opts?.fuzzy)
  }
  if (!hit && opts?.fuzzy) hit = await titleAnchoredMatch(sb, 'albums', rawArtist, rawTitle)
  if (!hit) return null
  const ar = Array.isArray(hit.artists) ? hit.artists[0] : hit.artists
  return { albumId: hit.id, artistId: hit.artist_id, albumTitle: hit.title, artistName: ar?.name || rawArtist }
}

/* ───────────────────────── PASTOVI ATMINTIS ───────────────────────── */

function memKeys(rawArtist: string, rawTitle: string) {
  const norm = `${normalizeForMatch(primaryArtist(rawArtist))}|${normalizeForMatch(rawTitle)}`
  const aggr = `${normalizeAggressive(primaryArtist(rawArtist))}|${normalizeAggressive(rawTitle)}`
  return { norm, aggr: aggr !== norm ? aggr : null }
}

/** Įsimena sujungimą globaliai (upsert pagal norm_key+kind). Tylus (best-effort). */
export async function rememberResolution(
  sb: Sb,
  o: { rawArtist: string; rawTitle: string; kind: 'track' | 'album'; trackId?: number | null; albumId?: number | null; artistId?: number | null; state?: string },
): Promise<void> {
  try {
    const { norm, aggr } = memKeys(o.rawArtist, o.rawTitle)
    if (!norm || norm === '|') return
    await sb.from('chart_resolution_memory').upsert({
      norm_key: norm, aggr_key: aggr, kind: o.kind,
      track_id: o.kind === 'track' ? (o.trackId ?? null) : null,
      album_id: o.kind === 'album' ? (o.albumId ?? null) : null,
      artist_id: o.artistId ?? null,
      resolve_state: o.state || 'matched',
      last_artist_name: o.rawArtist, last_title: o.rawTitle,
    }, { onConflict: 'norm_key,kind' })
  } catch { /* atmintis — best effort */ }
}

export type RecalledResolution = { trackId: number | null; albumId: number | null; artistId: number | null; state: string }

/** Atgamina anksčiau įsimintą sujungimą (norm_key, tada aggr_key). Tikrina ar
 *  entity vis dar egzistuoja (FK cascade trina stale, bet apsidraudžiam). */
export async function recallResolution(
  sb: Sb, rawArtist: string, rawTitle: string, kind: 'track' | 'album',
): Promise<RecalledResolution | null> {
  const { norm, aggr } = memKeys(rawArtist, rawTitle)
  if (!norm) return null
  const col = kind === 'album' ? 'album_id' : 'track_id'
  const sel = 'track_id, album_id, artist_id, resolve_state'
  let { data } = await sb.from('chart_resolution_memory').select(sel)
    .eq('kind', kind).eq('norm_key', norm).limit(1)
  if ((!data || !data.length) && aggr) {
    ;({ data } = await sb.from('chart_resolution_memory').select(sel)
      .eq('kind', kind).eq('aggr_key', aggr).limit(1))
  }
  const row = (data || [])[0]
  if (!row || !row[col]) return null
  return { trackId: row.track_id, albumId: row.album_id, artistId: row.artist_id, state: row.resolve_state || 'matched' }
}

/**
 * Cross-chart link: susiejus dainą/albumą viename tope — susiejam VISUOSE kituose
 * current chart'uose (pagal normalizuotą artist+title). Grąžina kiek susieta.
 */
export async function linkSongAcrossCharts(
  sb: Sb,
  opts: { trackId?: number | null; albumId?: number | null; artistId: number; rawArtist: string; rawTitle: string; exceptEntryId?: number },
): Promise<number> {
  const aNorm = normalizeForMatch(primaryArtist(opts.rawArtist))
  const tNorm = normalizeForMatch(opts.rawTitle)
  if (!tNorm) return 0
  const isAlbum = !!opts.albumId

  // Įsimenam atmintyje (kad ingest nepamirštų).
  await rememberResolution(sb, {
    rawArtist: opts.rawArtist, rawTitle: opts.rawTitle, kind: isAlbum ? 'album' : 'track',
    trackId: opts.trackId, albumId: opts.albumId, artistId: opts.artistId, state: 'matched',
  })

  const { data: charts } = await sb.from('external_charts').select('id, chart_key').eq('is_current', true)
  const chartIds = (charts || [])
    .filter((c: any) => (c.chart_key === 'albums') === isAlbum)
    .map((c: any) => c.id)
  if (chartIds.length === 0) return 0

  // Kandidatų prefiltras — ir RAW (accentintas), ir deaccentintas token'as per
  // .or(): Postgres ilike diakritikams jautrus, tad be accentinto token'o LT
  // dainos ('Leidžiasi') niekad nepasigaudavo → cross-chart link tyliai
  // nesuveikdavo. In-memory normalizeForMatch filtras žemiau patikslina.
  const tokRaw = longestRawToken(opts.rawTitle)
  const tokDeacc = longestColToken(opts.rawTitle)
  const orParts: string[] = []
  if (tokRaw) orParts.push(`title.ilike.%${tokRaw}%`)
  if (tokDeacc && tokDeacc !== tokRaw) orParts.push(`title.ilike.%${tokDeacc}%`)
  if (!orParts.length) return 0
  const { data: cands } = await sb.from('external_chart_entries')
    .select('id, artist_name, title')
    .in('chart_id', chartIds)
    .in('resolve_state', ['pending', 'ambiguous', 'text_only'])
    .or(orParts.join(','))
    .limit(600)

  let n = 0
  for (const e of (cands || []) as any[]) {
    if (opts.exceptEntryId && e.id === opts.exceptEntryId) continue
    if (normalizeForMatch(e.title) !== tNorm) continue
    if (aNorm && normalizeForMatch(primaryArtist(e.artist_name)) !== aNorm) continue
    const upd = isAlbum
      ? { album_id: opts.albumId, track_id: null, artist_id: opts.artistId, resolve_state: 'matched' }
      : { track_id: opts.trackId, album_id: null, artist_id: opts.artistId, resolve_state: 'matched' }
    await sb.from('external_chart_entries').update(upd).eq('id', e.id)
    n++
  }
  return n
}

/** Create album po atlikėju (minimal ghost). Grąžina album_id. */
export async function createAlbumForArtist(
  sb: Sb, artistId: number, rawTitle: string,
): Promise<number> {
  const title = rawTitle.trim()
  const { data: ex } = await sb.from('albums')
    .select('id, title').eq('artist_id', artistId).ilike('title', title).limit(5)
  const dup = (ex || []).find((a: any) => normalizeForMatch(a.title) === normalizeForMatch(title))
  if (dup) return dup.id

  let slug = slugifyLt(title) || `album-${Date.now()}`
  const { data: exSlug } = await sb.from('albums').select('id').eq('slug', slug).maybeSingle()
  if (exSlug) slug = `${slug}-${Date.now().toString(36)}`
  const { data: row, error } = await sb.from('albums')
    .insert({ title, slug, artist_id: artistId }).select('id').single()
  if (error) throw error
  return row.id
}

/** LT-aware slug (mirror lib/supabase-artists slugify). */
export function slugifyLt(s: string): string {
  return (s || '').toLowerCase()
    .replace(/[ąčęėįšųūž]/g, c => LT_MAP[c] || c)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100)
}

/** Find-or-create atlikėjas. SIAURAS lookup (tik primary vardas, BE „The"/split
 *  išplėtimo — kad create nesusietų „Doors" su „The Doors"): name_norm exact +
 *  token ilike fallback. */
export async function findOrCreateArtist(
  sb: Sb, rawArtist: string, country: string | null,
): Promise<number> {
  const name = primaryArtist(rawArtist) || rawArtist
  const cn = colNorm(name)
  if (cn) {
    const { data: exact } = await sb.from('artists').select('id').eq('name_norm', cn).limit(1)
    if (exact && exact.length) return exact[0].id
    const tok = longestColToken(name)
    if (tok) {
      const { data: cand } = await sb.from('artists').select('id, name')
        .ilike('name_norm', `%${tok}%`).limit(80)
      const nn = normalizeForMatch(name)
      const hit = (cand || []).find((a: any) => normalizeForMatch(a.name) === nn)
      if (hit) return hit.id
    }
  }

  let slug = slugifyLt(name) || `artist-${Date.now()}`
  const { data: ex } = await sb.from('artists').select('id').eq('slug', slug).maybeSingle()
  if (ex) slug = `${slug}-${Date.now().toString(36)}`
  const { data: row, error } = await sb.from('artists').insert({
    slug, name, country: country || null, type: 'solo', type_music: true,
  }).select('id').single()
  if (error) throw error
  return row.id
}

/** Create track po atlikėju (minimal). Grąžina track_id. */
export async function createTrackForArtist(
  sb: Sb, artistId: number, rawTitle: string,
): Promise<number> {
  const title = rawTitle.trim()
  const { data: ex } = await sb.from('tracks')
    .select('id, title').eq('artist_id', artistId).ilike('title', title).limit(5)
  const dup = (ex || []).find((t: any) => normalizeForMatch(t.title) === normalizeForMatch(title))
  if (dup) return dup.id

  let slug = slugifyLt(title) || `track-${Date.now()}`
  const { data: exSlug } = await sb.from('tracks').select('id').eq('slug', slug).maybeSingle()
  if (exSlug) slug = `${slug}-${Date.now().toString(36)}`
  const { data: row, error } = await sb.from('tracks')
    .insert({ title, slug, artist_id: artistId }).select('id').single()
  if (error) throw error
  return row.id
}
