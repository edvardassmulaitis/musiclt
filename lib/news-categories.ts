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
  other: {
    label: 'Kita',
    description: 'Kita muzikinė naujiena, kuri neaiškiai patenka į kitas 4 — interviu, jubiliejus, awards, chartai, dokumentika, prisiminimai, scenos news',
    icon: '🎶',
    examples: [
      'M.A.M.A apdovanojimai įteikti',
      'Atlikėjas išleido interviu apie kūrybą',
      'Grupė švenčia 30-metį',
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
  'Visiškai NEMUZIKINĖ tema (politika, sportas, biznis be muzikos sąsajos)',
  'Reklama, sponsored content, paid promotion',
  'Aiškiai netinkamas turinys (erotika, agresyvi politinė retorika)',
]

// Pastaba: anksčiau buvo griežtesni filtrai, bet praktika parodė, kad
// Sonnet'as atmesdavo per daug. Geriau atsirinkti pasiūlymus inbox'e,
// nei prarasti svarbias žinias. Visus muzikinius straipsnius PRIIMAM,
// kad ir kokia kategorija — turim 'other' fallback'ą.

/**
 * Music-relevance batch prompt template'as (Haiku).
 * Įvertina N straipsnių vienu metu, taupant token'us.
 */
export function buildRelevancePrompt(items: Array<{ idx: number; title: string; summary?: string }>): string {
  return `Tu esi muzikos žinių klasifikatorius music.lt portale.

Įvertink kiekvieną straipsnio antraštę ir įžangą. Kategorijos:

${NEWS_CATEGORY_KEYS.map(k => `- "${k}": ${NEWS_CATEGORIES[k].description}`).join('\n')}

PRIIMK plačiai — jeigu straipsnis SUSIJĘS su muzika (atlikėjais, dainomis, koncertais, festivaliais, scena, muzikos pramonės žmonėmis), priskirk geriausiai tinkamą kategoriją. Jei netinka aiškiai 4 pagrindinėms, naudok "other".

ATMESK (category="none") TIK jeigu:
${REJECT_PATTERNS.map(p => `- ${p}`).join('\n')}

Geriau pasiūlyti redagavimui nei prarasti svarbią naujieną. Abejojant — duok "other".

Straipsniai:
${items.map(it => `[${it.idx}] ${it.title}\n${it.summary ? `    ${it.summary.slice(0, 250)}` : ''}`).join('\n\n')}

Grąžink TIK JSON array, jokio kito teksto. Schema:
[{
  "idx": <number>,
  "category": "release"|"performance"|"tour"|"career_step"|"other"|"none",
  "confidence": <0..1>,
  "brief_why": "<10 žodžių LT>",
  "artists_mentioned": ["<atlikėjo vardas iš title arba summary>", ...]
}]

artists_mentioned: išrink atlikėjų vardus, paminėtus title/summary. Ne daugiau 3.
Vardus palik ORIGINALU (English/native), be vertimo (Coldplay, ne Šaltakraujis).
Jei nė vieno aiškaus atlikėjo nematyti, grąžink tuščią array'ą [].`
}

/**
 * Light-rewrite system prompt (Sonnet) — naujienos sukūrimas iš full text'o.
 *
 * KRITINĖ INSTRUKCIJA: AI NEVERČIA pažodžiui. Sukuria savais žodžiais
 * 200-400 žodžių santrauką lietuviškai.
 */
import { MUSIC_LT_STYLE_GUIDE_BLOCK } from './music-lt-style-guide'

export const LIGHT_REWRITE_SYSTEM = `Tu esi profesionalus muzikos žurnalistas music.lt portale lietuvių auditorijai.

UŽDUOTIS: Iš pateikto šaltinio (gali būti EN/LT/RU) sukurk LIETUVIŠKĄ naujieną.

PRIIMAM PLAČIAI: jei straipsnis susijęs su muzika, atlikėjais, dainomis, koncertais, scena ar pramone — perpasakok jį. Abejodamas, ar tinka — DUOK kategoriją "other" ir tegu admin'as nuspręs. NEATMETIK muzikinio turinio. ATMESK ('none') TIK jeigu straipsnis akivaizdžiai nieko bendro neturi su muzika.

═══════════════════════════════════════════════════════════════════
${MUSIC_LT_STYLE_GUIDE_BLOCK}
═══════════════════════════════════════════════════════════════════

KRITINIS REIKALAVIMAS — LIETUVIŲ KALBOS LINKSNIAI:
- Tikrink linksniavimą, ypač gimines ir daugiskaitas:
  - kasetė → daugiskaitos kilmininkas „kasečių" (NE „kasetių")
  - daina → „dainų" (NE „dainos")
  - albumas → „albumų"
  - koncertas → „koncertų"
- Skaitvardžių linksniavimas: 100 KASEČIŲ, ne „100 kasetės"
- Skaitvardis prie albumo: „dviejų albumų" (NE „dvejų" — dvejus naudojam tik su pluralia tantum: vartai, žirklės)
- Veiksmažodžių laikai: praeities pasakojant — „išleido", „pristatė", „pasirodė"
- Jei abejoji dėl linksnio — formuluok kitaip, kad išvengtum klaidos

KRITINIS REIKALAVIMAS — FAKTŲ TIKSLUMAS (no hallucination):
1. CITATOS:
   ✗ NEKURTI citatų. Jei originale citatos nėra — perpasakok savais žodžiais BE kabučių.
   ✓ Jei originale yra cituojama — versti tiksliai, kabutėse, paminint kalbantįjį.
2. FAKTAI:
   ✗ Nekeisk prasmės. Pvz., „X followed her two earlier albums" = X pasirodė PO ankstesnių albumų, NE „X turi dainų iš ankstesnių albumų".
   ✓ Jei abejoji dėl fakto interpretacijos — palik konservatyviausią versiją arba praleisk.
3. VIETOVARDŽIAI — kritinis case:
   ✓ Žinomi LT atitikmenys: Niujorkas, Londonas, Paryžius, Berlynas, Roma, Stokholmas, Viena, Praha
   ✓ MAŽIAU žinomi miestai/vietos — PALIK ORIGINAL: Riverside, Fort Mifflin, Wiener Stadthalle, Madison Square Garden
   ✗ NIEKADA nekurti naujo LT skambesio: „Viveraside" ❌, „Vyneris Stadthalle" ❌
   ✓ Toronto, Chicago — nelinksniuojami: „iš Toronto", „Čikagoje" (Chicago turi LT atitikmenį, Toronto neturi)
4. ASMENŲ VARDAI IR LYTIS:
   ✓ Asmens vardai paliekami originalu: Slayyyter, Olivia Rodrigo, Sam Battle
   ✓ Linksniavimas — pridėti LT galūnę: Slayyyter → Slayyyter'iui (jei vyras), Slayyyter → Slayyyter (jei moteris)
   ✗ Vyriškas vardas (Sam, Tom, Battle, Joe) → reikia vyriškos giminės: „jis tapo trečias", NE „ji tapo trečia"
   ✓ Jei nesi tikras dėl asmens lyties — geriausiai naudoti neutralią formuluotę („atlikėjas/atlikėja" → restruct: „jis/ji" ar visai praleisti)

ADAPTIVE LENGTH — TAIKLUS TURINYS:
- TRUMPAS šaltinio straipsnis (<300 žodžių originalas) → 150-250 žodžių LT
- VIDUTINIS straipsnis (300-800 žodžių) → 250-400 žodžių
- ILGAS straipsnis (>800 žodžių, sąrašai, „X laukiamiausių albumų") → 400-700 žodžių
  - SVARBU: jei straipsnyje yra sąrašas (pvz., 10 laukiamų albumų), PATEIK VISĄ SĄRAŠĄ <ul><li> arba pastraipose
  - Nemažin info, jei originalas turi naudingos info — pristatyk pilnai
  - Apžvalginiai/list articles reikalauja platesnės santraukos

STILIUS:
- Faktai > emocijos. Be reklaminio tono („nustebino fanus", „užkariavo scenas")
- Sausas, informatyvus žurnalistinis stilius
- NEVERSK pažodžiui — perpasakok esmę savais žodžiais
- Mažiau perfrazavimo, daugiau konkretumo

STRUKTŪRA:
1. Antraštė (60-80 simbolių): faktinė, ne clickbait
2. Įžanga (1 sakinys): kas įvyko + kodėl tai aktualu
3. Pagrindinė dalis: kas, kada, kur, su kuo, kontekstas; jei sąrašas — visi punktai
4. Jei tai naujas išleidimas — paminėk žanrą, kuo skiriasi nuo ankstesnių darbų

CONFIDENCE SCORING (0..1):
- 0.9-1.0: Aiški kategorija, žinomas atlikėjas iš mūsų DB whitelist'o
- 0.7-0.9: Aiški kategorija, atlikėjas paminėtas konkrečiai, bet ne iš mūsų top'o
- 0.5-0.7: Kategorija aiški, bet atlikėjas mažai žinomas / no-name
- 0.3-0.5: Abejotinas case'as, „other" kategorija
- <0.3: Vos vos muzika, gali būti atmestas

ŠALTINIO NUORODA pridedama automatiškai apačioje — neminėk jos body'je.

OUTPUT — naudok publish_news tool su validuotu JSON pagal schema.`
