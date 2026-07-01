// lib/parse-review-author.ts
//
// Heuristinis recenzijos AUTORIAUS ištraukimas iš naujienos teksto/antraštės.
// Naudojamas News triage admin'e (/admin/naujienu-triage): 523 RECENZIJA
// naujienos neturi atskiro `author` stulpelio — autorius įrašytas laisvu tekstu
// straipsnio kūne ("vertino X", "Tekstas: X", byline pabaigoje ir pan.).
//
// Formatai music.lt archyve labai įvairūs, todėl parsinimas pagauna tik dalį
// (~30–40%). Likusius operatorius susieja rankiniu būdu admin sąsajoje — todėl
// funkcija grąžina ir `confidence`, kad UI galėtų rikiuoti "reikia dėmesio"
// įrašus pirmus. AI fallback pridedamas atskirai (nekeičia šio kontrakto).

export type ParsedAuthor = {
  /** Švarus autoriaus vardas, pvz. "Rūta Paitian". null jei neradom. */
  name: string | null
  /** Normalizuotas raktas susiejimo atminčiai (mažosios, be diakritikos, viengubi tarpai). */
  key: string | null
  /** 0..1 — kiek pasitikim. Aiškus "Tekstas: X" ~0.9; spėjimas iš pabaigos ~0.4. */
  confidence: number
  /** Kuri taisyklė suveikė — debug'ui ir UI paaiškinimui. */
  method: string | null
}

const EMPTY: ParsedAuthor = { name: null, key: null, confidence: 0, method: null }

