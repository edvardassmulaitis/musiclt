# Music.lt — SEO pasiūlymai naujam thread'ui (2026-07-09)

Šis dokumentas — perdavimas kitam pokalbio thread'ui. Ankstesniame thread'e (žr. `MUSICLT_HANDOFF_20260705.md` prieigoms/raktams) buvo atlikta pilna SEO analizė, bet **footer'io** dalis (trūkstami puslapiai + Organization JSON-LD) jau **sutvarkyta ir deploy'inta** (main @ `1f978253`+). Šis dokumentas apima **likusius, ne-footer** radinius — juos spręsti čia, naujame thread'e.

Repo: `edvardassmulaitis/musiclt`. Prieigos/env/deploy pastabos — žr. `MUSICLT_HANDOFF_20260705.md` (GitHub token, Supabase raktai, sandbox apribojimai, push komanda su `http.proxy=`).

---

## 🔴 Kritinis: domeno/canonical neatitikimas

**Patvirtinta faktais (2026-07-09):**
- `music.lt` / `www.music.lt` šiuo metu rodo **SENĄJĄ** PHP 5.6 svetainę ("Tavo muzikos pasaulis"), turinčią realų sukauptą SEO autoritetą — **Ahrefs Domain Rating 33**.
- Naujasis Next.js portalas gyvas tik `musiclt.vercel.app`.
- Visa naujo kodo SEO infrastruktūra — `app/layout.tsx:10` (`metadataBase`), `lib/artist-browse.ts:11` (`SITE_URL`), `sitemap.ts`, `robots.ts`, visi `canonical` tagai, visi JSON-LD `url` laukai — **hardkodina `https://music.lt`**, tarsi tai jau būtų gyvas produkcijos domenas. Patikrinta tiesiogiai `curl`: `musiclt.vercel.app/sitemap.xml` ir `/robots.txt` jau dabar rodo `https://music.lt/...` nuorodas.
- `musiclt.vercel.app` Ahrefs DR **93** yra klaidinantis — tai bendras `vercel.app` platformos (ne šio projekto) reitingas.

**Ką daryti:**
1. Prieš DNS perjungimą (`music.lt` → Vercel) sudaryti **pilną** senų URL → naujų URL 301 redirect žemėlapį. Dabartinis `middleware.ts:44-128` turi tik siaurą 2026 m. pervadinimų sąrašą (`/atradimai`, `/feed`, `/studija`, kelios kitos) — reikia atskiro senosios (pre-2026, ~1999–2010) URL schemos audito (Wayback Machine ar seno serverio access logs), kad neprarastumėte DR 33 backlink profilio.
2. Prieš perjungimą patvirtinti abu domenus Google Search Console, naudoti „Change of Address“ įrankį.
3. Kol domenas neperjungtas, apsvarstyti laikiną `SITE_URL`/`metadataBase` suderinimą su realiu live domenu arba `noindex` `vercel.app` versijai — šiuo metu esama konfigūracija rizikuoja signalo prieštaravimu, jei Google kada nors intensyviau apsilanko `vercel.app` adresu.

---

## Tier 1 — kiti kritiniai / dideli laimėjimai

1. **`app/HomeClient.tsx` (pagrindinis puslapis, ~4300 eil.) neturi nė vieno `<h1>`.** Svarbiausias svetainės puslapis be pagrindinio on-page SEO signalo.
2. **`app/page.tsx` neturi `metadata`/`generateMetadata` eksporto.** Paveldi bendrinį root title/description, be OG paveikslėlio, be canonical.
3. **Feed/homepage vaizdų optimizavimas.** 488 `<img>` vs 6 `next/image` panaudojimai visame projekte. `app/HomeClient.tsx` + `components/home/BendruomeneSection.tsx` — 36 `proxyImg()` iškvietimai be `width` parametro (žr. `lib/img-proxy.ts:41-54` vs `proxyImgResized()` `:69-81`, kuris jau turi `&w=`+webp, bet naudojamas tik 3 kituose failuose). Pilno dydžio, neoptimizuoti vaizdai tiesiogiai veikia LCP (Core Web Vitals ranking faktorius). **Greitas fix:** pereiti nuo `proxyImg()` prie `proxyImgResized()` (arba paduoti `width`) homepage/feed komponentuose.
4. **`app/dainos/[slugId]/page.tsx` neturi canonical/OG/Twitter apskritai** (`:46-63`) — tik title+description.
5. **`app/blogas/page.tsx` yra `'use client'`** → struktūriškai negali turėti `metadata` eksporto. Reikia arba iškelti metadata į server wrapper, arba perrašyti hub'ą serverio komponentu su atskiru client vidiniu.
6. **Canonical prieštaravimas: `/atlikejai?country=lt`.** `sitemap.ts:139` nurodo šį URL kaip atskirą (0.8 priority), bet `app/atlikejai/page.tsx:156-160` `generateMetadata` kanonizuoja atgal į bazinį `/atlikejai`, kai `country=lt` (default). Arba pašalinti šį įrašą iš sitemap, arba leisti jam self-canonicalize.

