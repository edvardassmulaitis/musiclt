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

---

## C. Greito pridėjimo papildymas — daina → patikrinti albumą

### C.1 — Konkreti vieta kode

`lib/quick-add.ts` `commitTrack()` (eil. 809–949). Šiuo metu sukuria/atnaujina TIK
`tracks` įrašą. Reikia naujo žingsnio PO track'o sukūrimo/matchinimo, PRIEŠ grąžinant
rezultatą.

### C.2 — Logika

```
1. Track sukurtas/rastas su artist = {id, name, slug}.
2. Ar track jau priklauso kokiam nors albumui DB'e (album_tracks join)?
   → jei TAIP: nieko nedaryti (jau sutvarkyta).
   → jei NE: tęsti.
3. Best-effort (su timeout, NEBLOKUOJANT commit'o jei nepavyksta):
   a) Ar atlikėjas turi Wikipedia puslapį (artist.wiki_url arba paieška per
      artist name)? Jei ne — stop, jokio warning'o (dauguma LT atlikėjų neturės).
   b) fetchWikitext(artistWikiTitle) → wiki.parseMainPageDiscography() arba
      parseDiscographyPage() (JAU EGZISTUOJA `lib/wiki-parser.ts`) → gaunam
      albumų sąrašą su metais.
   c) Filtruojam albumus, kurių metai ±1 nuo track'o release_year (arba visus,
      jei track neturi datos) — apriboja Wikipedia fetch'ų kiekį per albumą.
   d) Kiekvienam kandidatui: fetchAlbumWiki(albumWikiUrl) → parseTracklist() →
      normalizeTitle(track.title) palyginam su normalizuotais tracklist
      pavadinimais (naudoti `lib/track-dedup.ts normalizeTitle()` — JAU
      EGZISTUOJA, tiksliai tam skirta).
4. Sprendimas:
   - Tikslus title match VIENAME albume, IR to albumo Wikipedia turi cover'į arba
     ≥3 dainas tracklist'e (apsauga nuo tuščių/placeholder straipsnių) →
     **auto-create albumas** per esamą `createAlbum()` (tas pats kelias kaip
     commitAlbum), track'as prijungiamas prie jo (arba, jei jau egzistuoja su kitu
     ID per albumo importą, merge'inamas pagal title+artist — žr. album_tracks
     insert logiką `createAlbum`).
     → warning: „Taip pat pridėtas albumas „{title}" ({year}), kuriame yra ši daina."
   - Match KELIUOSE albumuose (pvz. album + jo deluxe versija abi turi tą pačią
     dainą) ARBA fuzzy/dalinis match (ne exact po normalize) →
     **NEkuriam automatiškai** — warning/suggestion preview'e:
     „Galimai priklauso albumui „{title}" ({year}) — nori pridėti?" su nuoroda,
     kurią admin gali paspausti (atidaro tą albumo Wiki URL per esamą „Greitas
     pridėjimas" albumo srautą, jau užpildytą).
   - Nieko nerasta → be warning'o (nereikia terlioti UI kiekvienam single'ui).
```

### C.3 — Kur šitas žingsnis vyksta preview vs. commit fazėje

Kadangi tai papildomi Wikipedia fetch'ai (lėta, 1-3s+), rekomenduoju paleisti šį
patikrinimą **preview fazėje** (kad admin matytų pasiūlymą PRIEŠ commit'indamas),
grąžinant naują `TrackPreview.suggested_album` lauką:
`{ found: boolean, title: string, year: number|null, wiki_url: string,
confidence: 'high'|'ambiguous' }`. UI (`AdminQuickAddModal.tsx`) parodo badge'ą
„📀 Rastas albumas: {title} ({year})" su checkbox'u „pridėti kartu" (default TRUE
tik kai `confidence='high'`). Commit fazėje `commitTrack()` priima naują override
`create_album_url?: string` (Wikipedia URL, jei admin patvirtino arba high-confidence
auto) ir viduje kviečia `commitAlbum()`.

### C.4 — Apribojimai (kad nesulėtintų kiekvieno quick-add)

- Šis žingsnis vyksta TIK jei track'as neturi albumo IR atlikėjas turi Wikipedia
  puslapį (didžioji dalis naujausių single'ų šiaip pasilieka be albumo — tai
  normalu, nereikia versti kiekvienos dainos į albumą).
- **Cache**: `artist_id → { discography, fetched_at }` su TTL 24h (paprasta lentelė
  arba net Redis/Vercel KV jei jau naudojama; jei ne — pakanka DB lentelės
  `artist_wiki_disco_cache`), kad tas pats atlikėjas per dieną nebūtų fetch'inamas
  pakartotinai kiekvienam naujam single'ui (dažna atlikėjų su 10+ singlų per mėnesį
  situacija).

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
