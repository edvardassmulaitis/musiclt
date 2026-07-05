# Žaidimų zona v1+v2 — /zaidimai (2026-07-05)

## v2 papildymai (tos pačios dienos vakaras)

Research (Heardle/Spotle/Harmonies/songtrivia): jaunimą laiko dienos ritualas
(visiems tas pats iššūkis), share'inami emoji rezultatai, serijos, combo,
bendruomenės palyginimas. Pritaikyta:

- **Dienos iššūkis** (`/api/zaidimai/kvizas?kategorija=dienos`): date-seeded
  (`dailySeed()` iš LT datos), visiems identiški 10 raundų, ×2 taškai,
  1 užskaitytas bandymas/d. (kartojimai — treniruotė), „įveikei X% žaidusių",
  Wordle-share (emoji grid). Prefetch'inamas pick ekrane — startas be laukimo.
- **Combo**: 3+ teisingi iš eilės → +15/raundą (client ir server ta pati formulė).
- **Dvikovos**: „Tu su dauguma 🎯 / Prieš srovę 🦄" + serijos skaitliukas.
- **Vadybininkas**: strategijos žingsnis (saugi/subalansuota/rizika) +
  marketingo kampanija (TikTok/radijas, 10 tšk.) — modifikuoja simuliacijos
  tikimybes/amplitudes; pasirinkimai įeina į deterministinį seed'ą.
- **Master landing** `/zaidimai`: daily-first, max simple — dienos iššūkio hero
  su būsena, žaidimų eilutės su likusiais dienos taškais („dar gali surinkti
  ~N tšk."), šiandienos + visų laikų TOP 5.

Testuota production'e end-to-end (determinizmas tarp klientų, combo, ×2 XP,
1/d. cap, strategijų poveikis) — testiniai duomenys išvalyti.

---

Testuotojo įžvalgos realizacija: aktyvumo paskata per žaidimus ir taškus
(ne už įrašus/komentarus — spam'inantys nariai negauna pranašumo).
Įkvėpimas: songtrivia2.io (audio kvizas su laikrodžiu ir greičio taškais).

## Kas veikia

| Route | Žaidimas | Turinys | Taškai (XP) |
|---|---|---|---|
| `/zaidimai` | Hub'as + lyderių lentelė | boombox_streaks + game_scores | — |
| `/zaidimai/dainu-kvizas` | „Atspėk dainą": 10 raundų, YT ištrauka, 4 variantai, 15 s | **Dinamiškai** iš `tracks` (top pagal video_views, 4 kategorijos) — admin darbo nereikia | iki ~100/kvizą; pirmi 3 kvizai/d. |
| `/zaidimai/dvikovos` | Dvikovų archyvo balsavimas serijomis + bendruomenės % | `boombox_duel_drops` (visas ready archyvas) | 15/balsą, pirmi 10/d. |
| `/zaidimai/vadybininkas` | Muzikos vadybininkas: 3 realūs LT atlikėjai už 100 tšk. biudžetą → metų simuliacija | `artists` (score, score_trending, švieži релizai) | 10–90, pirmi 2/d. |
| `/boombox` | Dienos misijos (be pakeitimų, + nuoroda į /zaidimai) | eilė ATKURTA (žr. žemiau) | kaip buvo |

Nariai visur gauna ×1.5 taškų (kaip boombox'e). Anonimams veikia per
`ml_anon_id` cookie. Bendras balansas — `boombox_streaks.total_xp`
(istorinių taškų NEmigravom, kaip ir norėta — tęsiasi žaidimų sąskaita).

## DB

- **Nauja lentelė** `game_scores` (migracija `20260705_zaidimai_v1.sql`,
  JAU pritaikyta production DB per Supabase Management API): per-žaidimą
  rezultatai, dienos limitų skaičiavimas, rekordai. RLS: read viešas,
  write tik service role.
- **Boombox eilė atkurta**: senieji drop'ai buvo IŠTRINTI iš DB (image/duel/
  verdict = 0 eilučių; liko tik 35 completions). `scripts/seed-zaidimai-content.mjs`
  sugeneravo 80 dvikovų (40 LT + 40 foreign) + 7 verdiktus ta pačia logika
  kaip admin auto-generate. Image drops (atspėk iš AI vaizdo) neatkurti —
  jų vaizdai neegzistuoja; vietoj to „atspėk dainą" dabar AUDIO kvizas.

## Apsaugos / žinomi kompromisai (v1)

- Kvizo atsakymai pasirašyti HMAC token'ais (`NEXTAUTH_SECRET`), rezultatas
  skaičiuojamas server-side; BET teisingas atsakymas siunčiamas klientui
  greitam feedback'ui (kaip boombox'e) — techniškai įmanoma sukčiauti
  script'u. Žala apribota dienos limitais (3 kvizai × ~150 XP).
- Laiko matavimas (`ms`) — client-reported, clamp'inamas 0..15000.
- Dienos limitai skaičiuojami `+03:00` (vasaros laiku tikslu, žiemą ±1 h).
- YT autoplay: plain iframe pattern'as (žr. ChartYtPlayer) + „Negirdi?"
  remount mygtukas overlay'uje mobile fallback'ui.

## Kitiems thread'ams (galimi tęsiniai)

- Kvizo kategorijos pagal žanrą (`artist_genres` join) ir dešimtmetį.
- Multiplayer / dienos kvizas (visi tą pačią dieną — tie patys raundai, seed pagal datą).
- Vadybininko ilgas sezonas (savaitiniai realūs top40 duomenys, roster išsaugojimas).
- Admin puslapis game_scores peržiūrai (`/admin/zaidimai`).
- Lyderių lentelė pagal mėnesį (dabar all-time; game_scores turi created_at — lengva).
- Boombox verdiktų eilė trumpa (7) — pasibaigs po savaitės; galima kartoti
  seed skriptą arba sugeneruoti per admin UI.

## Pakeisti failai

Nauji: `lib/zaidimai.ts`, `app/zaidimai/*` (hub + 3 žaidimai),
`app/api/zaidimai/{kvizas,dvikovos,vadybininkas}/route.ts`,
`supabase/migrations/20260705_zaidimai_v1.sql`, `scripts/seed-zaidimai-content.mjs`.
Keisti: `app/pramogos/page.tsx` (tile'ai), `components/SiteHeader.tsx`
(match + mobile tile Boombox→Žaidimai), `app/boombox/BoomboxClient.tsx`
(nuoroda į /zaidimai).
