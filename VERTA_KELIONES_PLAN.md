# Verta kelionės — koncepcija ir architektūra

> Statusas: **v1 koncepcija + veikianti seed page'a** (deploy 2026-06-14).
> Vieta: `/verta-keliones`. Nav: jau prilinkinta (Koncertai panelė, žalia `#10b981`, plane ikona).

---

## 1. Idėja viena pastraipa

Radaras, kuris atrenka **top atlikėjų ir festivalių koncertus užsienyje, realiai pasiekiamus iš Lietuvos** — arba pigiu tiesioginiu skrydžiu (Vilnius / Kaunas / Ryga), arba mašina/autobusu per kelias valandas (Ryga, Talinas, Varšuva, Gdanskas, Lenkijos festivaliai). Pvz. Kanye West Madride ar The Weeknd Varšuvoje turi automatiškai „nukristi" į radarą, nes ten skrenda pigus skrydis / nuvažiuojama. Vartotojas iškart mato: **kas**, **kur**, **kada**, **kiek apytiksliai kainuotų visa kelionė** ir **kaip nuvykti**.

Du dėmenys, kurie susitinka:
1. **Pasiekiamų krypčių sąrašas** (statinis, retai keičiasi) — miestai/oro uostai, į kuriuos iš LT pigu/lengva nuvykti.
2. **Koncertų srautas** tose kryptyse — top atlikėjų turų datos + festivaliai.

Match: `koncertas.miestas ∈ pasiekiamos_kryptys` → patenka į radarą. Rikiuojama pagal atlikėjo populiarumą × kelionės lengvumą.

---

## 2. Duomenų modelis (Supabase)

### 2.1 `travel_destinations` — pasiekiamų krypčių katalogas (kuruojamas)

Tai „cheap flight + drivable" sąrašas, kurį tu palaikai. Gan statinis.

```sql
create table travel_destinations (
  id            bigserial primary key,
  city          text not null,              -- "Varšuva"
  country       text not null,              -- "Lenkija"
  country_code  text,                       -- "PL" (vėliavėlei)
  airport_codes text[] default '{}',        -- {WAW, WMI}
  reach_mode    text not null,              -- 'flight' | 'car' | 'both'
  -- skrydžiui:
  from_airports text[] default '{}',        -- {VNO, KUN, RIX}
  carriers      text[] default '{}',        -- {Ryanair, Wizz Air, airBaltic}
  price_from    int,                         -- tipinė one-way kaina EUR
  -- mašinai/autobusui:
  drive_hours   numeric,                     -- 6.5 (iš artimiausio LT miesto)
  drive_from    text,                        -- "Kaunas"
  -- meta:
  is_active     boolean default true,
  last_seen_at  timestamptz,                 -- paskutinį kartą rasta scrape'e (route-diff)
  note          text,
  sort_order    int default 0,
  created_at    timestamptz default now()
);
```

**Krypties pasiekiamumas ≠ koncerto vieta vienas-su-vienu.** Daug stadionų yra priemiesčiuose
(Gdynia ↔ Gdanskas, Roskilde ↔ Kopenhaga). Todėl matchinant naudojam ne tik tikslų miestą, bet
**`city_aliases`** (žr. 4 sk.).

### 2.2 Koncertai — praplečiam esamą `events` lentelę

Nekuriam atskiros lentelės — `events` jau turi `title, venue_name, city, start_date, end_date,
ticket_url, cover_image_url, event_artists[]`. Pridedam:

```sql
alter table events add column country       text;            -- "Lenkija" / null = LT
alter table events add column is_abroad      boolean default false;
alter table events add column destination_id bigint references travel_destinations(id);
alter table events add column source         text;            -- 'wiki' | 'ticketmaster' | 'manual' | 'ai_scout'
alter table events add column source_url     text;
```

