# Muzikos atradimo automatizavimas + Greito pridėjimo patobulinimai — planas

**Data:** 2026-07-16
**Statusas:** Planavimo etapas — sprendimams reikia Edvardo patvirtinimo prieš codavimą.
**Analizuota:** `edvardassmulaitis/musiclt` main (commit `ea9d4ae8`) — `lib/quick-add.ts`,
`lib/scout-feeds.ts`, `lib/entity-matcher.ts`, `app/api/internal/news-scout/run`,
`EXTERNAL_CHARTS_PLAN.md`, `WIKI_BATCH_HANDOFF.md`, `supabase/migrations/20260514a_news_candidates.sql`.

---

## 0. Trumpai — ką jau turime, ko trūksta

Gera žinia: **infrastruktūra automatizavimui jau yra**, tik dar nepritaikyta muzikos
atradimui. Trys pakartotinai panaudojami blokai:

1. **Scout pipeline** (`scout_sources` → `scout_seen_urls` dedupe → AI classify →
   `entity-matcher.matchArtists` → candidate queue → `/admin/inbox` approval). Šiuo
   metu naudojamas naujienoms (`news_candidates`) ir renginiams (`event_candidates`).
   `lib/scout-feeds.ts` `fetchFeed()` yra **universalus RSS/Atom parseris** — jis jau
   moka skaityti bet kokį Atom feed'ą, **įskaitant YouTube kanalo feed'us**
   (`youtube.com/feeds/videos.xml?channel_id=...`) be jokių papildymų.
2. **Hibridinis resolver modelis** (`EXTERNAL_CHARTS_PLAN.md`) — RAW + RESOLVED laukai,
   `resolve_state` (`matched`/`created`/`ambiguous`/`text_only`), scope-based auto-create
   taisyklė (LT → auto-create, pasaulis → tik light match, be katalogo teršimo). Tai
   tiksliai atsako į tavo „100% clear vs unclear → approval" klausimą — modelis jau
   išspręstas, reikia tik pritaikyti naujam šaltiniui.
3. **Quick-add branduolys** (`lib/quick-add.ts`) — `previewTrack`/`commitTrack`,
   `previewAlbum`/`commitAlbum`, `resolveArtist`, Wiki tracklist/discography parseriai
   (`lib/wiki-parser.ts`). Automatizacija NETURI perrašyti šios logikos — turi ją
   **kviesti programiškai** (taip, kaip external charts resolver jau kviečia
   `commitChartTrack`).

Papildomai svarbu: `artists.youtube_channel_id` stulpelis **jau egzistuoja**
(`lib/supabase-artists.ts`) — dalis atlikėjų jau turi savo kanalą susietą kataloge.
Tai reiškia, kad YouTube stebėjimui iš dalies net nereikia naujo „channel discovery"
darbo pirmam etapui.

Keturi konkretūs darbai žemiau (A–D), pagal tavo žinutę:

