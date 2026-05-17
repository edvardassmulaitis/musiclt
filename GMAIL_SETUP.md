# Gmail polling setup

Tikslas: leisti music.lt'ui automatiškai pasiimti press release laiškus iš jūsų Gmail inbox'o ir prastumti per news scout pipeline'ą (Haiku klasifikatorius → Sonnet normalize → news_candidates).

## Pipeline'as

```
Gmail inbox (is:unread -label:music-press-imported)
  └─> 2x/d cron (09:00 / 21:00 UTC)
       └─> /api/internal/gmail-poll
            ├─ filter sender'į (noreply/google/facebook/spotify/... ignore)
            ├─ filter body length (<100 chars → skip)
            ├─ POST → /api/internal/gmail-ingest (Haiku+Sonnet pipeline)
            └─ label 'music-press-imported' + mark read
                └─> news_candidates → /admin/inbox
```

## Vienkartinis OAuth setup'as (~15 min)

### 1. Google Cloud Console

1. Eik į https://console.cloud.google.com/
2. Sukurk naują projektą arba pasirink existing'ą (pvz. "musiclt-gmail-poll")
3. APIs & Services → Library → ieškok "Gmail API" → **Enable**

### 2. OAuth Consent Screen

1. APIs & Services → OAuth consent screen
2. User Type: **External** (jeigu nesi Workspace org'e)
3. App name: "music.lt press inbox" (arba kažkas panašaus)
4. User support email: tavo email
5. Developer contact: tavo email
6. Scopes → Add or Remove Scopes → pridėk:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.modify`
7. Test users → pridėk savo Gmail address'ą
8. Save and continue

### 3. OAuth Client ID

1. APIs & Services → Credentials → Create Credentials → **OAuth client ID**
2. Application type: **Web application**
3. Name: "musiclt gmail poll"
4. Authorized redirect URIs:
   - `https://developers.google.com/oauthplayground`
5. Create
6. **Nukopijuok Client ID + Client Secret** — jų reikės žemiau

### 4. Refresh token per OAuth Playground

1. Eik į https://developers.google.com/oauthplayground/
2. Spustelėk ⚙️ (Settings) viršuje dešinėje:
   - ✅ **Use your own OAuth credentials**
   - OAuth Client ID: (iš step 3)
   - OAuth Client secret: (iš step 3)
3. Step 1 (Select & authorize APIs) — kairėje sąraše ieškok "Gmail API v1":
   - ✅ `https://www.googleapis.com/auth/gmail.readonly`
   - ✅ `https://www.googleapis.com/auth/gmail.modify`
4. Spustelėk **Authorize APIs** → prisijunk su savo Gmail → Allow
5. Step 2 (Exchange authorization code for tokens) — spustelėk **Exchange authorization code for tokens**
6. **Nukopijuok Refresh token** — jis prasideda `1//0...` (long string)

### 5. Vercel env vars

Vercel Dashboard → musiclt project → Settings → Environment Variables:

```
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_REFRESH_TOKEN=1//0...
```

Visus 3 — **Production + Preview + Development** scope.

Po pridėjimo: **Redeploy** production'ą (Settings → Deployments → ... → Redeploy).

### 6. Test'as

Iš command line:

```bash
curl -X POST "https://musiclt.vercel.app/api/internal/gmail-poll" \
  -H "Authorization: Bearer $INTERNAL_CRON_TOKEN"
```

Tikiesi atsako tipo:

```json
{
  "ok": true,
  "summary": {
    "fetched": 3,
    "skipped_blocked": 1,
    "posted": 2,
    "rejected_by_ingest": 0,
    "errors": 0,
    "error_details": []
  }
}
```

Jeigu `fetched=0` — visi laiškai jau perskaityti arba label'inti. Pasiųsk pats sau test laišką su tekstu (~200 char) iš ne-blocklist'inio sender'io ir bandyk vėl.

## Daily ops

- **Kada gauni press release** — tiesiog palik laišką inbox'e (unread). Cron'as paims per 12h.
- **Jei nori greičiau** — eik į GitHub Actions → "Gmail poll" workflow → "Run workflow" (manual trigger).
- **Label'iuotų laiškų** Gmail UI'uje: ieškok `label:music-press-imported`. Galima archyvuoti / trinti — pipeline'as to nebepamatys (filtras `-label:music-press-imported`).

## Sender blocklist'as

Default'inis filter'is yra `lib/gmail-client.ts` ekspoze'intas `gmail-poll/route.ts` faile (`SENDER_BLOCKLIST` array). Ignore'uojam:

- `noreply@`, `no-reply@`, `donotreply@`
- `@accounts.google.com`, `@google.com`
- `@facebookmail.com`, `@instagram.com`, `@spotify.com`, `@apple.com`
- `security@`, `support@`, `notification@`, `newsletter@`
- bet kas su žodžiu `unsubscribe`

Jeigu legitimate PR firma siunčia iš `press@reallyimportantlabel.com`, taip pat jokio block'o nebus. Jei nori specifiškiau filter'inti — pridėk regex'ą į `SENDER_BLOCKLIST` (`app/api/internal/gmail-poll/route.ts`).

## Tikrinimas po setup'o

1. **Vercel function log'ai** — Vercel Dashboard → Functions → `/api/internal/gmail-poll` — žiūrėk timestamp'us.
2. **/admin/inbox** — naujos kortelės su `source: gmail` (pažymėti header'yje).
3. **GitHub Actions** → "Gmail poll" — kiekvieno run'o ::notice eilutės su `fetched=X posted=Y`.

## Refresh token'o gyvenimo ciklas

Refresh token'ai galioja kol:
- Vartotojas tiesiogiai panaikina prieigą (myaccount.google.com → Security → Third-party access)
- Token nenaudojamas 6 mėn (laikinas — bet cron'as 2x/d, problemos nebus)
- Slaptažodis pasikeičia (force re-auth)

Jeigu kada nors `gmail-poll` grąžins `503 Gmail OAuth refresh failed` — kartok step 4 (OAuth Playground), gauk naują refresh_token ir update'ink Vercel env.

## Troubleshooting

| Klaida | Priežastis | Fix |
|---|---|---|
| `503 INTERNAL_CRON_TOKEN not configured` | Env var nenustatytas | Vercel env vars → INTERNAL_CRON_TOKEN |
| `401 Unauthorized` | Curl Bearer netinkamas | Patikrink token reikšmę |
| `503 Gmail credentials missing` | GOOGLE_* env vars trūksta | Step 5 |
| `503 Gmail OAuth refresh failed: 400` | Refresh token invalid/revoked | Step 4 iš naujo |
| `fetched=0` visada | Visi laiškai jau label'inti, arba inbox'as tuščias | Pasiųsk sau test laišką |
| `posted=0, errors>0` | gmail-ingest endpoint'as gražina klaidą | Žiūrėk Vercel function log'us /api/internal/gmail-ingest |
