/**
 * Atlikėjų/track'ų fuzzy match'eris iš AI extract'intų pavadinimų.
 *
 * Naudoja Postgres pg_trgm similarity() — diacritic-insensitive, fast.
 * Mes ne išvedam top-1 — visada grąžinam scored array'ą, kad UI parodytų
 * geltoną badge'ą jei score < 0.7 (admin'as patvirtina/atmesta).
 */

import { createAdminClient } from './supabase'

export type ArtistMatch = {
  artist_id: number
  name: string
  slug: string
  score: number               // 0..1 (pg_trgm similarity)
  matched_string: string      // ką AI mention'ino
  cover_image_url?: string
  // 2026-05-20: pridėta popularity gate'ui scout pipeline'e. NULL = score
  // dar neapskaičiuotas tam atlikėjui (reikia Wiki enrichment'o).
  artist_score?: number | null
  country?: string | null
}

export type TrackMatch = {
  track_id: number
  title: string
  artist_id: number
  artist_name: string
  score: number
  matched_string: string
}

/**
 * Match atlikėjų pavadinimus per pg_trgm.
 *
 * @param mentions AI grąžintas masyvas {name, confidence}
 * @param minScore minimumas, kad būtų laikoma match'u (default 0.4)
 * @param topPerMention kiek kandidatų grąžinti per kiekvieną mention'ą (default 3)
 */
export async function matchArtists(
  mentions: Array<{ name: string; confidence?: number }>,
  opts: { minScore?: number; topPerMention?: number } = {}
): Promise<ArtistMatch[]> {
  const minScore = opts.minScore ?? 0.4
  const topPerMention = opts.topPerMention ?? 3

  if (mentions.length === 0) return []

  const supabase = createAdminClient()
  const results: ArtistMatch[] = []
  const seenIds = new Set<number>()

  for (const mention of mentions) {
    const name = mention.name.trim()
    if (!name) continue

    // Pirma — exact match (case-insensitive). Greičiau ir tiksliau nei trigram.
    const { data: exactMatch } = await supabase
      .from('artists')
      .select('id, name, slug, cover_image_url, score, country')
      .ilike('name', name)
      .limit(1)
      .maybeSingle()

    if (exactMatch && !seenIds.has(exactMatch.id)) {
      results.push({
        artist_id: exactMatch.id,
        name: exactMatch.name,
        slug: exactMatch.slug,
        score: 1.0,
        matched_string: name,
        cover_image_url: exactMatch.cover_image_url || undefined,
        artist_score: (exactMatch as any).score ?? null,
        country: (exactMatch as any).country ?? null,
      })
      seenIds.add(exactMatch.id)
      continue
    }

    // Trigram similarity per RPC arba raw SQL.
    // Naudojam PostgREST'o 'rpc' su custom funkcija (jeigu yra) ARBA raw query
    // per .rpc('artist_trgm_search', { q, lim }). Default: in-table .ilike fallback.
    const trgmResults = await trgmSearchArtists(supabase, name, topPerMention, minScore)
    for (const r of trgmResults) {
      if (seenIds.has(r.artist_id)) continue
      results.push({ ...r, matched_string: name })
      seenIds.add(r.artist_id)
    }
  }

  // Sort by score DESC
  results.sort((a, b) => b.score - a.score)

  // Backfill artist_score + country pas tuos, kurie atėjo iš RPC kelio (ten
  // schema dažnai be šių laukų). Pigus 1-call'as su .in() ant ~3-10 ID'ų.
  const needLookup = results.filter(r => r.artist_score === undefined || r.country === undefined)
  if (needLookup.length > 0) {
    const { data: meta } = await supabase
      .from('artists')
      .select('id, score, country')
      .in('id', needLookup.map(r => r.artist_id))
    const metaById = new Map<number, { score: number | null; country: string | null }>()
    for (const m of (meta || []) as any[]) {
      metaById.set(m.id, { score: m.score ?? null, country: m.country ?? null })
    }
    for (const r of results) {
      if (r.artist_score === undefined || r.country === undefined) {
        const m = metaById.get(r.artist_id)
        r.artist_score = m?.score ?? null
        r.country = m?.country ?? null
      }
    }
  }

  return results
}

/**
 * In-line trigram search. Naudoja .rpc('similarity') per Postgres.
 * Jeigu RPC nesukurta — fallback į PREFIX match (ilike '%name%').
 */