`is_abroad = true` + `destination_id is not null` → kandidatas į radarą.
LT koncertai (`/koncertai`) lieka `is_abroad = false` ir nepaliesti.

### 2.3 `abroad_event_candidates` — AI scout pasiūlymai (approval eilė)

Kad nieko automatiškai nepublikuotume — viskas per admin approve.

```sql
create table abroad_event_candidates (
  id            bigserial primary key,
  artist_name   text not null,
  artist_id     bigint references artists(id),  -- jei rezolvinta
  tour_name     text,
  city          text not null,
  country       text,
  venue_name    text,
  start_date    date,
  end_date      date,
  ticket_url    text,
  source        text,                           -- 'wiki' | 'ticketmaster' | ...
  source_url    text,
  popularity    int,                            -- 0-100, paskaičiuotas (žr. 5 sk.)
  destination_id bigint references travel_destinations(id),  -- jei matchino kryptį
  status        text default 'pending',          -- pending | approved | rejected
  dedupe_key    text unique,                      -- artist|city|date → no dupes
  raw           jsonb,
  created_at    timestamptz default now()
);
```

Approve → įrašas perkeliamas/promote'inamas į `events` (su `is_abroad=true`).

---

## 3. Krypčių sąrašo palaikymas (route-diff)

Tu sakei: gan statinis, bet **nenoriu praleisti, jei atsiranda nauja kryptis arba dingsta kuri**.
Sprendimas — **periodinis scrape + diff prieš DB**, niekada automatiškai netrindamas:

1. **Seed (vienkartinis):** užpildom `travel_destinations` iš žinomo Ryanair/Wizz Air/airBaltic
   tinklo (VNO/KUN/RIX). Pradinis sąrašas faile `lib/verta-keliones-seed.ts` (jau yra).
