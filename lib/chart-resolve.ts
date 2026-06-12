/**
 * chart-resolve.ts — external_chart_entries → katalogo dainų susiejimas.
 *
 * Modelis (žr. EXTERNAL_CHARTS_PLAN.md §3): „review queue first".
 *  - findConfidentMatch: griežtas auto-match (atlikėjas IR pavadinimas sutampa
 *    po normalizacijos) → resolve_state='matched'. Naudoja bulk „Auto-match".
 *  - Neaiškūs lieka 'ambiguous'/'pending' → admin per /admin/charts patvirtina
 *    (link per search-entities picker) arba sukuria naują (find-or-create).
 */
// Sb klientas tipuojamas `any` — createAdminClient() grąžina typed
// SupabaseClient<Database>, kuris dėl generic contravariance gali nesutapti su
// importuotu SupabaseClient tipu (Vercel build fail). `any` saugu helperiui.
type Sb = any

const LT_MAP: Record<string, string> = {
  ą: 'a', č: 'c', ę: 'e', ė: 'e', į: 'i', š: 's', ų: 'u', ū: 'u', ž: 'z',
}

/** Normalizuoja palyginimui: lower, LT diakritika, feat/() nuėmimas, alnum. */
export function normalizeForMatch(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[ąčęėįšųūž]/g, c => LT_MAP[c] || c)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\(feat[^)]*\)|\bfeat\.?\b.*$|\(.*?remix.*?\)|\(.*?version.*?\)|\(.*?w\/.*?\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Agresyvesnė normalizacija: pašalina VISUS skliaustus (...)  ir [...].
 *  Naudojama kaip fallback kai standartinis match neranda — chart pavadinime
 *  dažnai būna papildomos žymos: „(When You Gonna)", „[Deluxe]", „(Sped Up)" ir t.t.
 *  kurios neegzistuoja DB track pavadinime. */
export function normalizeAggressive(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[ąčęėįšųūž]/g, c => LT_MAP[c] || c)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\bfeat\.?\b.*$/, '')            // feat ir viskas po jo
    .replace(/\([^)]*\)/g, '')                // visi (...)
    .replace(/\[[^\]]*\]/g, '')               // visi [...]
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Pirmas atlikėjas iš „Xcho, By Индия, МОТ" / „A feat. B" / „A & B". */
export function primaryArtist(name: string): string {
  return (name || '').split(/,|&|\bfeat\.?\b|\bx\b|\bvs\.?\b|\bw\//i)[0].trim()
}

/** Ilgiausias RAW žodis (su diakritika) ilike prefiltrui.
 *  SVARBU: ilike lyginamas prieš RAW DB reikšmes (su ž/ė/š/Cyrillic), tad token'as
 *  TURI išlaikyti originalius simbolius — normalizuotas „zveris" niekada neranda
 *  „Žvėris". Palyginimą daro normalizeForMatch atskirai. */
function rawLongestToken(s: string): string {
  const toks = (s || '').split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 2)
  return (toks.sort((a, b) => b.length - a.length)[0] || (s || '').trim())
    .replace(/[%_]/g, '')
}

export type ConfidentMatch = { trackId: number; artistId: number; trackTitle: string; artistName: string }

/**
 * Griežtas match: randa atlikėją, kurio normalizuotas vardas == entry atlikėjo,
 * ir po juo dainą, kurios normalizuotas pavadinimas == entry pavadinimo.
 * Diakritikai atsparu: ilike prefiltras su RAW token'u, palyginimas normalizuotas.
 * Track'us fetch'ina pagal atlikėją ir filtruoja JS'e (ne title ilike) — atsparu
 * versijų priesagoms / diakritikai. Jei keli identiški → ima kanoninį (maž. id).
 */
export async function findConfidentMatch(
  sb: Sb, rawArtist: string, rawTitle: string,
): Promise<ConfidentMatch | null> {
  const aNorm = normalizeForMatch(primaryArtist(rawArtist))
  const tNorm = normalizeForMatch(rawTitle)
  const tAggr = normalizeAggressive(rawTitle)   // fallback be skliaustų
  if (!aNorm || !tNorm) return null

  // Kandidatai atlikėjai pagal ilgiausią RAW žodį (platus), tada tikslus filtras.
  const aTok = rawLongestToken(primaryArtist(rawArtist))
  if (!aTok) return null
  const { data: artists } = await sb
    .from('artists')
    .select('id, name')
    .ilike('name', `%${aTok}%`)
    .limit(60)
  const exact = (artists || []).filter((a: any) => normalizeForMatch(a.name) === aNorm)
  if (exact.length === 0) return null

  const ids = exact.map((a: any) => a.id)
  // Visi atlikėjo track'ai → filtras JS'e (be title ilike, kad diakritika/versijos netrukdytų).
  const { data: tracks } = await sb
    .from('tracks')
    .select('id, title, artist_id, artists:artist_id(name)')
    .in('artist_id', ids)
    .limit(800)
  // 1) Tikslus match (standartinė normalizacija)
  let hits = (tracks || []).filter((t: any) => normalizeForMatch(t.title) === tNorm)
  // 2) Fallback: agresyvi normalizacija (strip ALL parens/brackets) — abiem pusėm
  if (hits.length === 0 && tAggr !== tNorm) {
    hits = (tracks || []).filter((t: any) => normalizeAggressive(t.title) === tAggr)
  }
  if (hits.length === 0) return null

  // Vienas → akivaizdu; keli (alt versijos) → kanoninis = mažiausias id, bet
  // pirmenybė tiksliam raw pavadinimo sutapimui.
  hits.sort((a: any, b: any) => a.id - b.id)
  const t: any = hits.find((h: any) => (h.title || '').trim() === rawTitle.trim()) || hits[0]
  const ar = Array.isArray(t.artists) ? t.artists[0] : t.artists
  return { trackId: t.id, artistId: t.artist_id, trackTitle: t.title, artistName: ar?.name || rawArtist }
}

