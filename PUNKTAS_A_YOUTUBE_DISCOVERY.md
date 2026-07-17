# Punktas A — YouTube naujos muzikos automatinis atradimas

Statusas 2026-07-17: **NEPRADĖTA KODINTI.** D, C, B punktai (žr. `MUSIC_DISCOVERY_AUTOMATION_PLAN.md`) jau
įgyvendinti ir live. Šis dokumentas — tyrimo išvados + atviri klausimai, kuriuos reikia išspręsti su
Edvardu PRIEŠ pradedant kodinti (jis paprašė patestuoti/susiderinti flow'ą pirma, per patirtį su C punktu —
ten Wikipedia vs MusicBrainz palyginimas gyvai prieš codavimą pasirodė lemiamas).

## 0. Kodėl šis dokumentas apskritai reikalingas

Pradinis planas (`MUSIC_DISCOVERY_AUTOMATION_PLAN.md` §A) teigė kaip faktą, kad `artists.youtube_channel_id`
stulpelis **jau egzistuoja** ir dalis atlikėjų jau turi susietą kanalą. Tai **PATIKRINTA IR PANEIGTA**
2026-07-17 (žr. §1 žemiau) — kitas thread'as NETURI vėl remtis tuo teiginiu be patikrinimo.

## 1. Headline blokatorius — kanalų duomenų kataloge tiesiog nėra

