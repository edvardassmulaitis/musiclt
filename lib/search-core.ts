/**
 * lib/search-core.ts — VIENAS bendras paieškos variklis visam projektui.
 *
 * Visi search'ai (public picker'iai, admin sąrašai, dienos daina, topai,
 * trūkstama muzika, quick-add) turi eiti per šitas funkcijas, kad logika
 * būtų identiška visur:
 *
 *   • diakritikai NEJAUTRU: JS normLt(query) ↔ DB *_norm stulpeliai
 *     (lower(unaccent(...)), GIN trigram indeksai — žr.
 *     musiclt_search_unaccent_RUN_IN_SUPABASE.sql)
 *   • multi-word „atlikėjas + pavadinimas" skaidymas per VISUS split taškus
 *     („jessica shy vetru" → artist „jessica shy" + title „vetru")
 *   • kandidatai VISADA rikiuojami: exact > prasideda-nuo > turi,
 *     o tier'o viduje pagal POPULIARUMĄ (score desc)
 *
 * Naudotojai:
 *   /api/search-entities  (public picker'iai: EntityPicker, MusicSearchPicker)
 *   /api/artists?search=  (admin atlikėjų sąrašas, admin-search-modal, inbox)
 *   /api/tracks?search=   (dienos daina, admin topai, tracks admin, merge)
 *   /api/albums?search=   (admin-search-modal, albums admin)
 *   /api/admin/artists/search (quick-add picker'iai)
 */

export const LT_MAP: Record<string, string> = {
  ą: 'a', č: 'c', ę: 'e', ė: 'e', į: 'i', š: 's', ų: 'u', ū: 'u', ž: 'z',
}

