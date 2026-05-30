# External Charts + Scheduled Ingestion — planas

**Data:** 2026-05-31
**Statusas:** Phase 0 (UI + schema) padaryta šioje sesijoje. Phase 1+ laukia.
**Susiję failai:** `musiclt/app/topai/page.tsx`, `musiclt/supabase/migrations/20260531_external_charts.sql`, `musiclt/components/SiteHeader.tsx`

---

## 1. Tikslas

`/topai` — vienas hub'as visiems muzikos reitingams. **Core** lieka music.lt savaitiniai
**TOP 40** (pasaulinis) ir **LT TOP 30** (lietuviškas) — interaktyvūs, balsuojami, atskirti
vizualiai ir navigacijoje. Aplink juos — **read-only oficialūs/trečiųjų šalių topai**:
AGATA, Apple Music, Billboard, Official UK, TikTok, Spotify.

Scheduled task periodiškai nusiurbia tuos topus, įrašo į DB gražiam atvaizdavimui IR
(hibridiniu principu) papildo katalogą naujomis dainomis.

---

## 2. Architektūros sprendimas — kodėl atskira lentelė

Voting tops (`top_weeks` / `top_entries`) yra **interaktyvūs**: registered/anon balsų
splitas, `finalize_top_week` RPC, pozicijų lifecycle. Įkišus į ją išorinius topus
sumaišytume du visiškai skirtingus modelius.

Todėl — **atskira schema** (`external_charts` + `external_chart_entries`, žr. migraciją):

| Aspektas | Voting tops | External charts |
|---|---|---|
| Šaltinis | klausytojų balsai | išorinis API/scrape |
| Mutabilumas | live, kas balsą | snapshot per edition |
| Pozicijos | finalize RPC | tiesiai iš šaltinio |
| Track ryšys | privalomas track_id | nullable (light/hybrid match) |
| Archyvas | top_weeks per savaitę | `is_current=false` editions |

Vienas `is_current=true` edition per `(source, chart_key)` — užtikrina trigger'is
`trg_ext_chart_single_current`. Senos editions lieka archyvui.

---

## 3. Hibridinis song-creation modelis

Kiekvienas entry turi **RAW** laukus (`artist_name`, `title`, `cover_url` — visada
užpildyti) ir **RESOLVED** laukus (`track_id`, `artist_id`, `resolve_state`).

**Resolver pipeline** (po kiekvieno scrape, per entry):

1. **Normalizuoti** `artist_name` + `title` (lib `normalizeForMatch` — lower, nuimti
   feat./remix/() suffiksus, LT diakritikos fold).
2. **Match į katalogą:** `artists` (pavadinimo + alias lookup) → `tracks` (artist_id +
   title ilike / trigram). Jei tikslus → `track_id`, `resolve_state='matched'`.
3. **Šakojimasis pagal scope:**
   - **LT šaltiniai** (`scope='lt'`: agata, mama, radio) → jei nėra match IR atlikėjas
     LT (arba aukšta confidence, kad LT) → **AUTO-CREATE**:
     - `ensure_ghost_profile` / `createArtist` jei atlikėjo nėra (žr. memory
       `ghost-user-dedup`);
     - `POST /api/admin/tracks/quick-create` (title + artist_id + youtube_url) — tas
       pats endpoint'as kaip „Greitas pridėjimas". `resolve_state='created'`.
   - **Užsienio** (`scope='world'|'social'`) → **TIK light match**. Jei nėra → palikti
     `resolve_state='text_only'` (rodom artist_name/title + Apple artwork). **Nekuriam**
     track'ų — kitaip katalogą užterštų vienadienės užsienio dainos.
4. **Ambiguous** (keli kandidatai / žemas confidence) → `resolve_state='ambiguous'` →
   į **admin review queue** (`/admin/charts`), žmogus patvirtina match arba create.

> **Saugiklis (memory `backfill-regression`):** auto-create vykdom tik kai aukšta
> confidence; abejojant — geriau `text_only`/`ambiguous` nei klaidingas track'as.

---

## 4. Šaltiniai — feasibility ir prioritetai

### Tier 1 — daryti pirma (legalu, švaru, didelė vertė)

**AGATA — `https://www.agata.lt/lt/naujienos/sNN-X/`** ⭐
- Savaitinis **Singlų TOP 100** + **Albumų TOP 100**. Švarios HTML lentelės:
  `Vieta | Praeitą savaitę | Savaičių tope | Atlikėjas/grupė | Pavadinimas`.