async function trgmSearchArtists(
  supabase: ReturnType<typeof createAdminClient>,
  query: string,
  limit: number,
  minScore: number
): Promise<Array<Omit<ArtistMatch, 'matched_string'>>> {
  // Mėginam RPC pirma. Jei nesukurta — kris į catch'ą, naudosim fallback'ą.
  try {
    const { data, error } = await supabase.rpc('artist_trgm_search', {
      q: query,
      lim: limit,
      min_score: minScore,
    })
    if (!error && Array.isArray(data)) {
      return data.map((r: any) => ({
        artist_id: r.id,
        name: r.name,
        slug: r.slug,
        score: typeof r.score === 'number' ? r.score : 0.5,
        cover_image_url: r.cover_image_url || undefined,
      }))
    }
  } catch {
    // RPC nesukurta — fallback
  }

  // Fallback: prefix/contains ILIKE. Score apytikslis (1.0 if exact, 0.6 if contains).
  const { data } = await supabase
    .from('artists')
    .select('id, name, slug, cover_image_url')
    .ilike('name', `%${query}%`)
    .limit(limit)

  return (data || []).map((r: any) => ({
    artist_id: r.id,
    name: r.name,
    slug: r.slug,
    score: r.name.toLowerCase() === query.toLowerCase() ? 1.0 : 0.6,
    cover_image_url: r.cover_image_url || undefined,
  }))
}

/**
 * Match track'us — bet TIK pagal scoped artist'ų sąrašą (kad "Yesterday"
 * netraukti tūkstančio cover'ių, o tik to vieno atlikėjo katalogo).
 */
export async function matchTracks(
  mentions: Array<{ title: string; artist?: string }>,
  scopedArtistIds: number[],
  opts: { minScore?: number } = {}
): Promise<TrackMatch[]> {
  const minScore = opts.minScore ?? 0.5
  if (mentions.length === 0 || scopedArtistIds.length === 0) return []

  const supabase = createAdminClient()
  const results: TrackMatch[] = []
  const seenIds = new Set<number>()

  for (const m of mentions) {
    const title = m.title.trim()
    if (!title) continue

    const { data } = await supabase
      .from('tracks')
      .select('id, title, artist_id, artists!tracks_artist_id_fkey(name)')
      .in('artist_id', scopedArtistIds)
      .ilike('title', `%${title}%`)
      .limit(3)

    for (const t of (data as any[]) || []) {
      if (seenIds.has(t.id)) continue
      const score = t.title.toLowerCase() === title.toLowerCase() ? 1.0 : 0.7
      if (score < minScore) continue
      results.push({
        track_id: t.id,
        title: t.title,
        artist_id: t.artist_id,
        artist_name: (t.artists as any)?.name || '',
        score,
        matched_string: title,
      })
      seenIds.add(t.id)
    }
  }

  results.sort((a, b) => b.score - a.score)
  return results
}

/**
 * Convenience — pakelti top-N DB atlikėjus pagal legacy_likes,
 * naudojami kaip "whitelist hint" Sonnet promptui (kad rašybą pataikytų).
 */
export async function getTopArtistsForHint(limit = 500): Promise<string[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('artists')
    .select('name')
    .order('legacy_likes', { ascending: false, nullsFirst: false })
    .limit(limit)
  return (data || []).map((r: any) => r.name).filter(Boolean)
}

/**
 * Aptikti atlikėjų paminėjimus laisvame tekste (Gmail press release'ai ir pan.),
 * substring'u prieš katalogo atlikėjų sąrašą (word-boundary, case-insensitive).
 *
 * Naudojama Gmail ingestijoje IR admin rematch endpoint'e — vienas šaltinis, kad
 * abu keliai elgtųsi vienodai.
 *
 * 2026-07-17: hint anksčiau buvo TIK top 500 pagal legacy_likes — realūs katalogo
 * atlikėjai už to slenksčio (pvz. Gogol Bordello rank 563, The Cinematic Orchestra
 * rank 900) niekada nebūdavo aptinkami, tad gmail naujienos likdavo be atlikėjo.
 * Default pakeltas iki 3000, kad apimtų prasmingą katalogo dalį. Rezultatai eina į
 * `suggested_artist_ids` kaip PASIŪLYMAI — admin'as vis tiek patvirtina prieš
 * publikaciją, tad platesnis langas saugus (galimą retą false-positive admin'as
 * pašalina peržiūros modal'e).
 *
 * @param text laisvas tekstas (subject + body + title)
 * @param opts.hintLimit kiek katalogo atlikėjų (pagal legacy_likes) tikrinti
 * @param opts.maxMentions kiek daugiausiai paminėjimų grąžinti
 */
export async function detectArtistMentions(
  text: string,
  opts: { hintLimit?: number; maxMentions?: number } = {}
): Promise<Array<{ name: string }>> {
  const hintLimit = opts.hintLimit ?? 3000
  const maxMentions = opts.maxMentions ?? 5
  const hint = await getTopArtistsForHint(hintLimit)
  const haystack = (text || '').toLowerCase()
  if (!haystack.trim()) return []

  const mentions: Array<{ name: string }> = []
  for (const raw of hint) {
    const name = (raw || '').toLowerCase()
    // Word-boundary check kad „bo" nematchintų į „bonus"; min ilgis 3 saugo nuo
    // per trumpų/triukšmingų vardų.
    if (!name || name.length < 3) continue
    const pattern = new RegExp(`(^|\\W)${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\W|$)`)
    if (pattern.test(haystack)) {
      mentions.push({ name: raw })
      if (mentions.length >= maxMentions) break
    }
  }
  return mentions
}