/** Lowercase + LT diakritikos + bendras unicode unaccent — atitinka DB *_norm. */
export const normLt = (s: string) =>
  (s || '')
    .toLowerCase()
    .replace(/[ąčęėįšųūž]/g, (c) => LT_MAP[c] || c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')

/** normLt + pašalinti ilike/PostgREST-or() pavojingus simbolius. */
export const safeLike = (s: string) =>
  normLt(s).replace(/[%_,()]/g, ' ').replace(/\s+/g, ' ').trim()

/** „Platus" vieno termo pattern'as: jei užklausoje yra vienraidžių nuotrupų
 *  („vartai m"), imam ILGIAUSIĄ prasmingą žodį, kitaip pilną užklausą. */
export function broadTerm(q: string): string {
  const allWords = q.split(/\s+/).filter(Boolean)
  const longWords = allWords.filter((t) => t.length >= 2)
  if (allWords.length === longWords.length) return q
  return longWords.sort((a, b) => b.length - a.length)[0] || q
}

/** Match tier: 0 = exact, 1 = prasideda nuo, 2 = turi. Diakritikai nejautru. */
export function rankTier(value: string | null | undefined, q: string): number {
  const v = normLt(value || '')
  const n = normLt(q).trim()
  if (!n) return 2
  if (v === n) return 0
  if (v.startsWith(n)) return 1
  return 2
}

/** Visi unikalūs „pirmi k žodžių = atlikėjas, likę = pavadinimas" skaidymai
 *  (abiem kryptim) — kelių žodžių atlikėjams kaip „Olivia Dean". */
export function buildSplits(tokens: string[]): Array<{ artistToks: string[]; titleToks: string[] }> {
  const splits: Array<{ artistToks: string[]; titleToks: string[] }> = []
  for (let k = 1; k < tokens.length; k++) {
    splits.push({ artistToks: tokens.slice(0, k), titleToks: tokens.slice(k) })
    splits.push({ artistToks: tokens.slice(tokens.length - k), titleToks: tokens.slice(0, tokens.length - k) })
  }
  const seen = new Set<string>()
  return splits.filter((s) => {
    if (!s.artistToks.length || !s.titleToks.length) return false
    const key = s.artistToks.join('|') + '::' + s.titleToks.join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const SCORE_DESC = { ascending: false, nullsFirst: false } as const

/**
 * Atlikėjų paieška: name_norm trigram + rikiavimas exact > prefix > contains,
 * tier'e pagal score (populiarumą). Dvi lygiagrečios užklausos (prefix +
 * contains), kad retas tikslus atitikmuo neiškristų už populiarių „contains".
 */
export async function searchArtistsCore(
  sb: any,
  q: string,
  opts: { limit?: number; select?: string } = {}
): Promise<any[]> {
  const limit = opts.limit ?? 10
  const select = opts.select ?? 'id, name, slug, country, cover_image_url, score'
  const safe = safeLike(broadTerm(q))
  if (!safe) return []
  const [pref, cont] = await Promise.all([
    sb.from('artists').select(select).ilike('name_norm', `${safe}%`).order('score', SCORE_DESC).limit(Math.max(limit * 2, 16)),
    sb.from('artists').select(select).ilike('name_norm', `%${safe}%`).order('score', SCORE_DESC).limit(Math.max(limit * 3, 30)),
  ])
  const seen = new Set<number>()
  const rows: any[] = []
  for (const r of [...(pref.data || []), ...(cont.data || [])]) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    rows.push(r)
  }
  rows.sort(
    (a, b) =>
      rankTier(a.name, q) - rankTier(b.name, q) ||
      (b.score ?? -1) - (a.score ?? -1) ||
      (a.name || '').length - (b.name || '').length
  )
  return rows.slice(0, limit)
}

/**
 * Dainų paieška — grąžina SURIKIUOTUS track ID (kvietėjas pats hidratuoja
 * pilnus laukus per .in('id', ids)). Ta pati logika kaip /api/search-entities:
 *   tier 0: compound „atlikėjas + pavadinimas" match'ai
 *   tier 1: tiesioginiai pavadinimo match'ai
 *   tier 2: top atlikėjo fan-out (kai užklausa = atlikėjo vardas)
 * Tier'o viduje: exact/prefix title pirmiau, tada score desc.
 */
export async function searchTracksCore(
  sb: any,
  q: string,
  opts: { limit?: number; artistId?: number } = {}
): Promise<number[]> {
  const limit = opts.limit ?? 30
  const safe = safeLike(broadTerm(q))
  if (!safe) return []
  const pattern = `%${safe}%`

  type Row = { id: number; title: string; score: number | null }

  // Konkretaus atlikėjo ribose — tik title match, be compound/fanout.
  if (opts.artistId) {
    const { data } = await sb
      .from('tracks')
      .select('id,title,score')
      .eq('artist_id', opts.artistId)
      .ilike('title_norm', pattern)
      .order('score', SCORE_DESC)
      .limit(limit)
    const rows: Row[] = data || []
    rows.sort((a, b) => rankTier(a.title, q) - rankTier(b.title, q) || (b.score ?? -1) - (a.score ?? -1))
    return rows.map((r) => r.id)
  }

  const tokens = q.split(/\s+/).filter((t) => t.length >= 2)
  const compound = tokens.length >= 2

  const directP = sb
    .from('tracks')
    .select('id,title,score')
    .ilike('title_norm', pattern)
    .order('score', SCORE_DESC)
    .limit(Math.max(limit, 20))

  let compoundRows: Row[] = []
  let fanoutRows: Row[] = []

  if (compound) {
    const variants = await Promise.all(
      buildSplits(tokens).map(async ({ artistToks, titleToks }) => {
        const aPat = `%${safeLike(artistToks.join(' '))}%`
        const { data: arts } = await sb
          .from('artists')
          .select('id,score')
          .ilike('name_norm', aPat)
          .order('score', SCORE_DESC)
          .limit(30)
        if (!arts || arts.length === 0) return [] as Row[]
        let tq = sb
          .from('tracks')
          .select('id,title,score')
          .in('artist_id', (arts as any[]).map((x) => x.id))
        for (const tok of titleToks) tq = tq.ilike('title_norm', `%${safeLike(tok)}%`)
        const { data } = await tq.order('score', SCORE_DESC).limit(limit)
        return (data || []) as Row[]
      })
    )
    compoundRows = variants.flat()
  } else {
    // Fan-out: užklausa gali būti atlikėjo vardas — rodom jo top dainas.
    const arts = await searchArtistsCore(sb, q, { limit: 2, select: 'id,name,score' })
    if (arts.length > 0) {
      const { data } = await sb
        .from('tracks')
        .select('id,title,score')
        .in('artist_id', arts.map((a: any) => a.id))
        .order('score', SCORE_DESC)
        .limit(limit)
      fanoutRows = (data || []) as Row[]
    }
  }

  const directRows: Row[] = (await directP).data || []

  const seen = new Set<number>()
  const out: Array<Row & { rank: number }> = []
  const push = (rows: Row[], rank: number) => {
    for (const r of rows) {
      if (!r?.id || seen.has(r.id)) continue
      seen.add(r.id)
      out.push({ ...r, rank })
    }
  }
  push(compoundRows, 0)
  push(directRows, 1)
  push(fanoutRows, 2)
  out.sort(
    (a, b) =>
      a.rank - b.rank ||
      rankTier(a.title, q) - rankTier(b.title, q) ||
      (b.score ?? -1) - (a.score ?? -1)
  )
  return out.slice(0, limit).map((r) => r.id)
}

/**
 * Albumų paieška — surikiuoti album ID: title_norm match + (multi-word atveju)
 * compound atlikėjas+pavadinimas. Tier'e pagal score.
 */
export async function searchAlbumsCore(
  sb: any,
  q: string,
  opts: { limit?: number; artistId?: number } = {}
): Promise<number[]> {
  const limit = opts.limit ?? 20
  const safe = safeLike(broadTerm(q))
  if (!safe) return []
  const pattern = `%${safe}%`

  type Row = { id: number; title: string; score: number | null }

  if (opts.artistId) {
    const { data } = await sb
      .from('albums')
      .select('id,title,score')
      .eq('artist_id', opts.artistId)
      .ilike('title_norm', pattern)
      .order('score', SCORE_DESC)
      .limit(limit)
    const rows: Row[] = data || []
    rows.sort((a, b) => rankTier(a.title, q) - rankTier(b.title, q) || (b.score ?? -1) - (a.score ?? -1))
    return rows.map((r) => r.id)
  }

  const tokens = q.split(/\s+/).filter((t) => t.length >= 2)

  const directP = sb
    .from('albums')
    .select('id,title,score')
    .ilike('title_norm', pattern)
    .order('score', SCORE_DESC)
    .limit(Math.max(limit, 16))

  let compoundRows: Row[] = []
  if (tokens.length >= 2) {
    const variants = await Promise.all(
      buildSplits(tokens).map(async ({ artistToks, titleToks }) => {
        const aPat = `%${safeLike(artistToks.join(' '))}%`
        const { data: arts } = await sb
          .from('artists')
          .select('id')
          .ilike('name_norm', aPat)
          .order('score', SCORE_DESC)
          .limit(30)
        if (!arts || arts.length === 0) return [] as Row[]
        let alq = sb
          .from('albums')
          .select('id,title,score')
          .in('artist_id', (arts as any[]).map((x) => x.id))
        for (const tok of titleToks) alq = alq.ilike('title_norm', `%${safeLike(tok)}%`)
        const { data } = await alq.order('score', SCORE_DESC).limit(limit)
        return (data || []) as Row[]
      })
    )
    compoundRows = variants.flat()
  }

  const directRows: Row[] = (await directP).data || []

  const seen = new Set<number>()
  const out: Array<Row & { rank: number }> = []
  const push = (rows: Row[], rank: number) => {
    for (const r of rows) {
      if (!r?.id || seen.has(r.id)) continue
      seen.add(r.id)
      out.push({ ...r, rank })
    }
  }
  push(compoundRows, 0)
  push(directRows, 1)
  out.sort(
    (a, b) =>
      a.rank - b.rank ||
      rankTier(a.title, q) - rankTier(b.title, q) ||
      (b.score ?? -1) - (a.score ?? -1)
  )
  return out.slice(0, limit).map((r) => r.id)
}