- **Eksplicitiškai leidžia naudoti nurodant šaltinį** („Šią informaciją galite naudoti
  savo reikmėms nurodydami šaltinį"). LT atlikėjai paryškinti → galim detektuoti LT.
- Parser: httpx + selectolax (esamas stack), 2 lentelės per puslapį. URL discovery:
  „Savaitės klausomiausi" nuoroda veda į naujausią; savaitės nr. = ISO week.
- **Auto-create LT dainoms** (scope=lt). Geriausias LT šaltinis.

**Apple Music RSS — `https://rss.applemarketingtools.com/api/v2/{country}/music/most-played/{n}/songs.json`** ⭐
- Viešas, **be auth**, atnaujinamas kasdien, JSON. Per entry: rank, title, artist,
  artwork, genres, Apple Music link. Šalys: `lt`, `gb`, `us`, ... (ISO alpha-2).
- LT (`lt`) → scope=lt; GB/US → scope=world. Artwork → cover_url.
- Švariausias užsienio šaltinis. Jokios scrape rizikos.

### Tier 2 — antra (web scrape, ToS atsargumas)

**Billboard — `billboard.com/charts/{hot-100|billboard-global-200|tiktok-billboard-top-50}/`**
- Public HTML, scrapeable (pozicija, prev, title, artist). **TikTok Billboard Top 50** =
  geriausias švarus TikTok-trendų proxy (oficialaus TikTok chart API nėra).
- ToS riboja masinį reuse → laikom **faktinius duomenis** (pozicijos, attribution
  „Billboard"), be turinio kopijavimo; nuoroda į šaltinį.

**Official Charts UK — `officialcharts.com/charts/singles-chart/`**
- Public HTML. Savaitinis. Scrapeable. ToS panašiai riboja → tas pats principas:
  faktinės pozicijos + attribution + šaltinio nuoroda.

### Tier 3 — vėliau / sąlyginiai

**Spotify Charts — `charts.spotify.com`** (Regional Top 50, Viral 50)
- Nuo ~2023 **gated** (reikia login; CSV download). Viešo API nebėra. Reikės arba
  prisijungimo flow, arba trečios šalies agregatoriaus → **atidedam**, kol patvirtinsim
  patikimą prieigą. Iki tol UI rodo „Netrukus".

**M.A.M.A** — apdovanojimai, ne savaitinis chart → veikiau į `/apdovanojimai` (jau yra
awards sistema, memory `awards-system`). Galim padaryti „M.A.M.A nominacijų" snapshot,
bet tai ne weekly ingestion.

**Radijo stotys (M-1, ZIP FM, Lietus)** — kiekviena stotis atskiras scrape, formatai
nevienodi, dalis be viešo top. **Didelis darbas, maža grąža** → paskutinis prioritetas.

---

## 5. Scheduled task — architektūra

**Sprendimas (memory `cowork-scheduled-tasks`):** agentinis recurring task per **Cowork
scheduled tasks** (credits iš sub'o, ne API budget), o ne HTTP cron.

**Du cadence:**

| Task | Cadence | Šaltiniai |
|---|---|---|
| `musiclt-charts-weekly` | Pirmadienis ~09:00 | AGATA singlai+albumai, Official UK, Billboard Hot100/Global200, TikTok Top50 |
| `musiclt-charts-daily` | Kasdien ~07:00 | Apple Music RSS (lt, gb, us) |

**Ingestion logika gyvena Next.js route'uose** (server-side, testuojama, reusable
admin „Atnaujinti dabar" mygtukui):

```
POST /api/admin/charts/ingest   body: { source, chart_key }
  1. fetch + parse (per-source parser lib/charts/<source>.ts)
  2. upsert external_charts (naujas edition, is_current=true)
  3. insert external_chart_entries (RAW)
  4. resolver: match → (LT) auto-create → ambiguous queue
  5. revalidateTag('topai')  // /topai dynamic, bet cache invalidation news/home pavyzdžiu
```

Scheduled task tik **trigerina** route'us (arba paleidžia `scraper/ingest_charts.py`
orchestratorių). Privalumas: tas pats kelias veikia ir automatiškai, ir rankiniu
admin refresh.

> **Sandbox limitas (memory `sandbox-limits`):** <45s bash. Apple RSS = 1 JSON fetch
> (greita); AGATA = 2 puslapiai; Billboard/UK = po 1. Suskaidžius per-source — telpa.
> Sunkų darbą (resolver per 100+ entries) daryti route handler'yje (Vercel), ne sandbox'e.

---

## 6. UI — kas jau padaryta (Phase 0)

`/topai` perdarytas pagal homepage dizainą (Outfit headings, 1280px, hp-card tokens,
accent spalvos):

- **Pagrindiniai topai** — TOP 40 + LT TOP 30 kaip dideli highlight kortelės su live
  mini-sąrašais (esami `top_weeks` duomenys).
- **Lietuvos / Pasaulio / Trendai** sekcijos — `ExtCard` skaito `external_charts`
  (`getExternalCharts()` defensive — tuščia/klaida → `[]`). Kol duomenų nėra, rodo
  „Netrukus" placeholder su šaltinio attribution. **Po ingestion atgyja automatiškai.**
- **Navigacija** (`SiteHeader`): topai dropdown ir mobile — TOP 40 / LT TOP 30 iškelti
  kaip „Pagrindiniai topai", žemiau „Visi topai / AGATA, Billboard, Apple, UK".
- **Daugiau** — apdovanojimai, balsavimai, dienos daina + soon plytelės.

`PLANNED` masyvas faile = placeholder katalogas; kai ingestion įrašo tą patį
`source+chart_key`, `mergePlanned()` perjungia į live.

---

## 7. Roadmap

- [x] **Phase 0** — schema migracija + `/topai` UI + nav highlight (ši sesija)
- [ ] **Phase 1** — AGATA parser (`lib/charts/agata.ts`) + ingest route + resolver +
      LT auto-create. **Aukščiausia vertė, pradėti čia.**
- [ ] **Phase 2** — Apple Music RSS (lt/gb/us) reference charts.
- [ ] **Phase 3** — Billboard (Hot100, Global200, TikTok50) + Official UK.
- [ ] **Phase 4** — admin `/admin/charts` review queue (ambiguous) + „refresh now".
- [ ] **Phase 5** — Cowork scheduled tasks (`weekly` + `daily`) prijungimas.
- [ ] **Phase 6** (opt.) — Spotify (jei prieiga), radijo, M.A.M.A snapshot.

---

## 8. Ką Edvardui paleisti

1. **Aplikuoti migraciją** `20260531_external_charts.sql` (per Supabase Management API,
   memory `supabase-direct-sql`).
2. Patvirtinti Phase 1 (AGATA) — tada statau parser + ingest + resolver.
3. Sprendimas dėl auto-create agresyvumo: ar LT atlikėjams kurti iškart, ar pirma per
   review queue (saugiau pradžioje).
