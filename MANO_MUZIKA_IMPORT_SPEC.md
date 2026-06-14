# Mano muzika — importo iš Spotify ir kitų platformų SPEC

Statusas: **tyrimas + rekomendacija** (2026-06-15). Importas dar NEįgyvendintas —
šis dokumentas yra sprendimo pagrindas. Bazinis „Mano muzika" valdymas
(`/mano-muzika`) jau pastatytas; importas prisijungtų kaip atskira „Importas"
sekcija/tab'as su preview → patvirtinimas → `addFavorite()` bulk įdėjimu.

---

## TL;DR rekomendacija

1. **Pradėk nuo Last.fm username importo** — geriausias pastangų/naudos santykis.
   Nereikia per-user OAuth, nemokamas API key, rezultatai akimirksniu.
2. **Antra — Spotify „Download your data" failo įkėlimas** (`YourLibrary.json`).
   Pilna kokybė, jokių API kvotų, bet vartotojui reikia palaukti ~1 parą ir
   įkelti failą.
3. **Spotify OAuth („Connect Spotify" mygtukas) — NEREKOMENDUOJAMA** kaip viešas
   feature. 2026 m. vasarį Spotify smarkiai apribojo Web API (žr. žemiau) —
   viešai onboardinti narių praktiškai nebeįmanoma.
4. Apple Music ir YouTube Music — žema prioritetė (didelė trintis / prasta
   atitiktis).

---

## Kodėl Spotify OAuth nebetinka viešam feature'ui

Spotify 2025–2026 m. iš esmės uždarė Web API smulkiems / nepatvirtintiems app'ams:

- **Development mode**: nuo 2026-02 ribojama iki **5 test vartotojų**, ir jie
  privalo turėti **Premium** paskyras. (Anksčiau buvo 25.)
- **Extended quota** (reikalinga viešam app'ui su daugiau nei keliais
  vartotojais): nuo 2025-05 reikalauja **legaliai registruoto verslo**,
  **250 000 mėnesinių aktyvių vartotojų**, prieinamumo „key markets" ir aktyvaus
  paleisto serviso. Jau patvirtinti app'ai lieka veikti, nauji — vargu.
- Be to, 2024-11 deprekuoti keli endpoint'ai (audio-features, recommendations,
  related-artists, 30s preview naujiems app'ams).

Išvada: `user-top-read` (top atlikėjai/dainos) ir `user-library-read` (išsaugoti
albumai/dainos) endpoint'ai techniškai egzistuoja, bet **music.lt negalės jų
naudoti viešai**, nes nepraeis 250k MAU kvotos kriterijaus, o dev mode telpa tik
5 testeriai. Tinka nebent: (a) admin-side eksperimentui, (b) jei music.lt kada
nors kvalifikuotųsi extended quota.

Šaltiniai:
- [Spotify: Updating the Criteria for Web API Extended Access (2025-04-15)](https://developer.spotify.com/blog/2025-04-15-updating-the-criteria-for-web-api-extended-access)
- [TechCrunch: Spotify changes developer mode API to require premium accounts, limits test users (2026-02-06)](https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/)
- [Spotify community: Updating the Criteria for Web API Extended Access](https://community.spotify.com/t5/Spotify-for-Developers/Updating-the-Criteria-for-Web-API-Extended-Access/td-p/6920661)

---

## Variantų palyginimas

| Variantas | Ką gaunam | Per-user OAuth | Trintis vartotojui | Kvotų rizika | Atitiktis music.lt bazei | Verdiktas |
|---|---|---|---|---|---|---|
| **Last.fm username** | Top atlikėjai/dainos/albumai + „loved" | ❌ (tik username) | Labai maža (įvedi username) | Žema (nemokamas key) | Gerai (pavadinimų match) | ✅ **1 prioritetas** |
| **Spotify data export (failas)** | Išsaugoti atlikėjai/dainos/albumai + playlistai | ❌ (failo įkėlimas) | Vidutinė (laukti ~1 d. + įkelti) | Nėra | Geriausia (ISRC/URI) | ✅ **2 prioritetas** |
| **Spotify OAuth** | Top + library tiesiogiai | ✅ | Maža (1 click) | **Kritinė** (5 user limit) | Geriausia | ❌ Neviešam |
| **Spotify public playlist link** | Vienas playlistas (jei viešas) | ❌ | Maža | oEmbed ribotas; scrape = ToS rizika | Vidutinė | ⚠️ Tik fallback |
| **Apple Music (MusicKit)** | Library, playlistai | ✅ (Music user token) | Didelė (reikia Apple paskyros) | Reikia mokamo Apple Developer | Vidutinė | 🔻 Žema |
| **YouTube Data API** | Liked videos, playlistai | ✅ | Vidutinė | Dienos kvota, bet OK | Prasta (video→artist triukšmas) | 🔻 Žema |

---

## 1 prioritetas — Last.fm username importas

**Kodėl geriausias:** Last.fm API atiduoda VIEŠUS user duomenis tik pagal username
— jokio per-user OAuth, vienas serverinis API key visiems. Rezultatai akimirksniu.

**Endpoint'ai** (REST, `method=...&user=...&api_key=...&format=json`):
- `user.getTopArtists` — top atlikėjai + playcount (period: overall/7day/.../12month)
- `user.getTopTracks` — top dainos + playcount
- `user.getTopAlbums` — top albumai
- `user.getLovedTracks` — „pamėgtos" dainos (švariausias signalas mėgstamoms)

**Srautas:**
1. Vartotojas `/mano-muzika` → „Importas" → įveda Last.fm username.
2. Serveris fetch'ina top + loved (pora puslapių, ~50–100 įrašų).
3. Match į music.lt bazę per esamą `lib/search-core.ts` (norm + trigram + compound).
4. Preview ekranas: „Rasta 42 / 60" — atitikti rodomi su cover, neatitikti
   sąraše atskirai (galima praleisti arba pranešti admin'ui).
5. Vartotojas pažymi, ką įdėti → bulk `addFavorite('artist'|'track'|'album', id)`.
   Playcount → `weight` (populiarumo svoris), top N → `is_featured`.

**Rizikos:** Last.fm pavadinimai gali nesutapti su music.lt (diakritikai, feat.,
transliteracijos) — bet `search-core.ts` jau tam pritaikytas. LT atlikėjams
atitiktis bus gera, užsienio — irgi (music.lt turi pasaulinę bazę).

Šaltinis: [Last.fm API (user.getTopArtists, getLovedTracks)](https://www.last.fm/api)

---

## 2 prioritetas — Spotify „Download your data" failo įkėlimas

**Kodėl:** apeina visas API kvotas — vartotojas pats parsisiunčia savo duomenis
iš Spotify privatumo nustatymų ir įkelia JSON. Pilniausias signalas (ISRC/URI).

**Ką ima vartotojas:** Spotify → Account privacy → „Download your data" →
**Account Data** paketas (~1 para). Jame:
- `YourLibrary.json` — išsaugoti **atlikėjai, albumai, dainos** (su Spotify URI).
- `Playlist1.json` — playlistų dainos.
(Extended Streaming History — pilna klausymų istorija su playcount — ateina
lėčiau, iki ~30 d.; mums nebūtina pirmai versijai.)

**Srautas:**
1. „Importas" → „Įkelti Spotify failą" → drag&drop `YourLibrary.json`.
2. Parse client- arba server-side (tik JSON, jokio API).
3. Match per `search-core.ts` (geriau — per ISRC/pavadinimą+atlikėją).
4. Preview → patvirtinimas → bulk `addFavorite`.

**Rizikos:** vartotojui reikia palaukti parą ir suprasti, kaip parsisiųsti
(reikės aiškios instrukcijos su screenshotais). Match — ISRC jei music.lt turi,
kitaip pavadinimas+atlikėjas.

Šaltiniai:
- [Spotify: Understanding your data](https://support.spotify.com/us/article/understanding-your-data/)
- [Guide: export Spotify data (YourLibrary.json / Streaming History)](https://support.stats.fm/docs/import/spotify-import/)

---

## Bendra importo architektūra (visiems šaltiniams)

Vienas pipeline, keli „source adapter'iai":

```
[source adapter] → raw items[]  →  [matcher: search-core.ts]  →  staged items[]
   (lastfm | spotify-file | …)        (name/ISRC → entity id)      (matched/unmatched)
                                                                          │
                                                   [preview UI] ── vartotojas patvirtina
                                                                          │
                                              bulk addFavorite() → profile_favorite_*
```

**Siūloma staging lentelė** (kad importas būtų atstatomas ir auditojamas):

```sql
CREATE TABLE public.music_imports (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source      TEXT NOT NULL,              -- 'lastfm' | 'spotify_file' | …
  kind        TEXT NOT NULL,              -- 'artist' | 'album' | 'track'
  raw_name    TEXT NOT NULL,              -- originalas iš šaltinio
  raw_artist  TEXT,                       -- dainoms/albumams
  raw_meta    JSONB,                      -- playcount, uri, isrc, loved…
  matched_id  BIGINT,                     -- music.lt entity id (NULL = neatpažinta)
  match_score NUMERIC,
  status      TEXT NOT NULL DEFAULT 'pending', -- pending|imported|skipped|unmatched
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Neatpažinti įrašai → galima rinkti kaip „missing reports" (kaip jau daroma
`/muzikos-atradimai` modulyje) — signalas, ką dar reikia importuoti į bazę.

**API skeletas** (prisijungtų prie esamo `/api/mano-muzika/*`):
- `POST /api/mano-muzika/import/lastfm`  `{ username }` → fetch + match → staged preview
- `POST /api/mano-muzika/import/spotify-file` `{ file }` → parse + match → staged preview
- `POST /api/mano-muzika/import/commit` `{ import_ids[], as_featured_top? }` → bulk addFavorite

**UI:** `/mano-muzika` naujas tab'as „Importas" → šaltinio pasirinkimas →
preview (matched su cover + checkbox; unmatched atskirai) → „Importuoti N".
Tinka panaudoti tą patį žaismingą stilių kaip onboarding (`/mano-muzika/pradzia`).

---

## Apple Music ir YouTube (žema prioritetė)

- **Apple Music / MusicKit:** reikia mokamo Apple Developer ($99/m) developer
  token'o + per-user Music user token (MusicKit JS). Library skaitymas galimas,
  bet trintis didelė ir auditorija LT kontekste maža. Atidėti.
- **YouTube Data API v3:** gali skaityti „liked videos" ir playlistus su OAuth.
  Problema — video → atlikėjo/dainos mapping'as triukšmingas (klipai, kaverių,
  „topic" kanalai). Galimas vėliau kaip „bonus", ne pirmas.

---

## Etapai (siūlymas)

- **F1 — Last.fm importas** (1 šaltinis, matcher, preview, commit). MVP.
- **F2 — Spotify failo įkėlimas** (`YourLibrary.json` parse + ISRC match).
- **F3 — `music_imports` staging + unmatched → missing reports** (auditas).
- **F4 — (sąlyginai) Spotify OAuth** TIK jei music.lt gautų extended quota, arba
  admin-only įrankis. Kitaip — praleisti.
