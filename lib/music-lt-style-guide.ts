/**
 * Music.lt LT žurnalistikos žodynas + voice rules + post-processing fixes.
 *
 * Naudojamas:
 *  - news-categories.ts LIGHT_REWRITE_SYSTEM prompt'e (su Anthropic
 *    prompt caching, kad šis tekstas tampa beveik nemokamas po pirmo
 *    naudojimo per 5 min ciklą)
 *  - ai-normalize.ts post-processing pass'e (regex deterministic fixes
 *    po Haiku output'o, eliminuoja ZERO-cost'u žinomus literalumus)
 *
 * Plečiamas iteraciniai: kiekvieną kartą pamatai prastą Haiku rewrite'ą,
 * pridedi į MUSIC_LT_GLOSSARY arba REGEX_FIXES.
 */

// ─────────────────────────────────────────────────────────────────
// Glossary — privaloma EN→LT terminologija
// ─────────────────────────────────────────────────────────────────

export const MUSIC_LT_GLOSSARY = `MUZIKOS TERMINOLOGIJA (PRIVALOMA — NESINAUDOK SINONIMŲ):

Albumai ir išleidimai:
  • live album → koncertinis albumas (NE "tiesioginis albumas")
  • studio album → studijinis albumas
  • EP → mini albumas (arba palik "EP")
  • single → singlas (NE "single")
  • B-side → b-side
  • mixtape → miksteipas
  • compilation → kompiliacija / rinkinys
  • released / dropped / unveiled → išleido / pristatė / paskelbė (NE "atleido")
  • premiered → premjera įvyko / pristatė
  • surprise album → netikėtas / staigmenos albumas
  • debut album → debiutinis albumas
  • sophomore album → antrasis albumas
  • track listing / tracklist → dainų sąrašas
  • bonus track → premija / papildoma daina

Atlikėjai ir bendradarbiavimai:
  • featuring (feat.) X → su X / kartu su X
  • frontman / lead singer → grupės lyderis / vokalistas
  • headliner → pagrindinis atlikėjas
  • support act / opening act → palaikymo grupė / pradinis pasirodymas
  • collaboration → kolaboracija / bendras darbas
  • bandmates → grupės nariai
  • lineup change → sudėties pasikeitimas
  • split / break up → iširo / pasitraukė
  • reunion → susijungimas / sugrįžimas
  • comeback → sugrįžimas (NE "sugrįžimas atgal")
  • on hiatus → kūrybinėje pertraukoje
  • side project → šalutinis projektas

Pasirodymai ir turai:
  • tour → turas (NE "tūras")
  • tour leg → turo etapas
  • headlining tour → pagrindinis turas
  • world tour → pasaulinis turas
  • concert / gig / show → koncertas (NE "šou" jei tai koncertas; "show" tinka jei specifiškai TV/radio entertainment)
  • halftime show → pertraukos šou / pertraukos pasirodymas (NE "puslaikio")
  • sold out → bilietai išparduoti
  • set / setlist → repertuaras / dainų sąrašas
  • encore → bisas
  • mosh pit → minia / šokių zona
  • festival headliner → festivalio pagrindinis atlikėjas
  • stage → scena (NE "estrada", nebent kontekstas senas LT)

Muzikos verslas:
  • record label → įrašų leidykla
  • signed to → pasirašė sutartį su
  • streaming → klausymai (Spotify/Apple Music kontekste)
  • streams → klausymai (NE "srautai")
  • chart → topas (NE "čartas")
  • chart-topping → topo viršuje
  • hit → hitas
  • smash hit / megahit → mega hitas
  • billion / million streams → milijardas / milijonas klausymų
  • Grammy → "Grammy" apdovanojimas
  • RIAA certified → RIAA sertifikuotas
  • gold / platinum / diamond → auksinis / platininis / deimantinis (statusas)

Žanrai ir muzikinis turinys:
  • hip-hop → hiphopas / hip-hop
  • indie → indie (palik)
  • alt-rock → alternatyvusis rokas
  • lyrics → tekstas / dainos žodžiai (NE "lirika")
  • beat / production → ritmas / prodiusavimas
  • producer → prodiuseris
  • feature artist → svečias atlikėjas
  • cover → perdarymas / cover'is
  • remix → remiksas
  • teaser → anonsas
  • snippet → trumpas fragmentas

Vaizdo ir audio:
  • music video → vaizdo klipas (NE "music video", "muzikinis video")
  • lyric video → tekstinis klipas
  • behind the scenes → užkulisiai
  • visualizer → vizualizatorius (arba "klipas su grafika")

Eurovizija (specifinis kontekstas):
  • Eurovision → "Eurovizija" (su lietuviška kabute)
  • semi-final / final → pusfinalis / finalas (NE "puslaikis")
  • points / score → balai / rezultatas (NE "taškai" — tai matematika, ne muzika)
  • jury / televoting → komisija / žiūrovų balsavimas
  • Eurovision entry → Eurovizijos atstovas
  • edition (70th edition) → leidimas (NE "edicija" — calque iš anglų/italų)
  • last place → paskutinė vieta
  • semi-final qualification → patekimas į pusfinalį

Vakarinės/TV laidos (papildymai):
  • late-night show → vakarinė laida
  • talk show → pokalbių laida
  • late-night TV debut → debiutas vakarinėje TV laidoje (NE "laidos žygioje" ❌)
  • appearance on the show → pasirodymas laidoje (NE "žygyje")
  • show host → laidos vedėjas
  • aired on → buvo transliuojama per

Vietovardžiai (papildymai):
  • Žinomi LT atitikmenys, vartoti: Niujorkas, Londonas, Paryžius, Berlynas, Roma, Stokholmas, Viena, Praha, Čikaga
  • NEŽINOMI miestai/venue'ai — PALIK ORIGINAL: Riverside, Fort Mifflin, Wiener Stadthalle, Madison Square Garden
  • Toronto, Hamilton, Houston, Phoenix, Las Vegas — nelinksniuojami, palik anglišką formą + linksnis-prielinksnis
  • Venue pavadinimai — kabutėse: „Wiener Stadthalle", „Madison Square Garden", „O2 Arena"

Merchandise / commerce:
  • merch / merchandise → prekės arba marškinėliai (kontekstinis), NE "merchandisas"
  • drop / launch → pristatė / pradėjo pardavinėti
  • sell out → išparduoti (NE "iš viso išparduoti")
  • limited edition → ribotas leidimas
`

