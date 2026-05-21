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
 * Lietuviški linksniai — galininkas (accusative) atlikėjų vardams.
 *
 * Konvertuoja vardą iš vardininko (nominatyvo) į galininką (akuzatyvo),
 * naudojant heuristic'inį žodžio galūnės pakeitimą. Skirta „Apie {vardas}"
 * kontekstui artist puslapyje (naudotojo skundas: „Apie Marijonas Mikutavičius"
 * → turi būti „Apie Marijoną Mikutavičių").
 *
 * Taisyklės (LT 1-2 deklinacijos masc./fem. variantai):
 *   masc.: -as → -ą,  -is → -į,  -ys → -į,  -ius → -ių,  -us → -ų,
 *          -ičius → -ičių (jau covered by -ius),
 *          -ėnas → -ėną (covered by -as)
 *   fem.:  -a → -ą,  -ė → -ę,  -ienė → -ienę,  -aitė/-utė/-ytė/-iūtė → -*ę
 *
 * Tinka tiek vardams (Marijonas → Marijoną), tiek pavardėms (Mikutavičius →
 * Mikutavičių). Multi-word atlikėjui transform'inam kiekvieną žodį atskirai
 * („Marijonas Mikutavičius" → „Marijoną Mikutavičių").
 *
 * NETAIKO ne LT vardams — `onlyForLt=true` (default) reikalauja country flag'o
 * iš caller'io (žiūrėk `accusativeArtistName()`). Jei netinka, grąžinam
 * vardą nepakitusį.
 *
 * Edge case'ai (kol kas neapdorojam — heuristic'as klystės):
 *   • Foreign band names su LT-look galūnėmis („Sister" → grąžins „Sisterę"
 *     fail'aujas, bet ten ir taip nereiks accusative — country čekas saugiausias)
 *   • Trumpiniai (G&G, AC/DC) — pavyzdžiui „G&G Sindikatas" → „G&G Sindikatą"
 *     (veiks per per-word loop)
 *   • Vardai jau galininke (Marijoną) — recursive apply nedaro įtakos
 *     („Marijoną" baigiasi su „ą" — joks rule nematch'ina, paliekam)
 */
const ACCUSATIVE_ENDINGS: [string, string][] = [
  // Specific endings PRIEŠ generic (longer match first)
  ['ičius',  'ičių'],   // Mikutavičius → Mikutavičių (covered by 'ius', bet aiškiau)
  ['ienė',   'ienę'],   // Janulaitienė → Janulaitienę
  ['iūtė',   'iūtę'],   // Mikutavičiūtė → Mikutavičiūtę
  ['aitė',   'aitę'],
  ['utė',    'utę'],
  ['ytė',    'ytę'],
  ['ėnas',   'ėną'],    // Lukšėnas → Lukšėną (covered by 'as')
  ['ius',    'ių'],     // Andrius → Andrių
  ['as',     'ą'],      // Marijonas → Marijoną, Vytautas → Vytautą
  ['is',     'į'],      // Karolis → Karolį
  ['ys',     'į'],      // (retas)
  ['us',     'ų'],      // Adamkus → Adamkų
  ['ė',      'ę'],      // Aistė → Aistę
  ['a',      'ą'],      // Justina → Justiną
]

function toAccusativeWord(word: string): string {
  // Acronyms / short tokens — paliekam
  if (word.length < 2) return word
  // Foreign chars (q/w/x ar non-LT diakritika)? — skip
  if (/[qwx]/i.test(word)) return word
  // Jau gali būti galininke (galūnė ą/ę/į/ų) — nedarom „double accusative"
  if (/[ąęįų]$/.test(word)) return word
  for (const [from, to] of ACCUSATIVE_ENDINGS) {
    if (word.length > from.length && word.toLowerCase().endsWith(from)) {
      return word.slice(0, word.length - from.length) + to
    }
  }
  return word
}

/**
 * Konvertuoja viso atlikėjo vardo string'ą į galininką. Multi-word transform —
 * kiekvienas žodis atskirai. Atskyriklys: space arba hyphen.
 *
 * @param name        Vardas vardininko forma (pvz. „Marijonas Mikutavičius")
 * @param countryHint Jei perduotas ir != 'Lietuva' — grąžinam unchanged.
 *                    Default: praleidžiam šitą čeką (caller'is atsakingas).
 */
export function accusativeArtistName(name: string, countryHint?: string | null): string {
  if (!name) return name
  if (countryHint && countryHint !== 'Lietuva') return name
  // Per-word transform (space + hyphen separators)
  return name.split(/(\s+|-)/).map(part => {
    if (/^\s+$/.test(part) || part === '-') return part
    return toAccusativeWord(part)
  }).join('')
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