/** HTML → grynas tekstas (recenzijų body yra HTML). Saugus paprastas striper'is. */
export function stripHtml(html: string): string {
  return (html || '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Normalizuotas raktas: mažosios, LT diakritika → lotyniška, viengubi tarpai. */
export function authorKey(name: string): string {
  const map: Record<string, string> = {
    ą: 'a', č: 'c', ę: 'e', ė: 'e', į: 'i', š: 's', ų: 'u', ū: 'u', ž: 'z',
  }
  return (name || '')
    .toLowerCase()
    .replace(/[ąčęėįšųūž]/g, (c) => map[c] || c)
    .replace(/[.,;:!?"'`«»„“”()\[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Lietuviškas vardas-pavardė: 2–3 žodžiai, KIEKVIENAS iš didžiosios raidės.
// Reikalaujam didžiosios pradžios (be `i` vėliavėlės regex'uose), kad galėtume
// atskirti vardą nuo mažųjų „užpildo" žodžių byline'e („vertino ir įamžino X").
const LOWER = 'a-ząčęėįšųūž'
const UPPER = 'A-ZĄČĘĖĮŠŲŪŽ'
const NAME_WORD = `[${UPPER}][${LOWER}${UPPER}\\-']+`
const FULL_NAME = `${NAME_WORD}(?:\\s+${NAME_WORD}){1,2}`
// Iki 4 mažųjų „užpildo" žodžių tarp veiksmažodžio ir vardo
// (pvz. „vertino ir akimirkas įamžino Rugilė Jatkauskaitė").
const FILL = `(?:\\s+[${LOWER}]+){0,4}`

// Žodžiai, kurie NĖRA autorius, net jei atrodo kaip vardas (stop-list).
const NOT_NAME = new Set([
  'music', 'lt', 'muzikos', 'muzika', 'naujienos', 'recenzija', 'recenzijos',
  'albumas', 'albumo', 'daina', 'dainos', 'grupė', 'grupe', 'atlikėjas',
  'skaityti', 'daugiau', 'nuotrauka', 'nuotraukos', 'foto', 'copyright',
])

function clean(name: string): string {
  return name.replace(/\s+/g, ' ').replace(/[.,;:—–-]+$/, '').trim()
}

// Iš godžiai pagauto kandidato palieka tik PRIEKINIUS didžiąja raide
// prasidedančius žodžius (2–3). Reikia, nes regex `i` vėliavėlė neleidžia
// reikalauti didžiosios pačiame šablone, o godus match'as užkabina ir
// sekančius mažuosius žodžius (pvz. „Tomas Petrauskas pagal pranešimą").
// Grąžina švarų vardą arba null, jei nelieka bent 2 tinkamų žodžių.
// Lietuviškų pavardžių tipinės galūnės — jei 2-as žodis jomis baigiasi, tai jau
// pilna „Vardas Pavardė", ir 3-io žodžio neimam (dažnai tai sakinio pradžia,
// pvz. „...vertino Eligijus Zaburas Šio renginio metu...").
const SURNAME_END = /(?:auskas|iauskas|inskas|evičius|avičius|aitė|ytė|ūtė|iūtė|ienė|uvienė|as|is|us|ys|ius|ė)$/i

function extractName(raw: string): string | null {
  const words = clean(raw).split(/\s+/)
  const kept: string[] = []
  for (const w of words) {
    if (!/^[A-ZĄČĘĖĮŠŲŪŽ]/.test(w)) break        // pirmas ne-didžiosios žodis stabdo
    if (NOT_NAME.has(w.toLowerCase())) break
    kept.push(w)
    if (kept.length === 2 && SURNAME_END.test(w)) break // „Vardas Pavardė" pilna
    if (kept.length === 3) break
  }
  if (kept.length < 2) return null
  return kept.join(' ')
}

// Žodžio tęsinio klasė, kuri APIMA lietuviškas raides — JS `\w` jų nepagauna,
// todėl raktažodžiai su diakritika ("parengė", "parašė", "autorė") nutrūktų.
const WC = `[\\wąčęėįšųūžĄČĘĖĮŠŲŪŽ]`

// Taisyklės — nuo tiksliausių (aukštas confidence) iki spėjimų (žemas).
// BE `i` vėliavėlės: raktažodžio pirma raidė koduota [Xx] klase, o vardui
// reikalaujam didžiosios — kad `FILL` (mažieji) neprarytų paties vardo.
// Kiekviena grąžina pirmą tinkantį FULL_NAME (capture group 1).
const RULES: Array<{ re: RegExp; conf: number; method: string }> = [
  // "Recenzijos autorius: Vardas Pavardė"
  { re: new RegExp(`[Rr]ecenzij${WC}*\\s+autori${WC}+\\s*[:—–-]?\\s*(${FULL_NAME})`), conf: 0.92, method: 'recenzijos-autorius' },
  // "Tekstą parašė Vardas Pavardė"
  { re: new RegExp(`[Tt]ekst${WC}*\\s+paraš${WC}+\\s+(${FULL_NAME})`), conf: 0.9, method: 'teksta-parase' },
  // "Tekstas: Vardas Pavardė"
  { re: new RegExp(`[Tt]ekst${WC}*\\s*[:—–-]\\s*(${FULL_NAME})`), conf: 0.9, method: 'tekstas' },
  // "Autorius: Vardas Pavardė" — reikalaujam skyriklio, kad „Music.lt autoriai" negautų vardo
  { re: new RegExp(`[Aa]utor(?:ius|ė|iaus|ei|iai)\\s*[:—–-]\\s*(${FULL_NAME})`), conf: 0.85, method: 'autorius' },
  // "vertino [ir akimirkas įamžino] Vardas Pavardė" / "įvertino" — pagrindinis music.lt byline
  { re: new RegExp(`[Įį]?[Vv]ertin${WC}+${FILL}\\s+(${FULL_NAME})`), conf: 0.8, method: 'vertino' },
  // "recenzavo [ir ...] Vardas Pavardė"
  { re: new RegExp(`[Rr]ecenzav${WC}+${FILL}\\s+(${FULL_NAME})`), conf: 0.8, method: 'recenzavo' },
  // "Parengė Vardas Pavardė"
  { re: new RegExp(`[Pp]areng${WC}+\\s+(${FULL_NAME})`), conf: 0.72, method: 'parenge' },
  // "Aut.: Vardas Pavardė"
  { re: new RegExp(`[Aa]ut\\.?\\s*[:—–-]\\s*(${FULL_NAME})`), conf: 0.7, method: 'aut' },
]

/**
 * Ištraukia autorių iš recenzijos. Priima žalią body (HTML ar tekstą) + antraštę.
 * Grąžina geriausią spėjimą su confidence, arba EMPTY jei nieko.
 */
export function parseReviewAuthor(body: string | null | undefined, title?: string | null): ParsedAuthor {
  const text = stripHtml(body || '')
  if (!text && !title) return EMPTY

  const haystacks = [text, title || '']
  let best: ParsedAuthor = EMPTY

  for (const rule of RULES) {
    for (const hay of haystacks) {
      const m = hay.match(rule.re)
      if (m && m[1]) {
        const name = extractName(m[1])
        if (name && rule.conf > best.confidence) {
          best = { name, key: authorKey(name), confidence: rule.conf, method: rule.method }
        }
      }
    }
    if (best.confidence >= 0.9) break // pakankamai tikras — nebeieškom
  }

  // Fallback: byline paskutinėse teksto eilutėse ("— Vardas Pavardė" pabaigoje).
  if (!best.name && text) {
    const tail = text.split('\n').slice(-3).join('\n')
    const m = tail.match(new RegExp(`(?:^|[—–-])\\s*(${FULL_NAME})\\s*$`, 'm'))
    if (m && m[1]) {
      const name = extractName(m[1])
      if (name) {
        best = { name, key: authorKey(name), confidence: 0.4, method: 'byline-tail' }
      }
    }
  }

  return best
}