/**
 * Cross-chart link: susiejus/sukūrus dainą (ar albumą) viename tope, ta pati
 * daina automatiškai susiejama VISUOSE kituose current chart'uose (pvz. Шадэ
 * yra ir AGATA, ir Apple, ir Spotify). Match pagal normalizuotą artist+title.
 * Grąžina kiek papildomų įrašų susieta.
 */
export async function linkSongAcrossCharts(
  sb: Sb,
  opts: { trackId?: number | null; albumId?: number | null; artistId: number; rawArtist: string; rawTitle: string; exceptEntryId?: number },
): Promise<number> {
  const aNorm = normalizeForMatch(primaryArtist(opts.rawArtist))
  const tNorm = normalizeForMatch(opts.rawTitle)
  if (!tNorm) return 0
  const isAlbum = !!opts.albumId

  const { data: charts } = await sb.from('external_charts').select('id, chart_key').eq('is_current', true)
  const chartIds = (charts || [])
    .filter((c: any) => (c.chart_key === 'albums') === isAlbum)
    .map((c: any) => c.id)
  if (chartIds.length === 0) return 0

  const tok = rawLongestToken(opts.rawTitle)
  if (!tok) return 0
  const { data: cands } = await sb.from('external_chart_entries')
    .select('id, artist_name, title')
    .in('chart_id', chartIds)
    .in('resolve_state', ['pending', 'ambiguous', 'text_only'])
    .ilike('title', `%${tok}%`)
    .limit(400)

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

export type ConfidentAlbumMatch = { albumId: number; artistId: number; albumTitle: string; artistName: string }

/**
 * Album atitikmuo (albumų chart'ams). Tas pats principas kaip findConfidentMatch,
 * tik prieš `albums` lentelę. Diakritikai atsparu (raw token + JS filtras).
 */
export async function findConfidentAlbumMatch(
  sb: Sb, rawArtist: string, rawTitle: string,
): Promise<ConfidentAlbumMatch | null> {
  const aNorm = normalizeForMatch(primaryArtist(rawArtist))
  const tNorm = normalizeForMatch(rawTitle)
  const tAggr = normalizeAggressive(rawTitle)
  if (!aNorm || !tNorm) return null

  const aTok = rawLongestToken(primaryArtist(rawArtist))
  if (!aTok) return null
  const { data: artists } = await sb
    .from('artists').select('id, name').ilike('name', `%${aTok}%`).limit(60)
  const exact = (artists || []).filter((a: any) => normalizeForMatch(a.name) === aNorm)
  if (exact.length === 0) return null
  const ids = exact.map((a: any) => a.id)

  const { data: albums } = await sb
    .from('albums')
    .select('id, title, artist_id, artists:artist_id(name, slug)')
    .in('artist_id', ids)
    .limit(800)
  let hits = (albums || []).filter((al: any) => normalizeForMatch(al.title) === tNorm)
  if (hits.length === 0 && tAggr !== tNorm) {
    hits = (albums || []).filter((al: any) => normalizeAggressive(al.title) === tAggr)
  }
  if (hits.length === 0) return null
  hits.sort((a: any, b: any) => a.id - b.id)
  const al: any = hits.find((h: any) => (h.title || '').trim() === rawTitle.trim()) || hits[0]
  const ar = Array.isArray(al.artists) ? al.artists[0] : al.artists
  return { albumId: al.id, artistId: al.artist_id, albumTitle: al.title, artistName: ar?.name || rawArtist }
}

/** Create album po atlikėju (minimal ghost — title+slug+artist). Grąžina album_id. */
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

/**
 * Find-or-create atlikėjas pagal vardą (normalizuotas lookup). Ghost-stiliaus
 * minimalus įrašas (name + slug + country + type). Grąžina artist_id.
 */
export async function findOrCreateArtist(
  sb: Sb, rawArtist: string, country: string | null,
): Promise<number> {
  const name = primaryArtist(rawArtist) || rawArtist
  const nNorm = normalizeForMatch(name)
  const nTok = rawLongestToken(name)
  const { data: cands } = await sb
    .from('artists').select('id, name')
    .ilike('name', `%${nTok || name}%`).limit(60)
  const hit = (cands || []).find((a: any) => normalizeForMatch(a.name) === nNorm)
  if (hit) return hit.id

  let slug = slugifyLt(name) || `artist-${Date.now()}`
  const { data: ex } = await sb.from('artists').select('id').eq('slug', slug).maybeSingle()
  if (ex) slug = `${slug}-${Date.now().toString(36)}`
  const { data: row, error } = await sb.from('artists').insert({
    slug, name, country: country || null, type: 'solo',
    type_music: true,
  }).select('id').single()
  if (error) throw error
  return row.id
}

/** Create track po atlikėju (minimal, kaip quick-create). Grąžina track_id. */
export async function createTrackForArtist(
  sb: Sb, artistId: number, rawTitle: string,
): Promise<number> {
  const title = rawTitle.trim()
  // dedupe: ar jau yra toks track'as po šiuo atlikėju
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