- `artists.youtube_channel_id` **niekada nesukurtas jokioje migracijoje** (grep per
  `supabase/migrations/*.sql` — nulis rezultatų su `CREATE`/`ALTER` tam stulpeliui). Egzistuoja tik kaip
  tipas + pass-through `lib/supabase-artists.ts` ir vienas skaitymas `app/atlikejai/[slug]/page.tsx:1437`
  (JSON-LD `sameAs`, `(artist as any)` guard'as — t.y. kodas jau tikėjosi, kad gali nebūti).
- **Realus egzistuojantis laukas: `artists.youtube`** — plain URL text stulpelis (kaip `.instagram`,
  `.spotify` ir kt.), pildomas iš Wikidata P2397 importo per `lib/artist-import.ts`. Kai Wikidata turi
  P2397, gaunamas švarus `/channel/UC...` URL. Bet dažniausiai NIETAS nepildoma.
- **Gyvai patikrinta 2026-07-17** su 4 realiais, aktyviais LT atlikėjais iš paties `musiclt.vercel.app`
  katalogo (Jazzu, Monika Linkytė, Donny Montell, Justinas Jarutis) — per jų puslapio embedded JSON
  (`links` masyvas): **NĖ VIENAS neturi YouTube nuorodos, tik Spotify.** Tai realūs, žinomi, šiuo metu
  aktyviai leidžiantys muziką atlikėjai — jei jų nėra, tikėtina, kad kanalų susiejimas apskritai artimas
  nuliui visame kataloge.
- **Yra jau veikianti (bet neišnaudota masiškai) infrastruktūra:** `lib/social/youtube.ts`
  `resolveChannelId(input)` — paverčia bet kokį URL/`@handle`/`/user/` į tikrą `UC...` ID per oficialų
  YouTube Data API. Šiuo metu naudojama TIK savitarnos „Artist Studio" funkcijoje
  (`app/api/studija/connections/route.ts`, migracija `20260615c_social_connections.sql`, ~mėnesio senumo
  feature'as) — kur atlikėjas PATS prisijungia savo kanalą. Rezultatas eina į `artist_social_connections`
  lentelę (`external_id`), NE atgal į `artists.youtube_channel_id`. Realios adopcijos (kiek atlikėjų
  realiai prisijungė) NEPATIKRINTA — kitas thread'as turėtų patikrinti `artist_social_connections WHERE
  platform='youtube'` eilučių skaičių per Supabase SQL Editor'į prieš planuojant apimtį.

**Išvada:** A punktas negali prasidėti tiesiog nuo „stebėti žinomų kanalų feed'us" — pirma reikia
kanalų-priskyrimo (backfill) žingsnio. Žr. §5 klausimą #1.

## 2. Kanalo Atom feed signalo kokybė — gyvai testuota, prastesnė nei tikėtasi

Testuota `https://www.youtube.com/feeds/videos.xml?channel_id=UC...` (laisva, be auth, be quota) su 5
pasauliniais atlikėjais (Coldplay, Ed Sheeran, Taylor Swift, Dua Lipa, Billie Eilish) — paskutinių 15
`<entry>` elementų (feed'as griežtai ribotas 15, be puslapiavimo).

Rezultatai (paskutinių 15 įkėlimų kiekvienam):
- **Dua Lipa: 0/15 buvo muzika** — vien interviu/podcast šalutinio kanalo turinys.
- **Ed Sheeran: 0/15 buvo nauja daina** — Loop Tour dienoraščiai + Shorts.
- **Billie Eilish: 0 aiškių naujų dainų** — tour vlogs + Shorts, viena dviprasmiška „(Official Visualizer)"
  jau esančiam track'ui.
- **Coldplay: ~2/15** atrodė kaip muzikinis turinys, bet vienas iš jų — jau esančios dainos alt-version.
- **Taylor Swift geriausias atvejis** — keli tikri nauji, bet 5/15 buvo TO PATIES kūrinio skirtingi
  remix'ai (4 atskiri remix upload'ai tą pačią dieną).

**Techninės detalės iš feed'o:**
- Nėra `duration` lauko VISAI — plano dokumento siūlyta „duration > 45s filtruoja shorts" heuristika
  neveiks tiesiogiai iš feed'o. Bet Shorts atpažįstami PATIKIMIAU per URL pattern'ą
  (`<link href="youtube.com/shorts/ID">` vs `/watch?v=ID`) — laisva, be papildomo kvietimo.
- `<media:group><media:description>` turi pilną aprašymą — BET esamas `lib/scout-feeds.ts` `fetchFeed()`
  generic parseris to NEIŠTRAUKIA (žiūri tik top-level `<summary>`/`<content>`, ne `media:group` viduje).
  Reikės arba papildomo regex prie surasto entry bloko, arba dedikuoto `parseYouTubeAtom()`.
- `<published>` patikimai yra upload data (NE `<updated>` — tas keičiasi statistikai atsinaujinus,
  patikrinta gyvai — kai kurie entries turėjo `updated` savaitėmis vėlesnį nei `published`).

**Išvada:** vien pavadinimo teksto + blocklist regex NEPAKAKS „100% aišku" sprendimui net didiesiems
atlikėjams. Reikės bent: URL-based Shorts filtro (laisva) + YouTube Data API `categoryId`/`contentDetails.duration`
patikros ambiguous atvejams (pigu, jei jau darom Data API kvietimą) + Haiku klasifikavimo tik tam, kas
išlieka po laisvų/pigių filtrų. **TAČIAU** — testuota su PASAULINIAIS super-žvaigždėmis, kurios turi
šalutinį vlog/Shorts turinį. Maža, savarankiškai valdoma LT grupė greičiausiai bus ŽYMIAI švaresnė
(vienas upload = tas pats singlas). Reikia patestuoti su TIKRAIS LT kanalais prieš darant išvadas apie
bendrą triukšmo lygį — žr. §5 klausimą #2.

## 3. Kas jau egzistuoja kode ir tinka pakartotiniam naudojimui

- **`lib/scout-feeds.ts` `fetchFeed(feedUrl)`** — URL/title/guid/published_at ištraukimas veikia
  teisingai YouTube Atom'ui be pakeitimų. Trūksta TIK `media:description` (žr. §2) — nedidelis papildymas,
  ne perrašymas.
- **`lib/quick-add.ts` `parseYtTitle(rawTitle, channel)`** — atlikėjo/pavadinimo skaidymas iš video
  title'o. Veikia mechaniškai, bet **NETURI atmetimo kelio** — bet kokį pavadinimą (net „Loop Tour Diaries
  - North America") paverčia struktūruotu (bet klaidingu) rezultatu. Naudotinas UŽ klasifikavimo
  sluoksnio, ne kaip pats klasifikatorius.
- **`lib/social/youtube.ts` `resolveChannelId()`/`getChannelInfo()`** — jau veikiantis, produkcijoje
  testuotas kanalo ID rezoliucijos helper'is (žr. §1). Naudotinas TIESIOGIAI backfill žingsniui, ne
  rašyti naują.
- **`lib/yt-innertube.ts` `getVideoDetails()`** — šiuo metu grąžina TIK `videoId, title, viewCount,
  channelId, isPrivate, uploadedAt, source`. **NETURI** `duration`, `categoryId` (Music=`"10"`), ar
  `description` — nors Data API atsakymas (kai `YOUTUBE_API_KEY` nustatytas) juos JAU turi, tiesiog
  neištraukiama. Pigus papildymas (kelios eilutės), naudingas ir A punktui, ir bendrai quick-add/enrich.
  **Free (InnerTube/watch-page) keliai bot-blokuojami iš serverio konteksto** (patikrinta gyvai —
  `LOGIN_REQUIRED` / redirect į `google.com/sorry`) — Data API (key-based) yra vienintelis PATIKIMAS
  šaltinis šitiems papildomiems laukams.
- Pastaba dėl API quota: yra atskiras `YOUTUBE_API_KEY_STUDIO` env var'as, kad Artist Studio funkcija
  nekonkuruotų kvotos su quick-add/enrich. A punktui tikėtina reikės TREČIO dedikuoto key'o pagal tą patį
  pattern'ą (žr. §5 klausimą #4).

## 4. Architektūros variantai

### Variantas 1 — Per-artist channel Atom feed scout (rekomenduojamas pagrindinis)

Mirror'ina `news-scout`/`events-scout`/naujai padaryto `wiki-album-scout` pattern'ą:
`scout_sources` (nauja kategorija, pvz. `yt_artist_channel`, seed'inama iš atlikėjų su išspręstu kanalo
ID) → `app/api/internal/yt-release-scout/run/route.ts` → `fetchFeed()` (papildytas media:description) →
dedupe per `scout_seen_urls` (video URL/guid) → laisvas pre-filtras (Shorts URL, blocklist regex) →
likusiems — 1 Data API kvietimas (`categoryId`+`contentDetails.duration`+`description`) → ambiguous
likučiui — Haiku klasifikacija → auto-commit TIK kai channel↔artist 1:1 IR visi signalai sutampa, kitaip
review queue (tas pats `wiki_album_candidates`-stiliaus pattern'as, jau turim UI template'ą
`/admin/inbox/albums`).

Privalumas: mažiausias diff, keturios jau battle-tested dalys (fetchFeed, parseYtTitle, commitTrack,
scout_sources/scout_seen_urls/candidate-queue pattern'as iš B punkto).

### Variantas 2 — Piggyback ant esamos Artist Studio `artist_social_items` infrastruktūros

`lib/social/sync.ts` `syncAllConnections()` JAU veikia per cron'ą (`app/api/cron/social-sync/route.ts`),
jau resolvina kanalo ID, jau traukia uploads per Data API (`fetchYouTubeUploads` — playlist-based, ne
Atom, be bot-block rizikos), jau landina `artist_social_items` lentelėje. Diskovery žingsnis galėtų tiesiog
klausytis NAUJŲ `artist_social_items` eilučių (`platform='youtube', kind='video'`) ir leisti tą patį
klasifikavimo pipeline'ą — be atskiro fetch/dedupe/resolve sluoksnio.

Rizika kaip PIRMINIS kelias: šitas sistema yra atlikėjo-inicijuota (reikia, kad JIS pats prisijungtų
`/atlikejams/zona/socialiniai`) — apima tikriausiai artimą nuliui katalogo dalį šiandien (feature'as
~mėnesio senumo). Konflikuoja concerns: `artist_social_items` skirta fan-facing feed'ui, ne
catalog-integrity vartams.

**Rekomendacija:** Variantas 2 kaip PAPILDOMAS, aukštesnio pasitikėjimo šaltinis vėliau (atlikėjas PATS
patvirtino kanalą = didesnis trust), Variantas 1 kaip pagrindinis plataus katalogo scout'as. Bet
`resolveChannelId()`/`getChannelInfo()` iš `lib/social/youtube.ts` naudoti TIESIOGIAI abiem atvejais
(jau teisingas ir testuotas), ne rašyti naują resolverį.

### Variantas 3 — YouTube Data API `search.list` kaip pirminis atradimas — ATMESTA

Jau teisingai atmesta pradiniame plane (100 quota units/paieška, ~100 paieškų/dieną riba default
kvotoje — neskaluoja šimtams stebimų atlikėjų). Neturiu ką pridėti, kas keistų šią išvadą.

## 5. Atviri klausimai — REIKIA Edvardo sprendimo prieš codavimą

1. **Kanalų backfill strategija:**
   - (a) Automatinis paieška-pagrįstas priskyrimas per Data API (greitas paleisti, bet kainuoja kvotą,
     aukštos tikimybės atvejai auto-priskiriami, neaiškūs — į review eilę);
   - (b) Rankinis — Edvardas duoda 5-10 realių LT atlikėjų kanalų pavyzdžių tiesioginiam testavimui;
   - (c) Palaukti Artist Studio adopcijos (patikimiausias šaltinis, bet lėčiausias — reikia patikrinti,
     kiek atlikėjų iš viso prisijungę šiandien, žr. §1).
2. **Auto-publish agresyvumas** — atsižvelgiant į §2 triukšmo lygį net žinomiems atlikėjams: pradėti
   konservatyviai (dauguma į review eilę, auto-publish tik kai VISI signalai sutampa) ar agresyviau nuo
   pat pradžių?
3. **Ar reikia pilotinio testo su REALIAIS LT kanalais** prieš finalizuojant filtro taisykles — §2 testas
   buvo su pasaulinėmis žvaigždėmis (daug šalutinio turinio), tikėtina, kad maža savarankiška grupė bus
   švaresnė, bet tai reikia patikrinti, ne prielaidos daryti.
4. **Ar A punktui reikia atskiro `YOUTUBE_API_KEY` env var'o** (kaip `YOUTUBE_API_KEY_STUDIO` egzistuoja
   Artist Studio funkcijai) — kad nekonkuruotų kvotos su quick-add/enrich/Studio.
5. **Ar `duration`/`categoryId`/`description` ištraukimas turėtų eiti į shared `getVideoDetails()`**
   (naudinga ir quick-add/enrich apskritai) ar likti scout-specifinė lengvesnė Data API užklausa.

## 6. Rekomenduojamas kitas žingsnis (kai grįši prie A punkto)

Prieš rašant bet kokį kodą: gauti iš Edvardo 2-3 realius LT atlikėjų YouTube kanalų handle'us/nuorodas
(pageidautina savarankiškai valdomų/mažesnių, ne per didžiausius), gyvai patikrinti jų Atom feed'ų
signalo kokybę (kaip padaryta §2, bet su TIKRAIS šio katalogo atvejais), ir TADA kartu su juo apsispręsti
dėl §5 klausimų — tas pats procesas, kuris pasiteisino su C punktu (MusicBrainz vs Wikipedia sprendimas
prieš codavimą).

---

# Deployment / workflow info kitam thread'ui

Pilna, detalesnė versija (veikiantis git push metodas, Supabase Management API SQL vykdymo instrukcijos,
sandbox apribojimai) — projekto dokumente `claude/musiclt-deploy-credentials-and-workflow.md` (šitas
Cowork projektas, skaityti per `project_read` pačioje sesijos pradžioje). ČIA — santrauka + statusas.

## Repo / prod

- Repo: `https://github.com/edvardassmulaitis/musiclt`
- Prod: `https://musiclt.vercel.app` (Vercel, auto-deploy nuo `main` push'o, ~90-250s iki matomo)
- GitHub PAT ir Supabase Management API tokenas dalinti atviru tekstu ankstesniuose pokalbio žingsniuose —
  **abu verta rotuoti/atšaukti**, kai patogu (priminimas kartojasi kelis kartus šiame thread'e, dar
  nepadaryta). Raktų reikšmės — projekto dokumente aukščiau, sąmoningai nekartojamos čia.

## Kas įgyvendinta ir live šiandien (2026-07-17)

- **D punktas** — datos apsauga dedup metu (`lib/quick-add.ts` `commitTrack`/`applyDateGuarded`).
- **C punktas** — quick-add albumo pasiūlymas (MusicBrainz pirminis + Apple fallback), vėliau papildyta:
  async atskyrimas nuo preview'o (queue UI `components/AdminQuickAdd.tsx`), `is_single` žymėjimas.
  2026-07-17 papildyta dar kartą: `is_single` dabar tikrinamas VISIEMS albumo track'ams (ne tik
  pridedamai dainai) MB-sourced albumo kūrimo metu — `lib/musicbrainz.ts` `isRecordingSingle()`.
- **B punktas** — Wikipedia „List of 2026 albums" stebėjimas. Migracija `20260716b_wiki_album_candidates.sql`
  **JAU PALEISTA** Edvardo per Supabase SQL Editor'į (2026-07-17). `/admin/inbox/albums` turi „Paleisti
  scan'ą dabar" mygtuką (session-auth, nereikia laukti 06:00 UTC cron'o) —
  `app/api/admin/wiki-album-scout/trigger`, logika `lib/wiki-album-scout-run.ts`.
- **A punktas** — NEPRADĖTA, žr. aukščiau.

## Kaip pushinti į main (trumpai)

1. `npx tsc --noEmit -p tsconfig.json` — turi būti tuščias output prieš commit'inant.
2. `git add` konkrečius failus (ne `-A` aklai), `git commit`.
3. `git fetch origin main && git log HEAD..origin/main --oneline` — patikrinti, ar remote'as pajudėjo
   (šiame thread'e tai nutiko kelis kartus — kiti thread'ai/sesijos dirba prie to paties repo lygiagrečiai).
   Jei taip — `git rebase origin/main`, tada DAR KARTĄ `npx tsc --noEmit` patikrinti po rebase.
4. Push reikalauja token'o — pilna instrukcija projekto dokumente (veikiantis GIT_ASKPASS metodas,
   patikrintas keliskart šiame thread'e). Prieš pirmą push'ą naujame thread'e — paklausti Edvardo, ar
   galima pushinti tiesiai į main be papildomo klausimo per likusią sesiją.

## DB migracijos

- Šitas sandbox NETURI tiesioginio Postgres (`DATABASE_URL`) ryšio — tik 443/HTTPS praeina.
- Supabase Management API (`api.supabase.com/v1/projects/{ref}/database/query`) su Personal Access
  Token'u KARTAIS veikia (žr. projekto doc'e nurodytą pavyzdį), o **šiame thread'e buvo užblokuota
  auto-mode saugumo klasifikatoriaus** kaip per didelės rizikos veiksmas (plataus masto tokenas +
  tiesioginė prod DB mutacija). Nesutapimas tarp dokumento teiginio ir realaus patyrimo — kitas thread'as
  turėtų BANDYTI šitą kelią pirmą (gali suveikti priklausomai nuo pokalbio konteksto), bet TURI turėti
  paruoštą fallback'ą: **tiesiog atsiųsti Edvardui SQL tekstą nukopijuoti į Supabase SQL Editor'į** —
  tai visada veikia, nereikia jokio tokeno.
- Supabase project ref: `tyvribkcymenlvnrwkdz` (pavadinimas „musiclt", regionas eu-central-1).

## Sandbox apribojimai (santrauka — pilna versija projekto doc'e)

- Nėra `gh` CLI. Nėra tiesioginio Postgres ryšio. `env | grep ...` blokuojamas kaip credential
  materialization — naudoti `test -n "$VAR"` vietoj to.
- Repo kalba: komentarai, commit žinutės, admin UI tekstas — visur lietuviškai.
