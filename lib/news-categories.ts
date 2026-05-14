/**
 * News kategorijų konfigūracija — single source of truth.
 *
 * Naudojama:
 *  - lib/ai-normalize.ts — Haiku batch filter (priimti tik šias 4 kategorijas)
 *  - lib/ai-normalize.ts — Sonnet normalize prompt (style guide)
 *  - app/admin/inbox — display label'iai, icons
 *
 * AI filtras agresyvus — geriau atmesti dvejotinus, nei užtaršyti queue gossip'u.
 */

export const NEWS_CATEGORIES = {
  release: {
    label: 'Naujas išleidimas',
    description: 'Single, EP, albumas, music video, soundtrack, remix',
    icon: '💿',
    examples: [
      'Mikutavičius pristato naują singlą „Vasara"',
      'Taylor Swift išleido naują albumą',
      'Coldplay paskelbė oficialų klipą',
    ],
  },
  performance: {
    label: 'Specialūs pasirodymai',
    description: 'Festivalio headliner, vienkartinis duetas, surprise show, kolaboracija',
    icon: '🎤',
    examples: [
      'Andrius Mamontovas surengė koncertą su Antis grupe',
      'Coldplay headlinins Glastonbury 2026',
      'Atlanta ir Antis surengė bendrą šou',
    ],
  },
  tour: {
    label: 'Turai / koncertų anonsai',
    description: 'Bilietai pardavime, papildomas koncertas, nauja data',
    icon: '🎫',
    examples: [
      'Marijonas Mikutavičius skelbia rudens turą',
      'Pridėta antra Vilniaus data',
      'Coldplay grįžta į Lietuvą 2026 m. rugsėjį',
    ],
  },
  career_step: {
    label: 'Karjeros žingsniai',
    description: 'Label signing, grupės susikūrimas/išsiskirstymas, naujas šoninis projektas, prodiuserio darbas',
    icon: '🚀',
    examples: [
      'Grupė G&G Sindikatas paskelbė apie pertrauką',
      'Jessica Shy pasirašė sutartį su Sony Music',
      'Žilvinas Žvagulis paleidžia naują projektą',
    ],
  },
} as const

export type NewsCategoryKey = keyof typeof NEWS_CATEGORIES

export const NEWS_CATEGORY_KEYS = Object.keys(NEWS_CATEGORIES) as NewsCategoryKey[]

/** Kategorijos, kurias AI gali grąžinti. 'none' reiškia "ne muzikinis / atmesti". */
export type AIRelevanceCategory = NewsCategoryKey | 'none'

export const ALLOWED_CATEGORIES: ReadonlySet<NewsCategoryKey> = new Set(NEWS_CATEGORY_KEYS)

/**
 * Atmetimo gairės AI prompt'ui. Šie atvejai turi grąžinti category='none'.
 */
export const REJECT_PATTERNS = [
  'Asmeninis gyvenimas (santykiai, šeima) — JEIGU tai NĖRA karjeros stop ar projektas',
  'Mada, lifestyle, soc.media drama',
  'Apdovanojimai be muzikos konteksto (tik šou, ne albumas)',
  'Topai / chartai / "geriausios dainos savaitės" (mes turim savo)',
  'Reklama, sponsored content, paid promotion',
  'Mirties pranešimai (rašome atskirai per editorial flow)',
  'Užuominos / spėliojimai be source confirmation (gandai, kad...)',
]

/**
 * Music-relevance batch prompt template'as (Haiku).
 * Įvertina N straipsnių vienu metu, taupant token'us.
 */
export function buildRelevancePrompt(items: Array<{ idx: number; title: string; summary?: string }>): string {
  return `Tu esi muzikos žinių klasifikatorius music.lt portale.

Įvertink kiekvieną straipsnio antraštę ir įžangą. Priimk TIK šias kategorijas:

${NEWS_CATEGORY_KEYS.map(k => `- "${k}": ${NEWS_CATEGORIES[k].description}`).join('\n')}

ATMESK (category="none"):
${REJECT_PATTERNS.map(p => `- ${p}`).join('\n')}

Be PIRMINIO muzikinio fakto neimk. Pvz., "dainininkas dalyvavo eismo įvykyje" — ATMESK, nebent susiję su tour cancel.

Straipsniai:
${items.map(it => `[${it.idx}] ${it.title}\n${it.summary ? `    ${it.summary.slice(0, 250)}` : ''}`).join('\n\n')}

Grąžink TIK JSON array, jokio kito teksto. Schema:
[{"idx": <number>, "category": "release"|"performance"|"tour"|"career_step"|"none", "confidence": <0..1>, "brief_why": "<10 žodžių LT>"}]`
}

/**
 * Light-rewrite system prompt (Sonnet) — naujienos sukūrimas iš full text'o.
 *
 * KRITINĖ INSTRUKCIJA: AI NEVERČIA pažodžiui. Sukuria savais žodžiais
 * 200-400 žodžių santrauką lietuviškai.
 */
export const LIGHT_REWRITE_SYSTEM = `Tu esi muzikos žurnalistas, rašantis music.lt portalui lietuvių auditorijai.

UŽDUOTIS: Iš pateikto šaltinio (gali būti EN/LT/RU) sukurk LIETUVIŠKĄ naujieną.

STILIUS:
- 200-400 žodžių, 3-4 pastraipos
- Faktai > emocijos. Be reklaminio tono ("nustebino fanus", "užkariavo scenas")
- Sausas, informatyvus žurnalistinis stilius
- Vartok lietuvišką muzikos terminologiją: "išleido", "pristatė", "pasirodė", "kolaboravo", NE anglicizmus
- NEVERSK pažodžiui — perpasakok esmę savais žodžiais

STRUKTŪRA:
1. Antraštė (60-80 simbolių): faktinė, ne clickbait
2. Įžanga (1 sakinys): kas įvyko + kodėl tai aktualu
3. Pagrindinė dalis (2-3 pastraipos): kas, kada, kur, su kuo, kontekstas
4. Jei tai naujas išleidimas — paminėk žanrą, kuo skiriasi nuo ankstesnių darbų

ŠALTINIO NUORODA pridedama automatiškai apačioje — neminėk jos body'je.

OUTPUT FORMATAS — TIK JSON, jokio kito teksto:
{
  "category": "release"|"performance"|"tour"|"career_step",
  "title": "string (60-80 chars)",
  "body_html": "string — HTML su <p> tag'ais kiekvienai pastraipai",
  "summary": "string — 2 sakiniai inbox preview'ui",
  "artists_mentioned": [{"name": "string", "confidence": 0..1}],
  "tracks_mentioned": [{"title": "string", "artist": "string"}],
  "confidence": 0..1
}

Jeigu straipsnis NETINKA jokiai kategorijai (gossip, asmeninis gyvenimas, reklama) — grąžink:
{ "category": "none", "title": "", "body_html": "", "summary": "", "artists_mentioned": [], "tracks_mentioned": [], "confidence": 0 }`
