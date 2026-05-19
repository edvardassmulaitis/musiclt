/**
 * Bendros teksto utilitos — pagrindinis naudotojas: track/album titles
 * importavimo metu, kad legacy lower-case'iniai pavadinimai ("good old
 * fashioned lover boy") nepatektų į DB. Wiki Style: 'a/the/of/to/in/on'
 * ir kt. short prepositions/articles paliekam mažomis, JEI nėra pirmas/
 * paskutinis žodis segment'e.
 *
 * Segment'as = atskirta `(...)`, dvitaškiu, em-/en-dash, ar `–`.
 * Pirmas/paskutinis žodis segmente ALWAYS cap'inti.
 *
 * 2026-05-19: Sukurta po Queen audit (28 tracks pataisyti backfill mode'e).
 */

// Wiki MOS small-word set — lowercase nebent first/last segmente
const SMALL_WORDS = new Set([
  'a', 'an', 'the',
  'and', 'or', 'but', 'nor', 'yet',
  'as', 'at', 'by', 'for', 'in', 'of', 'on', 'to', 'up', 'via',
  'with', 'from', 'into', 'onto', 'over',
  'vs', 'vs.',
  // Foreign articles dažni angliškuose pavadinimuose (Las Palabras de Amor)
  'de', 'la', 'le', 'du',
  // Rock 'n' roll contraction — visada mažomis
  "'n'", "n'", 'n',
])

const SEG_BOUNDARIES = new Set(['(', ':', ';', '—', '–'])

// Tokenizer: word = isalnum + apostrophes; sep = everything else (one char)
type Token = { kind: 'word' | 'sep'; text: string }
function tokenize(s: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const isWordChar = (c: string) => /[a-zA-Z0-9]/.test(c) || c === "'" || c === '’' || c === '‘'
  while (i < s.length) {
    if (isWordChar(s[i])) {
      let j = i
      while (j < s.length && isWordChar(s[j])) j++
      tokens.push({ kind: 'word', text: s.slice(i, j) })
      i = j
    } else {
      tokens.push({ kind: 'sep', text: s[i] })
      i++
    }
  }
  return tokens
}

// Cap first alpha, lower rest. Preserve all-caps acronyms (USA, AC, DC, len>=2)
function capWord(w: string): string {
  if (!w) return w
  const alpha = Array.from(w).filter(c => /[a-zA-Z]/.test(c))
  if (alpha.length >= 2 && alpha.every(c => c === c.toUpperCase())) {
    return w // acronym
  }
  const lo = w.toLowerCase()
  for (let i = 0; i < lo.length; i++) {
    if (/[a-zA-Z]/.test(lo[i])) {
      return lo.slice(0, i) + lo[i].toUpperCase() + lo.slice(i + 1)
    }
  }
  return lo
}

/**
 * Wiki-style title case (anglų MOS): articles/prepositions/short conjunctions
 * paliekamos mažom JEI nėra pirmas/paskutinis žodis savo segmente.
 *
 * Segment'us atskirti `(`, `:`, `;`, em-dash `—`, en-dash `–`. Žodžiai po
 * tokios punctuation gauna "first in segment" status'ą.
 *
 * Pavyzdžiai:
 *   "good old fashioned lover boy"  -> "Good Old Fashioned Lover Boy"
 *   "i want to break free"          -> "I Want to Break Free"
 *   "we are the champions"          -> "We Are the Champions"
 *   "machines (or 'back to humans')" -> "Machines (Or 'Back to Humans')"
 *   "modern times rock 'n' roll"    -> "Modern Times Rock 'n' Roll"
 *
 * NEPATEIKIA jokios LT kalbos logikos — LT titles dažnai turi natūralų LT
 * stilių. Apply'inti tik tracks/albums kuriuos žinome esant angliškus.
 */
export function wikiTitleCase(s: string): string {
  if (!s) return s
  const tokens = tokenize(s)
  const wordTokens = tokens.filter(t => t.kind === 'word')
  if (!wordTokens.length) return s

  // Group word tokens into segments separated by SEG_BOUNDARIES
  const wordSeg: number[] = []
  let seg = 0
  let pendingNewSeg = false
  for (const t of tokens) {
    if (t.kind === 'sep') {
      if (SEG_BOUNDARIES.has(t.text)) pendingNewSeg = true
    } else {
      if (pendingNewSeg) {
        seg++
        pendingNewSeg = false
      }
      wordSeg.push(seg)
    }
  }

  // For each segment, first/last word indices (within wordTokens flat array)
  const segGroups: Map<number, number[]> = new Map()
  wordSeg.forEach((sg, idx) => {
    if (!segGroups.has(sg)) segGroups.set(sg, [])
    segGroups.get(sg)!.push(idx)
  })
  const isFirst = new Set<number>()
  const isLast = new Set<number>()
  segGroups.forEach((idxs) => {
    if (idxs.length) {
      isFirst.add(idxs[0])
      isLast.add(idxs[idxs.length - 1])
    }
  })

  // Build output
  const out: string[] = []
  let wordIdx = 0
  for (const t of tokens) {
    if (t.kind === 'sep') {
      out.push(t.text)
    } else {
      const isF = isFirst.has(wordIdx)
      const isL = isLast.has(wordIdx)
      const wlow = t.text.toLowerCase()
      if (SMALL_WORDS.has(wlow) && !isF && !isL) {
        // Preserve acronym in small-position
        const alpha = Array.from(t.text).filter(c => /[a-zA-Z]/.test(c))
        if (alpha.length >= 2 && alpha.every(c => c === c.toUpperCase())) {
          out.push(t.text)
        } else {
          out.push(wlow)
        }
      } else {
        out.push(capWord(t.text))
      }
      wordIdx++
    }
  }
  return out.join('')
}