2. **Atnaujinimas (mėnesinis cron):** workeris nuskaito esamus tiesioginius maršrutus iš
   VNO/KUN/RIX (FlightConnections / oro uostų tvarkaraščiai / vežėjų route map'ai) ir lygina su DB:
   - **naujas maršrutas** (yra scrape'e, nėra DB) → įrašom `is_active=true` + flag admin'ui
     („nauja kryptis — patikrink, ar verta įtraukti").
   - **dingęs maršrutas** (yra DB, nėra scrape'e 2 ciklus iš eilės) → **nepašalinam**, tik
     `is_active=false` + flag („kryptis dingo — galbūt sezoninė"). `last_seen_at` rodo amžių.
   - **niekada netrinam automatiškai** — tik markeriai, sprendimą priima admin.
3. **Admin /admin/verta-keliones → „Kryptys" tab:** diff'o rezultatai su mygtukais
   Patvirtinti / Ignoruoti / Užšaldyti.

> Sezoniškumas: daug krypčių (Madridas, Atėnai) skrenda tik vasarą. `is_active` + `last_seen_at`
> + galimas `season_months int[]` (vėliau) tai sutvarko, kad neviliotume bilietais ne sezonu.

---

## 4. Koncertų ingestija (AI scout + approve)

Pagrindinis principas (tavo): **tik top atlikėjai + festivaliai, AI siūlo, admin approvina.**
Nesunkinam — geriau mažiau, bet kokybiškai.

### 4.1 Šaltiniai (nuo pigiausio setup'o)

| Šaltinis | Apima | Kaip |
|---|---|---|
| **Wikipedia `Category:2026_concert_tours`** | Stambūs pasaulio turai (būtent ko reikia) | Parse'inam turų straipsnius → datų lentelės su miestais |
| **Ticketmaster Discovery API** (free tier) | EU arenų/stadionų koncertai, geri metaduomenys (miestas/šalis/data/atlikėjas/bilietai) | Užklausa pagal mūsų top atlikėjus arba pagal miestą iš krypčių sąrašo |
| **Bandsintown** | Per-atlikėjo turų datos | Užklausa tik mūsų prioritetiniams atlikėjams |
| **Festivalių sąrašas** (kuruojamas) | Open'er, Sziget, Lollapalooza Berlin, Roskilde, Orange Warsaw... | Mažas kuruojamas seed + metinis update |
| **Admin rankinis** | Ko nepagavo automatika | Forma /admin |

Pradžiai pakanka **Wikipedia turų + kuruojamų festivalių + Ticketmaster pagal miestą**. Tai
mažas, valdomas srautas — ne visa pasaulio koncertų DB.

### 4.2 Pipeline (savaitinis cron, AI scout)

```
1. FETCH   → Wiki 2026 tours + Ticketmaster(miestai iš travel_destinations) + festivalių seed
2. FILTER  → palik tik koncertus, kurių city/venue matchina travel_destinations
             (per city_aliases: Gdynia→Gdanskas, Roskilde→Kopenhaga, Wembley→Londonas...)
3. SCORE   → kiekvienam priskirk popularity (5 sk.). Atmesk < slenksčio (pvz. < 35),
             kad neužpiltų smulkmės. Festivaliai visada praeina.
4. DEDUPE  → dedupe_key = slug(artist)|city|date
5. ENRICH  → AI (Claude) sutvarko: artist_id rezolv (esamas `resolveArtist`), tour_name,
             trumpas LT „kodėl verta" sakinys, žanrai
6. QUEUE   → įrašom į abroad_event_candidates (status=pending)
7. NOTIFY  → admin'ui „N naujų kandidatų"
```

Admin /admin/verta-keliones → „Kandidatai": kortelė su Approve / Reject. Approve → `events`.
**Niekas viešai nematomas be approve.**

### 4.3 Kodėl AI tik „check + siūlo", o ne pilna automatika

Tu nori lengvai approvinti, ne prižiūrėti. AI daro juodą darbą (parse, match, score, LT tekstas),
žmogus tik spusteli. Tai tas pats modelis kaip esamas **news-scout** — reuse'inam pattern'ą
(`lib/ai-event-normalize.ts`, `events-extract.ts` jau egzistuoja).

---

## 5. Populiarumo balas (kuriuos koncertus rodyti)

Norim tik tų, kurie LT auditorijai įdomūs. Balas 0–100:

```
popularity =
    0.45 * artist_chart_score      // ar atlikėjas mūsų chartuose / topuose (LT/Global)
  + 0.25 * lt_engagement           // kiek LT vartotojų jį like'ina / seka / klauso
  + 0.20 * global_fame             // Wiki/streaming bendras žinomumas (proxy: ar turi Wiki turo psl.)
  + 0.10 * is_festival ? 1 : 0     // festivaliai turi bonusą (kelionės pretekstas savaime)
```

- `artist_chart_score` — iš jau esamos chartų sistemos (`charts`, konsensuso topai).
- `lt_engagement` — like'ai/follow'ai esamoje DB (artist popularity jau skaičiuojamas).
- Slenkstis: rodom tik `popularity >= 35` ARBA festivalį. Tai natūraliai išfiltruoja smulkmę,
  kaip ir prašei — „pagal populiarumą paskui filtruoti".

---

## 6. Kelionės kainos / lengvumo skaičiavimas

Kiekvienam radaro koncertui rodom **apytikslę visos kelionės kainą** (skaidru, „nuo"):

```
flight mode:  skrydis(roundtrip ≈ price_from × 2)  +  bilietas(est)  +  1 naktis(~€45)
car   mode:   kuras/autobusas(est pagal drive_hours)  +  bilietas(est)  +  0–1 naktis
```

- **v1:** `price_from` iš kuruojamo krypties sąrašo (statinis, „nuo €40"). Pakankamai gerai pirmai versijai.
- **v2 (vėliau):** prie konkretaus koncerto datos traukiam realią skrydžio kainą per flights API
  (Kiwi/Tequila ar pan.) → tiksli „€57 tą savaitgalį". Krypties sąrašas lieka bazė; API tik priskiria
  tikslią kainą datai.

`reach_ease` (rikiavimui) = funkcija nuo kainos + trukmės: mašina 3 val. > pigus skrydis > brangus skrydis su persėdimu.

---

## 7. Page'os UI (`/verta-keliones`)

Veikianti v1 jau pastatyta (seed duomenys). Struktūra:

1. **Header** — `Verta kelionės` + paantraštė, „Demonstraciniai duomenys" žyma kol nėra realaus pipeline.
2. **Kryptys juosta** (`travel_destinations`) — horizontali eilė čipų: `✈ Berlynas €40 · Ryanair` /
   `🚗 Ryga 3.5 val`. Parodo patį „pasiekiamų vietų" konceptą + veikia kaip filtras.
3. **Filtrai** — Būdas (Visi / ✈ Skrydžiu / 🚗 Mašina), Mėnuo, Kryptis, Rikiavimas
   (Artimiausi / Pigiausia kelionė / Populiariausi).
4. **Radaro kortelės** — kiekvienam koncertui:
   - Atlikėjas + (festivalio žyma) + žanrai
   - Miestas · šalis (vėliavėlė) · arena · data (LT formatas)
   - Pasiekiamumo badge: `✈ Pigus skrydis ~€40 (Ryanair VNO→WAW)` arba `🚗 ~6.5 val. iš Kauno`
   - **Apytikslė kelionės kaina** „nuo €175" (skrydis + bilietas + 1 naktis)
   - „Kodėl verta" 1 sakinys (AI)
   - Mygtukai: **Bilietai** (ticket_url) · **Kaip nuvykti**
5. **Tuščia būsena** krypčiai be koncertų: „Šioj kryptyje kol kas nieko — pridėk stebėjimą".

Dizainas pagal `PAGE_LAYOUT_RULES.md`: `.page-shell`, CSS kintamieji, **inline SVG (ne lucide)**,
žalia akcentinė `#10b981`. Mobile-first.

---

## 8. Įgyvendinimo fazės

- **F0 (DONE, ši sesija):** koncepcija + veikianti seed page'a (krypčių juosta, filtrai, kortelės,
  kelionės kaina) iš `lib/verta-keliones-seed.ts`. Vizualus proof-of-concept.
- **F1:** migracijos (`travel_destinations`, `events` stulpeliai, `abroad_event_candidates`) +
  page'a skaito iš DB; krypčių seed į DB.
- **F2:** AI scout cron (Wiki + festivaliai + Ticketmaster-by-city) → kandidatų eilė; admin approve UI.
- **F3:** krypčių route-diff cron (naujos/dingę maršrutai, flag'ai).
- **F4:** live skrydžių kainos prie datos (flights API); „sekti kryptį" notifikacijos vartotojams.

---

## 9. Atviri klausimai

- Flights API pasirinkimas F4 (Kiwi/Tequila vs Ryanair/Wizz unofficial) — kainų politika/limitai.
- Ar rodyti ir tolimesnes „verta" kryptis su persėdimu (Madridas, Lisabona), ar tik tiesioginiai skrydžiai? (dabar: tiesioginiai + drivable).
- Bendruomenės input: leisti vartotojams siūlyti koncertą („mačiau, kad X groja Y") → į tą pačią kandidatų eilę.

---
*Duomenų šaltiniai seed'ui: The Weeknd After Hours Til Dawn 2026 (Varšuva PGE Narodowy 08-04/05,
Stokholmas Strawberry Arena 08-08..10 — ticketnews/NME/Pollstar); Lollapalooza Berlin 07-18/19;
Open'er Gdynia 07-01..04; Roskilde 06-27..07-04; Ryanair/Wizz/airBaltic VNO/KUN/RIX maršrutai.
Kai kurios datos apytikslės — seed yra demonstracinis.*