- **A.** YouTube naujų dainų automatinis atradimas (be YT Data API kvotos, kur įmanoma)
- **B.** Wikipedia „List of 2026 albums" + panašių sąrašų stebėjimas
- **C.** Greito pridėjimo papildymas: daina → patikrinti ar yra/bus albumas su tracklist
- **D.** Datos apsaugos taisyklė (re-release video neturi „pajauninti" dainos datos)

---

## A. YouTube naujų įrašų automatinis atradimas

### A.1 — Kanalo stebėjimas per Atom feed (be kvotos, be API rakto)

Kiekvienas YouTube kanalas turi viešą Atom feed'ą:
`https://www.youtube.com/feeds/videos.xml?channel_id=UC...` — grąžina **15 naujausių
video**, be autentifikacijos, be Data API kvotos. `lib/scout-feeds.ts fetchFeed()` jau
parseryja Atom formatą (žr. `parseAtom` šalia `parseRss`) — **tinka be pakeitimų**.

**Pipeline (analogiškas `news-scout/run`):**

1. `scout_sources` papildomas nauja kategorija `'yt_artist_channel'` (dabar CHECK
   leidžia tik `news_lt/news_intl/tickets/artist_social` — reikės migracijos).
   Kiekvienam atlikėjui su `youtube_channel_id IS NOT NULL` — įrašas su
   `feed_url = https://www.youtube.com/feeds/videos.xml?channel_id={id}`,
   `parser_key = 'yt:{artist_id}'`.
2. Naujas endpoint'as `app/api/internal/yt-release-scout/run/route.ts` (Bearer
   `INTERNAL_CRON_TOKEN`, kaip `news-scout`):
   - fetch feed → filtruoti pagal `scout_seen_urls` (video URL kaip raktas — VEIKS
     tiesiogiai, `canonicalUrlHash` jau egzistuoja).
   - Kiekvienam naujam video: kadangi **kanalas jau žinomas → žinomas atlikėjas**
     (`scout_sources.parser_key` → `artist_id`), NEREIKIA AI klasifikacijos vardui
     atpažinti — tai svarbiausias skirtumas nuo naujienų scout'o. Vietoj to:
     `parseYtTitle(videoTitle, channelName)` (jau yra `lib/quick-add.ts`) duoda
     `{artist, title}`; kadangi kanalas patvirtina atlikėją, `artist` segmentą
     ignoruojam ir naudojam tiesiai `artist_id` iš `scout_sources` (apsaugo nuo
     title parse klaidų su kolaboracijom, pvz. „X & Y - Song" kanale, kuris yra X).
3. **Pasitikėjimo („100% clear") taisyklė auto-commit'ui:**
   - Kanalas 1:1 susietas su MŪSŲ atlikėju (`artists.youtube_channel_id` match) **IR**
     video title'as NĖRA akivaizdžiai ne-daina (live stream anonsas, vlog, „Q&A",
     „behind the scenes" — paprastas keyword blocklist'as: `live|q&a|interview|vlog|
     behind the scenes|trailer|teaser|shorts`) **IR** trukmė > 45s (filtruoja shorts/
     anonsus) → **auto-commit** tiesiai per `commitTrack(url, origin, { artist_id })`
     (esamas funkcionalumas, tik kviečiamas programiškai, ne per admin UI).
   - Kitaip (title dviprasmiškas, trukmė įtartinai trumpa/ilga, keyword blocklist
     sutapo, arba tai coverio/remix/live versija to paties pavadinimo) →
     `pending_review` — įrašas į naują `music_candidates` lentelę (žr. §E), rodomas
     admin peržiūros bloke su **preview'u iš `previewTrack()`** (tas pats preview,
     kurį jau matai „Greitame pridėjime" — vienas mygtukas „Pridėti" = `commitTrack`
     su tais pačiais overrides, kuriuos preview siūlo).
4. **Rezultatas:** oficialūs atlikėjų kanalai giedami automatiškai, be admin
   įsikišimo, IŠSKYRUS dviprasmiškus atvejus — tiksliai tavo prašyta „100% clear —
   auto; unclear — approval".

### A.2 — Kanalų atradimas atlikėjams be `youtube_channel_id`

Dauguma atlikėjų šio stulpelio dar neturi. Du variantai, siūlau abu (paskesniu etapu):

- **Backfill batch job** — per `lib/yt-innertube.ts` (channel search by artist name),
  su heuristika: pirmenybė kanalams su „ - Topic" (YouTube auto-generuoti, 100%
  patikimi, bet be video, tik audio — todėl geriau **VEVO/oficialus kanalas**, jei
  yra, nes ten pilni video su embeddable=true) arba verified/official badge. Kai
  kandidatas vienareikšmis (tik vienas kanalas su panašiu pavadinimu + subscriberiai
  > threshold) → auto-priskiria `youtube_channel_id`. Kai keli kandidatai (dažnas
  vardas, pvz. „Roma", „Viktorija") → **į admin review** (naujas laukelis atlikėjo
  admin puslapyje: „Galimi YouTube kanalai" su pasirinkimu), NE auto-assign.
- **Prioritetas** — pradėti nuo atlikėjų su aukštu `score`/`score_trending`
  (žr. `SCORE_DATA_ROADMAP.md`), nes jiems automatizacija duoda daugiausiai naujų
  dainų greičiausiai.

### A.3 — Kodėl NE YouTube Data API `search.list` kaip pirminis šaltinis

`search.list` kainuoja 100 kvotos vienetų už kvietimą (dienos limitas dažniausiai
10,000 = 100 paieškų/dieną). Su ~šimtais stebimų atlikėjų tai netelpa kasdien. Atom
feed per kanalą yra **nemokamas ir be limito** — todėl jis pirminis šaltinis. Data API
(`getVideoDetails`, jau naudojamas) lieka tik **video metaduomenims** (views,
embeddable, upload data) po to, kai video jau rastas per feed'ą — tai jau esama
`fetchTrackContext()` logika, keitimų nereikia.

---

## B. Wikipedia „List of 2026 albums" + panašių sąrašų stebėjimas

**ĮGYVENDINTA (2026-07-16).** Žemiau B.1–B.4 — originalus planas prieš codavimą
(liko beveik nepakitęs, realizacija jį atitinka). B.5 aprašo, kas realiai
sukoduota + vieną sąmoningą nukrypimą nuo B.2 dedupe schemos.

`https://en.wikipedia.org/wiki/List_of_2026_albums` yra HTML lentelės (mėnuo →
eilutės: data, atlikėjas(-ai), albumas, žanras, leidykla), dažnai su wikilink'u į
paties albumo straipsnį. Panašūs puslapiai: `List_of_2026_singles` (jei egzistuoja),
per-šalį/žanrą sąrašai — bet siūlau **pradėti tik nuo pagrindinio albumų sąrašo**,
išplėsti vėliau.

### B.1 — Kodėl šitam reikia atskiro parserio (ne `fetchFeed`)

Tai NĖRA feed — statinis wiki puslapis, atnaujinamas ad-hoc per visus metus (ne
naujos URL, tas pats puslapis pildomas naujomis eilutėmis). Reikia naujo parserio
(panašiai kaip planuota AGATA chart parseriui `EXTERNAL_CHARTS_PLAN.md` §4) —
`lib/wiki-album-list.ts`:

- `fetch wikitext` (jau turim `fetchWikitext()` iš `lib/quick-add.ts` — reikės
  eksportuoti arba nukelti į bendrą `lib/wiki-fetch.ts` helper'į, kad neduplikuotume).
- Parse: kiekvieno mėnesio wikitable eilutė → `{ date, artist_raw, album_title,
  album_wiki_link | null, genre_raw, label_raw }`. Regex/wikitext parsing panašus į
  esamą `lib/wiki-parser.ts` stilių (jau turi tracklist/discography parserius —
  pridėti naują funkciją tame pačiame faile, ne naują biblioteką).

### B.2 — Dedupe be URL

Kadangi nėra unikalaus URL per eilutę, fingerprint'as: `sha1(normalize(artist) + '|'
+ normalize(album_title) + '|' + date)` — analogiškai `titleFingerprint()`
(`lib/url-extract.ts`), tik pritaikyta album eilutei. Nauja lentelė
`wiki_album_list_seen` (arba perpanaudoti `scout_seen_urls`, `url_hash` laukas =
šis fingerprint'as, `source_id` = specialus `scout_sources` įrašas be `feed_url`,
tik `list_url`).

### B.3 — Auto vs. review taisyklė (tavo „100% clear" logika)

Mirror'inam `EXTERNAL_CHARTS_PLAN.md` LT/world principą, tik čia raktas ne šalis, o
**ar atlikėjas jau yra kataloge**:

- **Atlikėjas RASTAS kataloge** (tikslus arba labai aukšto pg_trgm score match per
  `matchArtists`) **IR** eilutė turi `album_wiki_link` (nuoroda į paties albumo
  straipsnį, ne tik į atlikėjo straipsnį) → **auto-commit** per esamą
  `commitAlbum(albumWikiUrl, origin, { artist_id })` — tas pats kelias kaip rankinis
  Wiki albumo pridėjimas, tik trigerinamas automatiškai.
- **Atlikėjas rastas, bet NĖRA album_wiki_link** (dažnas atvejis pirmose savaitėse po
  paskelbimo — Wikipedia įrašo eilutę į sąrašą anksčiau nei sukuria atskirą albumo
  straipsnį) → **review queue**: rodom „{Atlikėjas} — {Albumo pavadinimas} ({data})"
  be tracklist'o, su nuoroda „patikrinti rankiniu būdu vėliau" arba pažymėti
  „laukti" (grįš į sąrašą, kol album_wiki_link atsiras — rescan kas savaitę pagal
  esamą fingerprint'ą aptinka pasikeitimą).
- **Atlikėjas NErastas kataloge** → **NEsukuriam nieko** (mirror'ina esamą sprendimą
  `EXTERNAL_CHARTS_PLAN.md` §3: „Nekuriam track'ų [pasaulio scope'e] — kitaip
  katalogą užterštų vienadienės dainos"). Šitas albumas tiesiog nefiksuojamas —
  IŠSKYRUS jei nori praplėsti vėliau su papildoma taisykle (pvz. albumas turi
  Wikipedia infobox su ≥N kalbų versijų = pakankamai žinomas, kad vertėtų sukurti
  naują atlikėją). Rekomenduoju **NE** pradžioje — per didelė rizika prišiukšlinti
  katalogą tūkstančiais nežinomų pasaulio atlikėjų.

### B.4 — Cadence ir vykdymo būdas

`EXTERNAL_CHARTS_PLAN.md` §9 jau turi svarbią pamoką: **Cowork scheduled task** kaip
periodinio darbo variklis **dingo** (~07-03), nes gyveno tik task'o aplinkoje, ne
repo'e — dabar externalcharts naudoja GitHub Actions cron + repo script'ą. **Šitam
naujam darbui iškart darykime tą patį** — `/api/internal/wiki-album-scout/run`
endpoint'as (Bearer token, kaip `news-scout`), trigerinamas GitHub Actions cron'u
(pvz. kartą per parą), NE Cowork scheduled task. Tai nuoseklu su jau padaryta
korekcija ir išvengia to paties bug'o pasikartojimo.

### B.5 — Kas realiai sukoduota + nukrypimas nuo dedupe schemos

**Nauji failai:**

- `lib/wiki-fetch.ts` — `fetchWikitext(title)` iškeltas iš `lib/quick-add.ts`
  (buvo module-private), kad naudotų ir naujas scout'as, be dubliavimo.
  `quick-add.ts` dabar importuoja iš čia (senas lokalus apibrėžimas ištrintas).
- `lib/wiki-album-list.ts` — `parseAlbumListPage(wikitext, year)`. Wikitext
  state-machine parseris: `=== MonthName ===` sekcijos → `{| ... |}` lentelė →
  eilutės padalintos per `|-`, kiekvienam blokui pirma linija su `!
  scope="row"` = naujos dienos header'is (rowspan grupė), likusios (be naujo
  header'io) paveldi paskutinę datą. **Ignoruoja „Unscheduled and TBA"
  sekciją** (be datos stulpelio, albumai dažnai `{{TBA}}` — per žema signalo
  kokybė automatikai). Patestuota GYVAI su tikru puslapiu prieš diegimą
  (`https://en.wikipedia.org/wiki/List_of_2026_albums`, 2026-07-16): 3059
  eilutės, 938 su album_wiki_link, 0 dublikuotų fingerprint'ų, 0 likusių
  template/wikilink fragmentų po valymo.
  - **Rastas ir pataisytas bug'as testavimo metu:** pirminė cell-parsing
    implementacija naudojo `lastIndexOf('|')`, kad nupjautų wikitable
    attribute'us nuo `!`-header'io turinio — bet TA PATI funkcija klaidingai
    buvo taikoma ir paprastiems `|`-duomenų langeliams, kur pipe'as dažnai
    priklauso PAČIAM turiniui (piped wikilink `[[Alter Bridge (album)|Alter
    Bridge]]`). Rezultatas: albumo pavadinimai su piped disambiguation
    (`(album)`, `(EP)`, ...) buvo nupjaunami iki tuščio/klaidingo
    `album_wiki_link` (506 vs teisingi 938 su nuoroda po pataisymo). Pataisyta
    — atskirtos dvi funkcijos: `dayHeaderContent()` (lastIndexOf, TIK dienos
    header'iui) ir `dataCellContent()` (paprastas pirmo `|` nuėmimas, duomenų
    cell'ams). Taip pat rastas antras panašus bug'as: `cleanArtistName()`
    kviečiamas PRIEŠ `cleanWikiText()` palikdavo stray `"X|X"` piped linkams be
    role-disambiguation (pvz. `Petra (band)|Petra` → cleanArtistName pirma
    nuima `(band)`, TADA brackets — bet pipe'as lieka). Sutvarkyta apsukant
    tvarką: `cleanArtistName(cleanWikiText(raw))`.
  - `albumListFingerprint(artist, album, year, month, day)` — sha1 dedupe
    raktui. Diacritic-fold per codePoint loop'ą (NE `\u` regex escape — tas
    pats pitfall'as kaip `lib/apple-music.ts foldCompare`, žr. C.5 klaidų
    sąrašą; tool-chain kartais `\uXXXX` konvertuoja į literal Unicode simbolius
    parametruose).
- `app/api/internal/wiki-album-scout/run/route.ts` — Bearer auth, WHERE
  `scout_sources.category='wiki_list'`, `fetchWikitext` → `parseAlbumListPage`
  → per eilutę B.3 taisyklė (žr. žemiau dedupe pastabą).
- `app/api/admin/wiki-album-candidates/{route.ts,[id]/route.ts}` — GET sąrašas
  + PATCH `{action:'reject'}` (terminalu) / `{action:'approve', album_wiki_link?}`
  (admin gali RANKA paduoti nuorodą, jei pats ją rado anksčiau nei sekantis
  scan; be parametro naudoja jau saugomą, jei yra).
- `app/admin/inbox/albums/page.tsx` + `components/InboxTabs.tsx` (trečias tab'as
  „💿 Albumai").
- `.github/workflows/wiki-album-scout.yml` — 1x/parą (06:00 UTC), + manual
  `workflow_dispatch` su `dry_run` input'u.
- Migracija `supabase/migrations/20260716b_wiki_album_candidates.sql` — nauja
  `wiki_album_candidates` lentelė + `scout_sources.category` CHECK papildytas
  `'wiki_list'` reikšme + seed'as pagrindiniam 2026 sąrašo puslapiui.
  **⚠️ ŠITĄ MIGRACIJĄ REIKIA PALEISTI RANKA** (sandbox'e nėra `DATABASE_URL` —
  scout endpoint'as gaus 500/404 klaidas, kol lentelė neegzistuoja realioje
  DB'je). Paleisti arba per Supabase dashboard'o SQL Editor'ių (nukopijuoti
  failo turinį), arba `node scripts/run-migration.mjs supabase/migrations/20260716b_wiki_album_candidates.sql`
  su `.env.local` turinčiu `DATABASE_URL`.

**Sąmoningas nukrypimas nuo B.2 (dedupe per `scout_seen_urls`):** originalus
planas siūlė vieną atmintį (`scout_seen_urls`, fingerprint=`url_hash`) visoms
eilutėms — bet tai reikštų, kad "atlikėjas rastas, bet be album_wiki_link"
eilutė, patekusi į "seen", niekad nebūtų pertikrinta, kai straipsnis vėliau
atsiranda. Vietoj to realizacija naudoja DVI atskiro tipo atminties:

- `scout_seen_urls` — TIK kai atlikėjas apskritai nerastas kataloge
  (`filter_reason='no_artist_match'`) — tikrai permanent, B.3 taisyklė "nesukuriam
  nieko" nesikeičia niekad ateityje šiai eilutei.
- `wiki_album_candidates` (nauja lentelė, `fingerprint` UNIQUE) — kai atlikėjas
  RASTAS: `status='pending'`, jei dar be nuorodos (review queue); `status='approved'`
  iškart, jei nuoroda jau buvo pirmo scan'o metu (auto-commit per `commitAlbum()`).
  Kiekvienas sekantis scan'as PALYGINA naują `album_wiki_link` su saugomu —
  jei atsirado (buvo null, dabar yra) ir kandidatas vis dar `pending`, auto-commit'ina
  TADA (ne palieka amžinai review queue'e). Terminaliniai statusai
  (`approved`/`rejected`/`duplicate`/`error`) niekad nebeliečiami.

Cap'ai per paleidimą (Vercel Hobby ~60s wall-clock riba, ta pati pastaba kaip
`events-scout.ts`): `MAX_FRESH_PER_RUN=200` (kiek NIEKAD-nematytų eilučių
tikrinam `matchArtists`), `MAX_AUTO_COMMITS_PER_RUN=8` (kiek pilnų
`commitAlbum()` — išorinis Wikipedia+cover fetch, lėčiau). Backlog'as (~3059
eilutės pirmam scan'ui) natūraliai "sudegs" per kelis dienos/manual paleidimus,
nes jau apdorotos eilutės (bet kurioje atmintyje) neskaičiuojamos į fresh cap'ą.

---

## C. Greito pridėjimo papildymas — daina → patikrinti albumą

**ĮGYVENDINTA (2026-07-16).** Pradinis planas (žemiau paliktas C.0 istorijai) siūlė
Wikipedia discography kaip šaltinį. Prieš codavimą Edvardas paprašė patestuoti su
realiu atveju (Carly Rae Jepsen „On Wires") — testas parodė, kad Wikipedia čia
BLOGIAUSIAS iš keturių patikrintų šaltinių: albumo puslapis jau egzistavo, bet
`{{Track listing}}` šablone užpildyti tik 2 iš 12 laukų (likę — tušti). Palyginimui
tuo pačiu metu:

| Šaltinis | Tracklist | Cover | Data | Pastaba |
|---|---|---|---|---|
| **MusicBrainz** | ✅ pilnas, 25 tikri pavadinimai | ✅ (Cover Art Archive) | ✅ | Laimėtojas |
| **Apple Music** (iTunes Search API) | ⚠️ track count teisingas, bet placeholder'iai („Track 5") | ✅ aukštos kokybės | ✅ | Geras metadata fallback |
| **Wikipedia** | ❌ 2/12 užpildyta | — | ✅ (infobox) | Per lėtas TIK tracklist'ui |
| **Deezer** | ❌ dar nesusiejęs su albumu | — | — | Neaktualus šiam atvejui |

**Galutinis sprendimas:** MusicBrainz pirminis šaltinis (laisva JSON API, be auth,
~1200 req/val), Apple Music (iTunes Search API, be auth) — fallback signalui/
viršeliui, kai MB neturi duomenų. Wikipedia NENAUDOJAMA track↔album ryšiui (lieka
tik esamam admin-inicijuotam albumo-per-Wiki-nuorodą srautui nepakitusi).

### C.1 — Nauji failai

- `lib/musicbrainz.ts` — `findAlbumForRecording(artist, title)` (recording paieška →
  ALBUM/EP tipo release'ai → pilnas tracklist re-fetch'as), `fetchReleaseTracklist()`,
  `fetchMbCoverUrl()` (Cover Art Archive).
- `lib/apple-music.ts` — `findAppleAlbumForTrack()` (iTunes Search API, TIK
  metaduomenims — niekad tracklist'o kūrimui, nes placeholder'iai).
- `lib/album-lookup.ts` — orchestratorius: MB pirma (confidence='high' jei
  ne-placeholder tracklist'as), Apple fallback (visad confidence='ambiguous').

### C.2 — Integracija `lib/quick-add.ts`

- `TrackPreview.suggested_album` — užpildomas `previewTrack()` metu (best-effort,
  timeout viduje `album-lookup.ts`, niekad nesulaiko preview'o).
- `TrackOverrides.create_album` + `album_mb_release_id` — admin patvirtinimas.
- `commitTrack()`: jei `create_album=true`, PO track'o sukūrimo (turim `trackId`)
  re-fetch'ina pilną MB tracklist'ą per `createAlbumFromMusicBrainz()` (šviežius
  duomenis, ne preview'o snapshot'ą) ir susieja jau sukurtą track'ą su jo pozicija
  tracklist'e (`track_id` eksplicitiškai, ne slug-matching — saugiau).
- `AlbumFull.source` (naujas laukas `lib/supabase-albums.ts`) — MB albumai gauna
  `source: 'musicbrainz'`, kad nesimaišytų su Wiki reconciliation darbu
  (WIKI_BATCH_HANDOFF.md).
- `is_upcoming` — MB albumo data lyginama su šiandiena; jei ateityje (kaip „Day and
  Night" 2026-09-18 testo atveju), pažymima `is_upcoming=true` (kitaip albumas
  rodytųsi `/albumai` sąraše kaip jau išleistas, nes tas puslapis filtruoja
  `is_upcoming=false`).

### C.3 — Rastas ir pataisytas šalutinis bug'as (`syncAlbumTracks`)

`lib/supabase-albums.ts` `syncAlbumTracks()` komentaras žadėjo „release_year
FILL-ONLY: jei DB jau turi, neperrašom", bet kodas iš tikrųjų VISADA perrašydavo,
kai payload turėjo `release_year`. Tai reiškė: sukūrus MB albumą su albumo-lygio
fallback data (pvz. 2026-09-18), jau egzistuojančio single'o teisinga ANKSTESNĖ
data (2026-06-26) būtų buvusi perrašyta — TIKSLIAI ta pati bug'o klasė kaip D
punkte, tik per albumo sync'ą, ne quick-add dedup'ą. Pataisyta: naujas
`fillReleaseDateIfMissing()` helper'is realiai tikrina DB prieš rašydamas (veikia
abiem `syncAlbumTracks` šakoms — tiek MB, tiek esamam Wiki importui).

### C.4 — UI (`components/AdminQuickAdd.tsx`)

Naujas `AlbumSuggestionBox` — rodo viršelį/pavadinimą/datą/track count/šaltinį.
`confidence='high'` (MusicBrainz, pilnas tracklist'as) → checkbox „Pridėti albumą
kartu su daina", pažymėtas iš anksto. `confidence='ambiguous'` (dalinis MB arba bet
koks Apple) → tik informacinis tekstas, BE auto-create galimybės (kad
neprisikurtų albumų su „Track 5" pavadinimais). `ResultCard` rodo chip'ą su
nuoroda į sukurtą albumą, kai jis buvo pridėtas.

### C.5 — Async atskyrimas + `is_single` žymėjimas (2026-07-16, po pirmo live testo)

Po C.1–C.4 diegimo Edvardas patestavo gyvai ir grąžino du naujus pastebėjimus:

1. „ilgokai uztrunka ir nesinori laukt aridaeius modala" — preview'as tapo lėtas,
   nes laukdavo sekvencinių MusicBrainz recording paieškos + (kartais) Apple
   fallback užklausų PRIEŠ parodydamas preview'ą, ir UI buvo blokuojantis
   (negalėjai pradėti kito quick-add'o, kol laukei).
2. „ar galima is tu saltiniu istraukt ir pazymet kad daina yra singlas" — ar tie
   patys šaltiniai (MB/Apple) gali pažymėti `track.is_single`.

**Sprendimas — albumo paieška atskirta nuo preview'o į savo endpoint'ą:**

- `lib/musicbrainz.ts`: senas `findAlbumForRecording()` pakeistas į
  `analyzeRecording(artist, title) → { albumMatch, isSingleRelease }` — VIENAS
  MB recording-search kvietimas atsako abu klausimus (ar yra albume, ar bent
  vienas su šia daina susijęs release-group yra `primary-type='Single'`), kad
  nereikėtų dviguba užklausų latencijos. Throttle sumažintas 700ms → 500ms.
- `lib/apple-music.ts`: `AppleAlbumMatch` papildytas `looksLikeSingle` (silpna
  heuristika — `trackCount<=1` arba pavadinimas baigiasi „- Single"), naudojama
  TIK kai MB apskritai nieko neturėjo apie šią dainą.
- `lib/album-lookup.ts`: `findAlbumSuggestion()` dabar grąžina
  `{ suggestion, is_single }`. Jei MB rado recording'ą, bet be albumo, ir
  `isSingleRelease=true` → `{suggestion:null, is_single:true}` iškart (be Apple
  kvietimo). Kitaip Apple fallback kaip anksčiau.
- `lib/quick-add.ts`: `previewTrack()` NEBEKVIEČIA `findAlbumSuggestion()` —
  `suggested_album` preview'e visada `null` (greitas, neblokuojantis atsakymas).
  Naujas `TrackOverrides.is_single?: boolean` — promote-only (kaip ir kiti
  panašūs laukai): `commitTrack()` prideda `is_single=true` tiek dedup-update,
  tiek naujo track'o insert šakose, TIK jei `true` (niekad neatstato į `false`).
  `QuickAddResult.detail.is_single` grąžinamas atgal UI.
- **Naujas endpoint'as** `app/api/admin/quick-add/album-suggestion/route.ts` —
  `POST {artist_name, title} → {ok, suggestion, is_single}`. Tas pats
  admin/super_admin auth kaip pagrindinis quick-add route'as. Best-effort:
  bet kokia klaida grąžina `ok:true, suggestion:null, is_single:false` (niekad
  nelaužo UI).
- **`components/AdminQuickAdd.tsx` perrašytas iš blokuojančio single-item formos
  į multi-item eilę (`QueueItem[]`)**: URL input'as visada aktyvus (nelaukia
  jokios globalios fazės); `submit()` iškart išvalo input'ą ir sukuria naują
  eilutę, kuri savarankiškai eina per `previewing → editing → committing/done`.
  Kiekvienam track'o preview'ui iškart po sėkmingo preview'o paleidžiamas
  fire-and-forget `fetchSuggestion()` į naują endpoint'ą — kol jis laukia
  atsakymo, admin gali redaguoti/commit'inti tą pačią eilutę ARBA įvesti kitą
  URL ir pradėti sekantį quick-add'ą lygiagrečiai. `EditForm` rodo „🔍
  Tikrinama…" kol laukia, tada arba `AlbumSuggestionBox`, arba „🏷️ Aptikta kaip
  singlas" tekstą. `ResultCard` rodo `singlas` chip'ą, kai pažymėta.

**Rezultatas:** preview'as (URL → pavadinimas/atlikėjas/metaduomenys) lieka
greitas kaip anksčiau; MB/Apple paieška (lėtesnė dalis) vyksta fone, UI
nelaukia, ir dabar papildomai aptinka bei žymi `is_single`.

### C.0 — Pradinis planas (istorija, NEBEAKTUALUS kaip C.1–C.4 aukščiau)

<details>
<summary>Wikipedia-based planas prieš 2026-07-16 testą (paliktas kontekstui)</summary>

```
1. Track sukurtas/rastas su artist = {id, name, slug}.
2. Ar track jau priklauso kokiam nors albumui DB'e (album_tracks join)?
   → jei TAIP: nieko nedaryti.
3. Best-effort: atlikėjo Wiki puslapis → parseMainPageDiscography() →
   albumų sąrašas → fetchAlbumWiki() kiekvienam kandidatui → parseTracklist() →
   normalizeTitle() palyginimas.
4. Auto-create tik tikslaus match'o atveju.
```

Atmesta, nes Wikipedia track listing dažnai lieka tuščias savaites po anonso
(žr. testo lentelę aukščiau) — MusicBrainz turėjo pilnus duomenis tuo pačiu metu.

</details>

---

## D. Datos apsaugos taisyklė (re-release video bug)

### D.1 — Kur tiksliai yra dabartinė problema

`lib/quick-add.ts`, `commitTrack()`, eilutės **860–877**:

```ts
const { data: existingTrack } = await supabase
  .from('tracks').select('id, title, slug').eq('artist_id', artist.id).ilike('title', title).maybeSingle()
...
if (existingTrack) {
  ...
  const upd: Record<string, any> = { title, video_url: ..., video_embeddable: ..., video_uploaded_at: ... }
  applyDate(upd)   // ⚠️ VISADA perrašo release_year/month/day nauja YT įkėlimo data
  await supabase.from('tracks').update(upd).eq('id', trackId)
}
```

`existingTrack` SELECT net neatsiima `release_year/month/day` — jų nereikia
palyginimui, nes `applyDate()` besąlygiškai perrašo. Būtent čia atsiranda tavo
aprašytas bug'as: grupė perkelia/perleidžia seną dainą nauju video (pvz. remaster,
naujas kanalas, region re-upload) → nauja `uploadedAt` → sena teisinga 2019 metų data
virsta 2026.

Įdomu, kad **`commitChartTrack()` (naudojamas external charts srauto) JAU turi
apsaugą** (eil. 1033–1037): `if (up && !(trow as any)?.release_year)` — t.y. datą
užpildo TIK jei track'as dar neturi `release_year`. `commitTrack()` (quick-add
pagrindinis srautas) šios apsaugos neturi — nenuoseklu tarp dviejų kelių.

### D.2 — Siūloma taisyklė

Ne tiesiog „niekada neperrašyti" (per griežta — jei esama data buvo klaidinga/
placeholder'is, o naujas fetch'as atneša TIKRĄ ankstesnę datą, norim ją priimti), o
**„laimi ankstesnė data"**:

```ts
const { data: existingTrack } = await supabase
  .from('tracks')
  .select('id, title, slug, release_year, release_month, release_day')
  .eq('artist_id', artist.id).ilike('title', title).maybeSingle()

...

const toComparable = (y?: number|null, m?: number|null, d?: number|null) =>
  y ? y * 10000 + (m || 1) * 100 + (d || 1) : null

const applyDate = (b: Record<string, any>) => {
  if (!ry) return
  const existingComparable = existingTrack
    ? toComparable(existingTrack.release_year, existingTrack.release_month, existingTrack.release_day)
    : null
  const newComparable = toComparable(ry, rm, rd)
  if (existingComparable !== null && newComparable !== null && newComparable >= existingComparable) {
    // Nauja data NĖRA ankstesnė už jau įrašytą — palikti seną, tik pridėti warning.
    warnings.push(
      `Rasta naujesnė/tokia pati video data (${ry}-${rm}-${rd}) nei jau įrašyta ` +
      `(${existingTrack.release_year}-${existingTrack.release_month}-${existingTrack.release_day}) — ` +
      `palikta senesnė (tikėtina re-upload/remaster).`
    )
    return
  }
  b.release_year = ry; b.release_month = rm; b.release_day = rd
  b.release_date = `${ry}-${String(rm || 1).padStart(2, '0')}-${String(rd || 1).padStart(2, '0')}`
}
```

Taisyklė: **naujas rašymas laimi TIK jei senos datos nėra ARBA nauja data yra
ANKSTESNĖ** — tiksliai tavo aprašyta situacija (senas video re-upload'as su vėlesne
YT data neturi „pajauninti" jau žinomos ankstesnės išleidimo datos).

### D.3 — Papildomai

- Ta pati logika turėtų taikytis ir albumo track'ams importo/merge metu, jei tokia
  situacija pasitaiko (album track re-import) — bet tai jau kitos funkcijos
  (`createAlbum`) atsakomybė, nežiūrėta šiame plane; paminėti kaip TODO patikrinti.
- Sąmoningai NEliečiu `video_url`/`video_embeddable`/`video_uploaded_at` — tie laukai
  gali ir turi atsinaujinti (senas video gali būti pašalintas, naujas re-upload yra
  legitimūs pakeitimai grotuvui), tik `release_*` datos laukai saugomi.

---

## E. Bendra nauja infrastruktūra (jei darom A ir B)

Vienas naujas queue tipas tinka abiem (A ir B) šaltiniams — `music_candidates`:

```sql
CREATE TABLE public.music_candidates (
  id BIGSERIAL PRIMARY KEY,
  candidate_kind   TEXT NOT NULL CHECK (candidate_kind IN ('track','album')),
  source_type      TEXT NOT NULL CHECK (source_type IN ('yt_channel','wiki_album_list')),
  source_id        BIGINT REFERENCES scout_sources(id) ON DELETE SET NULL,
  source_url       TEXT NOT NULL,          -- YT video URL arba Wiki albumo/atlikėjo URL
  fingerprint      TEXT NOT NULL,          -- dedupe raktas (žr. B.2)
  primary_artist_id BIGINT REFERENCES artists(id) ON DELETE SET NULL,
  preview_payload  JSONB NOT NULL,          -- previewTrack()/previewAlbum() rezultatas — UI tiesiai renderina
  status TEXT NOT NULL DEFAULT 'pending'
         CHECK (status IN ('pending','auto_added','added','rejected','duplicate','error')),
  reviewed_by INTEGER,
  reviewed_at TIMESTAMPTZ,
  published_track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
  published_album_id INTEGER REFERENCES albums(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_music_candidates_fp ON music_candidates(fingerprint);
```

`preview_payload` = tiesiog `previewTrack()`/`previewAlbum()` grąžinamas JSON — admin
UI blokas ("🎵 Muzikos atradimai", panašiai kaip esamas „Naujienų inbox" dashboard'e)
renderina TĄ PATĮ preview komponentą, kurį jau naudoja `AdminQuickAddModal.tsx`, tik
su „Pridėti"/„Atmesti" mygtukais vietoj URL input'o. Vienas UI komponentas, du
panaudojimo būdai — nereikia duplikuoti preview rendering logikos.

---

## F. Diegimo eiliškumas (siūlomas)

| # | Darbas | Kodėl pirmas/paskutinis |
|---|---|---|
| 1 | **D — datos apsaugos taisyklė** | Vienas failas, izoliuota, taiso jau esantį bug'ą, jokios naujos infrastruktūros. Daryti pirma. |
| 2 | **C — albumo paieška prie dainos** | Naudoja TIK esamas funkcijas (`wiki-parser`, `createAlbum`, `track-dedup`). UI pakeitimas nedidelis (badge preview'e). Aukšta vertė, vidutinė apimtis. |
| 3 | **B — Wiki album list scout** | Naujas parseris + review queue, bet mažesnė apimtis nei A (vienas puslapis, ne šimtai kanalų). Statesnis, nuspėjamesnis diegimui. |
| 4 | **A — YouTube kanalų scout** | Didžiausia vertė ilgalaikėje perspektyvoje, bet ir didžiausia apimtis (nauja `scout_sources` kategorija, channel discovery/backfill atlikėjams be `youtube_channel_id`, review UI). Daryti paskutinį, kai queue infrastruktūra (iš B) jau išbandyta gyvai. |

## G. Klausimai, kuriuos verta apsispręsti prieš codavimą

1. **A.2 (channel backfill)** — ar pradėti tik nuo atlikėjų, kurie jau turi
   `youtube_channel_id`, ar iškart investuoti į backfill visiems trending atlikėjams?
2. **B.3** — ar sutinki su taisykle „albumas fiksuojamas TIK jei atlikėjas jau
   kataloge" (apsaugo nuo teršimo), ar norėtum agresyvesnio auto-create tam tikroms
   žanro/šalies kategorijoms (kaip LT scope external charts)?
3. **C.4 cache** — nauja lentelė ar pakanka in-memory (Vercel function cold start
   išvalys per kiekvieną deploy, bet quick-add naudojimas nėra itin dažnas — galbūt
   pakanka be cache pirmam etapui, pridėti tik jei pastebimai lėtina)?
4. Ar review queue UI daryti kaip **naują** admin skyrių, ar **įlieti** į esamą
   „Naujienų inbox"/dashboard struktūrą kaip dar vieną plytelę (rekomenduoju antrą —
   nuoseklu su dashboard'o vizualiu modeliu screenshot'e)?