// ─────────────────────────────────────────────────────────────────
// Voice — kaip rašyti, ne ką
// ─────────────────────────────────────────────────────────────────

export const MUSIC_LT_VOICE_RULES = `STILIAUS PRINCIPAI:

1. AKTYVI forma, ne pasyvi:
   ✗ "Albumas buvo išleistas atlikėjo"
   ✓ "Atlikėjas išleido albumą"

2. Trumpai. Vengti redundancijos:
   ✗ "Atlikėjas X, kuris yra žinomas dėl..."
   ✓ "X — žinomas dėl..."  arba  "X žinomas dėl..."

3. Konkretūs faktai, ne emocijos:
   ✗ "Fanus apstulbino šokiruojantis ėjimas"
   ✓ "Fanams netikėtai pristatė"  arba paprastai  "Pristatė"

4. Be reklaminio tono:
   ✗ "užkariavo scenas", "fenomenalus pasirodymas", "neabejotinai"
   ✓ Faktai: kas/kada/kur/su kuo

5. Vengti anglų konstrukcijų vertimo žodis-į-žodį:
   ✗ "Tai yra didelis žingsnis"      (literal "this is")
   ✓ "Tai didelis žingsnis"           (LT natūraliai praleidžia "yra")
   ✗ "Joje yra dešimt dainų"
   ✓ "Joje dešimt dainų"

6. Skaitvardžiai:
   • Pirmuoju → pirmas (vyrišk.) / pirmoji → pirma (moter.) jei tinka kontekstui
   • Skaičiai >10 — skaičiumi ("15 dainų"), ne žodžiu

7. Tikrinti linksniavimą prie skaičių:
   ✗ "100 kasetės"  ✓ "100 kasečių"
   ✗ "10 dainos"   ✓ "10 dainų"
   ✗ "5 albumas"   ✓ "5 albumai" arba "5-as albumas"

8. Lietuviškos kabutės „..."  ne anglų "..."

9. Brūkšnys: naudok paprastą „-" (ne „—" em dash ir ne „–" en dash). Ilgas
   brūkšnys sukuria dirbtinį „AI" jausmą.
   ✗ "Brandon Flowers — grupės lyderis"
   ✓ "Brandon Flowers - grupės lyderis"

10. Vengtini kalkiniai/nenatūralūs žodžiai (rink natūralų LT atitikmenį):
   ✗ "anonsas"  → ✓ "pristatymas" / "naujiena" / konkrečiai kas pristatoma
     (pvz. "pristatė antrąjį singlą", ne "paskelbė antrąjį anonsą")
   ✗ "relizas"  → ✓ "išleidimas"
   ✗ "dropino / dropinti"  → ✓ "išleido / pristatė"
   ✗ "tyzeris"  → ✓ "trumpas anonsinis vaizdas" / "užuomina"
   ✗ "feat'as / featas"  → ✓ "su" / "kartu su"
   ✗ "trekas"  → ✓ "daina" / "kūrinys"
`

// ─────────────────────────────────────────────────────────────────
// Few-shot examples — geriausias signalas modelis
// ─────────────────────────────────────────────────────────────────

