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

/** Normalizuojam vardą iki matching key'o: ASCII lowercase be specifinių
 *  separator'ių. „Synth-pop" → „synthpop"; „Pop rock" → „poprock";
 *  „rock'n'roll" → „rocknroll"; „rock and roll" → „rocknroll".
 *
 *  Konkrečiai " and " / " & " kolapsuojam į „n", kad Wikipedia formos
 *  „rock and roll" ar „rhythm and blues" sutaptų su mūsų DB formomis
 *  „Rock'n'roll" (id 1018). */
export function normalizeGenreKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')             // strip diakritikus
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
  // Exact (po lowercase)
  for (const s of substyles) {
    if (s.name.toLowerCase() === lcName) return s
  }
  // Normalize'intas
  const norm = normalizeGenreKey(rawName)
  if (!norm) return null
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
