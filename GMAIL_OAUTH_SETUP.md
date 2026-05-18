# Gmail OAuth setup — kad foto attachment fetch veiktų

## Kodėl reikia

Music.lt scheduled task'as `musiclt-inbox-triage` naudoja Cowork's Gmail MCP,
kuris **negali atsisiųsti attachment turinį** (tik metadata). Mūsų gmail-ingest
endpoint'as taip pat naudoja Gmail API direct call'us per OAuth refresh token,
kad gauti foto base64. Be šių 3 env vars:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`

Pipeline VEIKIA dėl naujienų ingestion (text/title/body), bet **foto attachments
nebus fetched** — kortelės bus be press release foto.

## Setup steps (~15 min, vienkartinis)

### 1. Google Cloud Console: enable Gmail API

1. https://console.cloud.google.com → pasirink/sukurk project (pvz. "music-lt")
2. **APIs & Services → Library** → search "Gmail API" → Enable

### 2. Create OAuth 2.0 Client ID

1. **APIs & Services → Credentials** → "+ Create Credentials" → "OAuth client ID"
2. Application type: **Web application**
3. Name: `music.lt server-side`
4. Authorized redirect URIs: pridėk `https://developers.google.com/oauthplayground`
5. Spustelėk Create → atsidaręs popup'ą rodo:
   - **Client ID** — copy (panašu į `123456-xyz.apps.googleusercontent.com`)
   - **Client secret** — copy (`GOCSPX-...`)

### 3. Authorize ir get refresh token

1. https://developers.google.com/oauthplayground
2. Spustelėk gear ikonėlę (top right) → "OAuth 2.0 configuration"
3. Check **"Use your own OAuth credentials"**
4. Įveski **OAuth Client ID** ir **OAuth Client secret** iš ankstesnio žingsnio
5. Close gear
6. Step 1 sąraše scroll'ink iki **Gmail API v1** → expand:
   - Check `https://www.googleapis.com/auth/gmail.readonly`
   - Check `https://www.googleapis.com/auth/gmail.modify` (jei reikia label apply)
7. Click **"Authorize APIs"** → naršyklėj atidarys Google login → pasirink `music.lt.naujienos@gmail.com` → Allow
8. Grįžęs į Playground, Step 2: spustelėk **"Exchange authorization code for tokens"**
9. Pamatysi **Refresh token** ir Access token. Copy **Refresh token** (panašu į `1//09...`)

### 4. Add 3 env vars Vercel'yje

1. Vercel Dashboard → musiclt → Settings → Environment Variables → "Add"
2. Pridėk po vieną:
   - `GOOGLE_CLIENT_ID` = (iš step 2)
   - `GOOGLE_CLIENT_SECRET` = (iš step 2)
   - `GOOGLE_REFRESH_TOKEN` = (iš step 3)
   - Pažymėk visus tris kaip **Sensitive**
   - Environments: **Production and Preview**

### 5. Redeploy

Settings → Environment Variables po pridėjimo Vercel paprašys redeploy. Spausk Redeploy → laukti ~2 min.

### 6. Verify

1. Atsidaryk `/admin/inbox` → hard refresh
2. Amber warning "Gmail OAuth credentials missing" turi DINGTI
3. Spaudi "📷 Force backfill Gmail foto (DEBUG)" → laukia kol baigs
4. "rodyti detales" → JSON neturi `"error": "Gmail credentials missing"` — vietoj jo turi būti `raw_count`, `image_count`, `details[]` su uploaded action'ais.
5. Senesnių Gmail kortelių (Phantom, Andrew Lloyd Webber etc.) thumbnails strip'as turi atsirast su EXIF metadata.

## Pastabos

- Refresh token long-lived (kol nepanaikinsi access per Google Account)
- Access token auto-refresh per server-side (cached 1h, refresh prieš expiry)
- Default Gmail Data API quota 1B units/day → praktiškai unlimited mūsų vartojimui
- Jei kažkada gausi 403 "invalid_grant" — refresh token revoke'intas, reikia pakartoti step 3 (kitos visos lieka)