export const MUSIC_LT_FEW_SHOTS = `PAVYZDŽIAI — BLOGAI vs GERAI:

Original: "Lady Gaga released live album 'Mayhem Requiem' via Apple Music."
✗ BLOGAI:  "Lady Gaga per Apple Music išleido tiesioginį albumą „Mayhem Requiem"."
✓ GERAI:   "Lady Gaga „Apple Music" platformoje pristatė koncertinį albumą „Mayhem Requiem"."

Original: "Shakira performed at Super Bowl halftime show alongside Madonna."
✗ BLOGAI:  "Shakira pasirodė Super Bowl puslaikio šou kartu su Madonna."
✓ GERAI:   "Shakira ir Madonna pasirodė „Super Bowl" pertraukos šou."

Original: "The Strokes dropped their new single 'Falling Out of Love' on Friday."
✗ BLOGAI:  "The Strokes atleido savo naują single „Falling Out of Love" penktadienį."
✓ GERAI:   "Penktadienį „The Strokes" pristatė naują singlą „Falling Out of Love"."

Original: "Drake's three new albums total 60+ tracks across 'Iceman', 'Habibti' and 'Maid in Mumbai'."
✗ BLOGAI:  "Drake trys naujieji albumai iš viso turi virš 60 takelių per „Iceman", „Habibti" ir „Maid in Mumbai"."
✓ GERAI:   "Drake trijuose naujuose albumuose „Iceman", „Habibti" ir „Maid in Mumbai" — daugiau nei 60 dainų."
`

// ─────────────────────────────────────────────────────────────────
// Regex post-processing — DETERMINISTIC nemokamas fix'as
// ─────────────────────────────────────────────────────────────────
//
// Po Haiku output'o paleidžiam fast regex pakeitimus. Naudinga:
//  - Kai modelis vis tiek "užmiršta" glossary
//  - 100% reproducible, nereikia naujo AI call
//  - Galim plėsti iteratyvai pagal real-world failures
//
// FORMAT'as: [regex, replacement]. Naudoja `String.replace(regex, replacement)`.
//
// SVARBU: replacement'ai turi būti SAFE — nesulaužytų LT, jei kontekstas
// turi panašų pattern'ą. Pvz. NE "tiesiog" → "koncert" — pataisom tik
// jei seka "albumas" / "albumą" / "albume".

export const MUSIC_LT_REGEX_FIXES: Array<[RegExp, string]> = [
  // tiesioginis/tiesioginį/tiesioginio albumas → koncertinis (visi linksniai)
  [/\btiesiogini([sųio])\s+album([oąue]\w*)/gi, 'koncertini$1 album$2'],
  // puslaikis → pertraukos (futbolas vs music context)
  [/\bpuslaikio\s+(šou|pasirodym\w+)/gi, 'pertraukos $1'],
  // single → singlas (nesumaišyti su single-source pan.)
  [/\b(naujas|savo|jo|jos|šis|tas)\s+single\b/gi, '$1 singlas'],
  // atleisti (release) → išleisti (apsisaugant nuo "atleido iš darbo")
  [/\batleido\s+(savo\s+)?(naują|nauj[oąu]\w*|debiut\w*|antr\w*)\s+(album|singl|sing|EP|mini|klip)/gi, 'išleido $1$2 $3'],
  // music video → vaizdo klipas
  [/\bmusic video\b/gi, 'vaizdo klipas'],
  [/\bmuzikinis vide[oą]/gi, 'vaizdo klipas'],
  // čartas → topas
  [/\bčart([aąouš]\w*)/gi, 'top$1'],
  // hit'inis → topo
  [/\bhit'in([is]\w*)/gi, 'topin$1'],
  // tūras → turas
  [/\btūr([aąouš]\w*)/gi, 'tur$1'],
  // srautai (streams) → klausymai
  [/\b(\d+|milijon|milijard)\w*\s+sraut([aąouš]\w*)/gi, '$1 klausym$2'],
  // Em/en brūkšnys → paprastas brūkšnys. AI mėgsta „—" (em dash) — jis sukuria
  // dirbtinį „AI" jausmą, kurio nenorim. Keičiam tik patį simbolį, tarpai lieka
  // kaip buvo (datų intervalai „2010–2020" → „2010-2020" lieka tankūs).
  [/[—–]/g, '-'],
  // bool kabučių normalizacija (ne literal " arba ', o lietuviškos „...")
  // Šitai paliekam AI'ui — regex'as gali sulaužyti HTML
]

/**
 * Aplikuoja deterministic LT fixes ant AI sugeneruoto teksto.
 * Naudojama TIK ant title + body_html — NE ant raw raw_response.
 */
export function applyMusicLtFixes(text: string): string {
  if (!text) return text
  let result = text
  for (const [pattern, replacement] of MUSIC_LT_REGEX_FIXES) {
    result = result.replace(pattern, replacement)
  }
  return result
}

// ─────────────────────────────────────────────────────────────────
// Combined block to inject į system prompt'ą
// ─────────────────────────────────────────────────────────────────

export const MUSIC_LT_STYLE_GUIDE_BLOCK =
  MUSIC_LT_GLOSSARY + '\n\n' +
  MUSIC_LT_VOICE_RULES + '\n\n' +
  MUSIC_LT_FEW_SHOTS