## Tier 2 — svarbu

7. `app/layout.tsx:11` neturi **title template'o** (`{ default, template }`) — kiekvienas puslapis rankiniu būdu prisega „— Music.lt“, rizikuojant nenuoseklumu.
8. Nėra numatytojo (fallback) OG/Twitter paveikslėlio visai svetainei.
9. Šriftai kraunami per `<link>` į `fonts.googleapis.com` (`app/layout.tsx:59-61`), ne per `next/font/google` — papildomas blokuojantis užklausimas + FOIT/FOUT rizika CLS/LCP. `next/font` self-host'ina + auto `preload`/`font-display:swap`.
10. Atlikėjo JSON-LD (`app/atlikejai/[slug]/page.tsx:1439-1462`, svarbiausias tipas, tūkstančiai puslapių) neturi `description` lauko (bio tekstas jau yra puslapyje — lengvai pridedama). Visoje svetainėje (išskyrus naujienas/topus) **nėra `BreadcrumbList`** structured data.
11. `VideoObject` (koncertų įrašai, `app/koncertu-irasai/[slug]/page.tsx`) neturi `duration` (nors `duration_seconds` yra DB) — lengvai pridedama. `uploadDate` kartais tuščias.
12. `app/albumai/[slugId]/page.tsx` neturi `alternates.canonical` apskritai. Keli sąrašo tipo puslapiai (albumai, dainos, koncertai, muzikos-stilius, topai) neturi `openGraph.images`.

## Tier 3 — verta apsvarstyti (ne skubu)

13. Platesnis `next/image` diegimas per visą projektą (per 480 `<img>` vietų) — palaipsninis refaktoringas.
14. „Susiję“/„Panašūs“ blokai (atlikėjų/dainų/albumų puslapiuose) — kiekvienas parašytas atskirai, be bendro komponento.
15. `/muzika` hub'o 3 iš 7 sitemap variantų (`/muzika`, `/muzika/lietuviska`, `/muzika/uzsienio`) iš dalies dubliuoja `/dabar` ir `/populiariausia` posluoksnių turinį — soft-duplicate rizika.
16. `app/atlikejai/[slug]/page.tsx:1100` hardkodina `https://music.lt` vietoje `SITE_URL` konstantos (tas pats pattern'as, kurį jau ištaisėme footer'yje `1f978253` commit'e — verta pritaikyti tą patį fix'ą čia).
17. `rel="prev"/"next"` puslapiavimas (`app/atlikejai/page.tsx:263-286`) — Google nuo 2019 nebenaudoja indeksavimui; patikrinti per Search Console, ar gilesni puslapiai atrandami.

## Kas jau tvarkinga (nereikia liesti)

- `robots.ts` teisingai blokuoja `/admin`, `/api/`, `/pokalbiai`, `/nustatymai`.
- `lib/news-jsonld.ts` — geriausiai realizuota structured data (NewsArticle, CollectionPage/ItemList, BreadcrumbList).
- Renginių/festivalių puslapiai — pilnas `MusicEvent`/`Festival` JSON-LD.
- Atlikėjo puslapio `metadata` (title/description/canonical/OG/Twitter) — geriausiai realizuota tarp visų tipų, tik trūksta JSON-LD `description` (žr. #10).
- `components/SiteHeader.tsx` naudoja tikrus `<Link>` — pilnai sekamą navigaciją.
- `next.config.js` `images.remotePatterns` sukonfigūruotas teisingai; problema yra `next/image` adopcijoje, ne konfigūracijoje.
- **Footer** (`components/SiteFooter.tsx`) — sutvarkytas ankstesniame thread'e: 4 nauji puslapiai (Apie mus/Kontaktai/Privatumo politika/Naudojimo sąlygos), semantiniai `<nav aria-label>`, Organization JSON-LD per `SITE_URL` (ne hardcode).

## Rekomenduojama tvarka

1. **Iš karto, nemokama, didelis poveikis:** #1 (homepage H1), #2 (homepage metadata), #6 (canonical prieštaravimas), #7 (title template).
2. **Šią/kitą savaitę:** #3 (feed vaizdų resize/webp), #4 (dainų puslapių metadata), #9 (`next/font`).
3. **Prieš planuojant domeno perjungimą:** 🔴 kritinis skyrius viršuje — didžiausia rizika esamam SEO pagrindui.
