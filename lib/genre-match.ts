/**
 * Fuzzy genre name → public.substyles row matching.
 *
 * Tikslas: Wikipedia infobox `| genre = [[Synth-pop]], [[pop rock]]` →
 * mūsų taksonomijos substyle.id (DB lentelėje yra „Synthpop", „Pop rock").
 *
 * Matching strategija — bandymas po bandymo, nuo tikslaus link silpniausio:
 *   1. Exact case-insensitive lygiavertis name
 *   2. Normalize'inta lygiavertis (strip dashes, spaces, apostrofus)
 *   3. Slug lygiavertis (kabliai → minus'ai → tas pats normalizer'is)
 *
 * Jei niekas neatitinka — null, caller'is gali log'inti, kad taksonomija
 * nedengia žanro (pridėti į user/feedback memory ar admin notify).
 */

export type SubstyleRow = {
  id: number
  name: string
  slug?: string | null
}

/** Žinomos Wikipedia → mūsų taksonomy aliases. Naudojama PRIEŠ normalize'inimą.
 *  Pridėk tik tuos atvejus, kur fuzzy match per normalize nepasiekia
 *  (skirtingos canonical formos). */
const GENRE_ALIASES: Record<string, string> = {
  'rhythm and blues': 'R&B',
  'rhythm n blues': 'R&B',
  'r and b': 'R&B',
  'r n b': 'R&B',
}

/** Aliases keyed by `normalizeGenreKey` (diakritikai/tarpai/brūkšniai jau
 *  sunormuoti) → canonical substyle name. Naudojama importų LT formoms ir
 *  dažnoms angliškoms variacijoms, kurių grynas norm-match nepasiekia.
 *  Pridėk čia high-confidence sutapimus; abejotinus palik review eilei. */
const GENRE_ALIASES_NORM: Record<string, string> = {
  altpop: 'Alternative pop',
  electronic: 'Electronica',
  electronicpop: 'Electro pop',
  alternatyvusrokas: 'Alternative rock',
  alternatyvusisrokas: 'Alternative rock',
  lietuviskasrokas: 'Alternative rock',
  lithuanianrock: 'Alternative rock',
  rokas: 'Rock',
  eksperimentinemuzika: 'Experimental',
  eksperimentinisrokas: 'Experimental rock',
  improvizacinemuzika: 'Free improvisation',
  improvised: 'Free improvisation', // „Improvised music" → suffix strip → „improvised"
  estrada: 'LT estrada',
  filmsongs: 'Film music',
  filmumuzika: 'Film music',
}

/** Normalizuojam vardą iki matching key'o: ASCII lowercase be specifinių
 *  separator'ių. „Synth-pop" → „synthpop"; „Pop rock" → „poprock";
 *  „rock'n'roll" → „rocknroll"; „rock and roll" → „rocknroll".
 *
 *  Konkrečiai:
 *   - Wikipedia trailing „music" suffix'ą strip'inam („Country music" →
 *     „Country", „Hip hop music" → „Hip hop") — leidžia 6+ bendrus
 *     žanrus match'inti vienodai.
 *   - " and " / " & " kolapsuojam į „n", kad Wikipedia formos „rock and
 *     roll" sutaptų su mūsų DB „Rock'n'roll" (id 1018).
 */
export function normalizeGenreKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')             // strip diakritikus
    .replace(/\s+music$/i, '')          // Wikipedia trailing " music" suffix
    .replace(/\b(?:and|&)\b/g, 'n')    // „and"/„&" → „n" (rock and roll → rock n roll)
    .replace(/['’‘]/g, '')              // apostrofai
    .replace(/[-_\s/\\]+/g, '')         // separator'iai
    .replace(/[^a-z0-9]/g, '')          // ne-alfanumerikai
    .trim()
}

/**
 * Match'ina vieną žanro vardą prieš substyles listą. Pirma exact,
 * paskui normalize'intas, paskui slug. Grąžiną pirmą rasimą — ne best-
 * score'ą, nes substyles unikalūs ir greedy match'as praktikoje tinka.
 */
export function matchGenreToSubstyle(
  rawName: string,
  substyles: SubstyleRow[]
): SubstyleRow | null {
  if (!rawName || !substyles.length) return null
  const lcName = rawName.toLowerCase().trim()
  // Alias map'as — žinomos Wikipedia formos, kurios fuzzy match per
  // normalizeGenreKey nepatenka (pvz „rhythm and blues" → „R&B" — visiškai
  // skirtingi canonical names).
  const aliasTarget = GENRE_ALIASES[lcName]
  if (aliasTarget) {
    const m = substyles.find(s => s.name.toLowerCase() === aliasTarget.toLowerCase())
    if (m) return m
  }
  // Exact (po lowercase)
  for (const s of substyles) {
    if (s.name.toLowerCase() === lcName) return s
  }
  // Normalize'intas
  const norm = normalizeGenreKey(rawName)
  if (!norm) return null
  // Normalized alias (LT formos / variacijos) PRIEŠ fuzzy norm-match
  const normAlias = GENRE_ALIASES_NORM[norm]
  if (normAlias) {
    const m = substyles.find(s => s.name.toLowerCase() === normAlias.toLowerCase())
    if (m) return m
  }
  for (const s of substyles) {
    if (normalizeGenreKey(s.name) === norm) return s
  }
  // Slug match (jei substyle turi slug stulpelį) — kartais slug yra
  // canonical forma „rock-n-roll" o name turi specialius simbolius.
  for (const s of substyles) {
    if (s.slug && normalizeGenreKey(s.slug) === norm) return s
  }
  return null
}

/**
 * Batch: žanrų vardų sąrašas → match'inti substyle ID'jai + neapibrėžti
 * vardai (unmatched). Naudojama Wiki import flow'e — pildome album_substyles
 * tik su match'intais, o unmatched grąžinam UI log'ui.
 */
export function matchGenresToSubstyleIds(
  rawNames: string[],
  substyles: SubstyleRow[]
): { ids: number[]; unmatched: string[] } {
  const ids: number[] = []
  const seen = new Set<number>()
  const unmatched: string[] = []
  for (const n of rawNames) {
    const m = matchGenreToSubstyle(n, substyles)
    if (m && !seen.has(m.id)) {
      ids.push(m.id)
      seen.add(m.id)
    } else if (!m) {
      unmatched.push(n)
    }
  }
  return { ids, unmatched }
}
