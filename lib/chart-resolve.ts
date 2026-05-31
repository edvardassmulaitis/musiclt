/**
 * chart-resolve.ts — external_chart_entries → katalogo dainų susiejimas.
 *
 * Modelis (žr. EXTERNAL_CHARTS_PLAN.md §3): „review queue first".
 *  - findConfidentMatch: griežtas auto-match (atlikėjas IR pavadinimas sutampa
 *    po normalizacijos) → resolve_state='matched'. Naudoja bulk „Auto-match".
 *  - Neaiškūs lieka 'ambiguous'/'pending' → admin per /admin/charts patvirtina
 *    (link per search-entities picker) arba sukuria naują (find-or-create).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

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

/** Pirmas atlikėjas iš „Xcho, By Индия, МОТ" / „A feat. B" / „A & B". */
export function primaryArtist(name: string): string {
  return (name || '').split(/,|&|\bfeat\.?\b|\bx\b|\bvs\.?\b|\bw\//i)[0].trim()
}

function longestToken(s: string): string {
  const toks = normalizeForMatch(s).split(' ').filter(t => t.length >= 2)
  return toks.sort((a, b) => b.length - a.length)[0] || normalizeForMatch(s)
}

export type ConfidentMatch = { trackId: number; artistId: number; trackTitle: string; artistName: string }

/**
 * Griežtas match: randa atlikėją, kurio normalizuotas vardas == entry atlikėjo,
 * ir po juo dainą, kurios normalizuotas pavadinimas == entry pavadinimo.
 * Grąžina match TIK jei vienareikšmis (1 toks track'as). Kitaip null.
 */
export async function findConfidentMatch(
  sb: SupabaseClient, rawArtist: string, rawTitle: string,
): Promise<ConfidentMatch | null> {
  const aNorm = normalizeForMatch(primaryArtist(rawArtist))
  const tNorm = normalizeForMatch(rawTitle)
  if (!aNorm || !tNorm) return null

  // Kandidatai atlikėjai pagal ilgiausią žodį (platus), tada tikslus filtras.
  const { data: artists } = await sb
    .from('artists')
    .select('id, name')
    .ilike('name', `%${longestToken(rawArtist).replace(/[%_]/g, '')}%`)
    .limit(40)
  const exact = (artists || []).filter((a: any) => normalizeForMatch(a.name) === aNorm)
  if (exact.length === 0) return null

  const ids = exact.map((a: any) => a.id)
  const { data: tracks } = await sb
    .from('tracks')
    .select('id, title, artist_id, artists:artist_id(name)')
    .in('artist_id', ids)
    .ilike('title', `%${longestToken(rawTitle).replace(/[%_]/g, '')}%`)
    .limit(60)
  const hits = (tracks || []).filter((t: any) => normalizeForMatch(t.title) === tNorm)
  if (hits.length !== 1) return null   // 0 = nėra, >1 = dviprasmiška → review

  const t: any = hits[0]
  const ar = Array.isArray(t.artists) ? t.artists[0] : t.artists
  return { trackId: t.id, artistId: t.artist_id, trackTitle: t.title, artistName: ar?.name || rawArtist }
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
  sb: SupabaseClient, rawArtist: string, country: string | null,
): Promise<number> {
  const name = primaryArtist(rawArtist) || rawArtist
  const nNorm = normalizeForMatch(name)
  const { data: cands } = await sb
    .from('artists').select('id, name')
    .ilike('name', `%${longestToken(name).replace(/[%_]/g, '')}%`).limit(40)
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
  sb: SupabaseClient, artistId: number, rawTitle: string,
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
