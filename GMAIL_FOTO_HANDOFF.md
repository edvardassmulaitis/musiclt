# Gmail foto + press release pipeline — Handoff
**Sesija:** 2026-05-18 (single intensive day, daug commit'ų)
**Status:** 90% veikia, 2 atviri klausimai laukia Edvardo veiksmų

---

## TL;DR — kas pasiekta

Pilnas Gmail press release → music.lt naujienos pipeline su foto, autorystės metadata, ir originalaus teksto preserve'inimu:

1. **Email attachment foto fetch** per Gmail API + EXIF metadata + Supabase Storage
2. **Press release passthrough** — Sonnet'as nebepertvarko teksto, naudojam original'ą
3. **.docx parsing** — pirmoji `<h1>` iš .docx tampa naujienos title
4. **Photographer credits** — iš EXIF, filename `_CREDIT_xxx`, ir body teksto (`Nuotrauka:`, `Foto:`, `Photo:`)
5. **Drive folder links** scan'inami į embed_urls
6. **Reject = HARD DELETE** (cascade trina news_candidate_images + Storage failus)
7. **YouTube Data API** enrichinami YT thumb'ai modal'e (title/channel/views/age)
8. **Graceful degradation** be Gmail OAuth credentials

---

## ⚠️ ATIDARYTI KLAUSIMAI — Edvardo veiksmai

### 1. GitHub Actions INTERNAL_CRON_TOKEN secret outdated → scout cron broken

Šios dienos rytą regeneravom Gmail OAuth setup'ui INTERNAL_CRON_TOKEN'ą Vercel'yje, bet GitHub repo `INTERNAL_CRON_TOKEN` secret liko su SENĄJU. Po šito **news-scout cron'as fail'ina** (401 Unauthorized), todėl negaunam naujų užsienio naujienų nuo gegužės 17 ryto.

**Fix:**
1. https://github.com/edvardassmulaitis/musiclt/settings/secrets/actions
2. Surask `INTERNAL_CRON_TOKEN` → Update
3. Įdėk dabar Vercel'yje esantį token'ą (žr. Vercel → musiclt → Settings → Environment Variables, nors UI maskina kaip Sensitive — token'as: `80ab561e7deac4dacbc7b76b03e5c941d8a7358b4e0570dd97549e4107f62016`)
4. Save
5. Actions tab → News scout → "Run workflow" → patvirtink kad žalia ✓

**Saugumo nota:** token'as buvo exposed chat'e. Jei rūpi, regeneruoti:
- Vercel env vars → INTERNAL_CRON_TOKEN → Edit → nauja reikšmė (`openssl rand -hex 32`)
- Update'ink Music.lt rebuild/.musiclt-env failą
- Update'ink GitHub Actions secret
- Redeploy Vercel

### 2. Gmail OAuth refresh token expires po 7 dienų (Testing mode)

Google Cloud Console OAuth consent screen yra **Testing mode** → refresh token'ai gyvena ~7 dienas. Po jų `oauth2/token` grąžins `invalid_grant`.

**Long-term fix variantai:**
- **A) Publish app** (Google Cloud Console → APIs & Services → OAuth consent screen → Publish App). Reikalauja basic info užpildymo + maybe verification dėl Gmail scope'ų. Po publish'o refresh token'ai NEEXPIRES'ina.
- **B) Manual refresh** kas savaitę — eik per OAuth Playground flow ir update'ink `GOOGLE_REFRESH_TOKEN` Vercel'yje. Tinka jei retas naudojimas.

Dabar token'as veiks iki ~2026-05-25.

---

## Pipeline architektūra

```
Gmail inbox (music.lt.naujienos@gmail.com)
    ↓
musiclt-inbox-triage (Cowork scheduled task, daily 09:00 LT)
    ↓ POST per /api/internal/gmail-ingest
gmail-ingest endpoint (app/api/internal/gmail-ingest/route.ts)
    ↓
1. Dedupe check (gmail_seen_messages table by thread_id)
2. Haiku classify (filter not_music, gauti category)
3. PASSTHROUGH (no Sonnet rewrite):
   - Try .docx attachment parse → use as title/body
   - Fallback: subject (cleaned) + raw_body (paragraph HTML)
   - Scan body for photographer credit (LT/EN patterns)
   - Scan for Drive links → embed_urls
   - Scan for artist names (top 500 atlikėjų substring)
4. Entity matching (matchArtists, matchTracks)
5. INSERT news_candidates
6. Image attachments via Gmail API:
   - getMessageAttachments(messageId) → image MIME filter (1KB-25MB)
   - getAttachmentBuffer per attachment
   - EXIF extract (photographer/copyright/year/caption)
   - Photographer fallback chain: EXIF → filename CREDIT_xxx → body text
   - Upload to Supabase Storage 'news-attachments' bucket
   - INSERT news_candidate_images rows
   - Update candidate.suggested_image_url to first image
7. SET attachments_checked_at = NOW() (skip backfill)
8. Mark gmail_seen_messages
    ↓
/admin/inbox UI
    ↓
- Auto-backfill on first session load (silent background)
- Force backfill DEBUG button (manual re-run)
- Cards show thumbnail strip su EXIF overlay
- Modal:
  - 📧 Press foto (su photographer/year/copyright)
  - 📸 Artist galleries
  - 🎬 YT thumbs (su Data API title/channel/views/age)
- Approve → news table insert
- Reject → HARD DELETE candidate + images + Storage files
```

---

## Failai / komponentai

### Nauji libs
- `lib/exif-extract.ts` — EXIF parse per exifr
- `lib/docx-extract.ts` — .docx parse per mammoth (pirma h1 + body HTML)
- `lib/extract-credits.ts` — body text photographer scan + filename CREDIT pattern + Drive links
- `lib/gmail-attachments.ts` — bendras processMessageAttachments helper (gmail-ingest + backfill shared)
- `lib/gmail-client.ts` — extended su getThread, getMessageAttachments, getAttachmentBuffer

### Endpoints
- `app/api/internal/gmail-ingest/route.ts` — passthrough + docx + attachments + credits
- `app/api/admin/news-candidates/[id]/route.ts` — reject=DELETE (cascade)
- `app/api/admin/news-candidates/[id]/images/route.ts` — modal picker su YT enrichment + email_attachment
- `app/api/admin/news-candidates/[id]/images/[imageId]/route.ts` — PATCH metadata + DELETE single
- `app/api/admin/news-candidates/backfill-gmail-attachments/route.ts` — bulk reprocess (force/clean params)
- `app/api/admin/news-candidates/route.ts` — list su attachments preview

### UI
- `app/admin/inbox/page.tsx` — auto-backfill effect, Force DEBUG button, thumb strip kortelėje, modal su email_attachment overlay
- `components/EditCandidateModal` — žinoma vidinė (modal'as page'e)

### Migracijos (aplikuotos)
- `20260518a_news_candidate_images.sql` — table + 'news-attachments' bucket + RLS policy
- `20260518b_news_candidates_backfill_flag.sql` — `attachments_checked_at` flag

### Scheduled task
- `~/Documents/Claude/Scheduled/musiclt-inbox-triage/SKILL.md` — env path = `Music.lt rebuild/.musiclt-env` (NOT `~/.musiclt-env` — sandbox neturi access)
- Schedule: daily 09:03 LT

### Env vars Vercel'yje (Sensitive)
- `INTERNAL_CRON_TOKEN` — bearer auth scout + gmail-ingest endpointams
- `GOOGLE_CLIENT_ID` — Gmail OAuth (music-lt project Google Cloud)
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN` — Music.lt Naujienos account, scope: gmail.readonly + gmail.modify
- `YOUTUBE_API_KEY` — egzistuojanti, YT thumb metadata
- Plius esami: NEXT_PUBLIC_SUPABASE_*, INTERNAL_API_SECRET, etc.

### GitHub Actions Secrets (TODO: update)
- `INTERNAL_CRON_TOKEN` — **šiuo metu STALE** (outdated po Vercel regen)
- `MUSICLT_BASE_URL` — `https://musiclt.vercel.app`

---

## Commits (chronologiškai)

```
56acda4 feat(gmail-ingest): image attachments su EXIF + reject=DELETE
89cb980 feat(gmail-ingest): backfill old attachments + YT thumb metadata
4ed4977 fix(gmail-attachments): /images endpoint shows email_attachment + auto-backfill
4e97533 fix(backfill): attachments_checked_at flag + diagnostics + 25MB size limit
2ae62e2 fix(backfill UI): force+clean params + no auto-reload + always-on detales
c1fe87a fix(backfill): graceful degradation be Gmail OAuth credentials
5107263 docs: GMAIL_OAUTH_SETUP.md — setup steps refresh token + 3 env vars
459213d feat(gmail-ingest): press release passthrough — neperrasinet title/body
0bf09f1 feat(gmail-ingest): docx press release attachment parser
ab09a19 feat(gmail-credits): photographer from body text + filename + Drive links
```

---

## Testavimas (žingsniai naujam thread'ui)

### A. Verify scout cron'as veikia po GH secret update
```bash
# Mac terminal'e (ne sandbox'e):
gh workflow run news-scout.yml --repo edvardassmulaitis/musiclt
# Po 2-3 min:
gh run list --workflow=news-scout.yml --limit 3
# Visi turi būti completed/success
```

### B. Verify Gmail ingest naujom naujienom
1. Persiusk sau press release email'ą su .docx + foto į music.lt.naujienos@gmail.com
2. Cowork sidebar → Scheduled → musiclt-inbox-triage → Run now
3. /admin/inbox → naujas kortelės su:
   - Title iš .docx (jei yra), ne email subject
   - Body iš .docx
   - Foto thumbs strip su photographer (iš EXIF / filename / body)
   - Embed urls su Drive linkais

### C. Backfill esamoms kortelėms
1. /admin/inbox → "📷 Force backfill Gmail foto (DEBUG)"
2. Rezultatas: scanned N · ✓ M foto pridėta
3. "👁 rodyti detales" → JSON detales per kortelę
4. "🔄 Atnaujinti sąrašą" → kortelės update'ina su foto

### D. Reject flow
1. Atmesti bet kurią kortelę su foto
2. Kortelė turi visiškai dingti (ne tik status='rejected')
3. Storage failai pašalinti (galima patikrint Supabase Dashboard → Storage → news-attachments)

---

## Žinomi limit'ai / future iterations

1. **Drive folder links** scan'inami į embed_urls, BET realiai foto neparsisiunčiamos. Adminas turi rankiniu būdu klikt linkUI'uje ir uploadinti per /admin/inbox modal. Galima ateičiai: add Drive API scope + auto-download public folder content.
2. **Body text photographer detection** — regex-based, gali pražiopsoti exotic'us formatus. Galima patobulint Sonnet'u jei reikia.
3. **DOCX su image'ais inline** — mammoth ignoruoja images. Jei .docx press release turi foto įterptas dokumente, jos neeksportuojamos. Workaround: foto turi būti atskirai attached.
4. **Refresh token 7-day expiry** Testing mode — žr. Atviri klausimai #2 aukščiau.
5. **News scout LT broken** — 15min/Bernardinai dropped, LRT/Delfi/foreign veikia per memory project_news_scout_stabilized_2026_05_15.md. Po GH secret fix paaiškės dabartinė būklė.
6. **YouTube quota** — 10k/day. Šiuo metu enrich'inam tik /images endpoint'e (~50 video meta per page open). Praktiškai unlimited.

---

## Memory file updates (siūloma)

Pridėti naują memory:
- `project_gmail_foto_pipeline_2026_05_18.md` — pilnas pipeline'as paviršiuje, blocked atviri klausimai (GH secret, OAuth publish)

Update'inti esamą:
- `project_gmail_attachments_2026_05_18.md` — pažymėt kaip "UNBLOCKED" (OAuth dirba), pridėti naują .docx parser + credits info

---

## Cost analysis

**Per Gmail kandidatas dabar:**
- 1 Haiku call (classify) — $0.0001-0.001
- 0 Sonnet calls (anksčiau buvo 1 per normalize)
- 0-15 Gmail API calls (attachments per email)
- 0-15 Supabase Storage uploads
- 0-15 EXIF extracts (local)
- 0-1 .docx parse (local)
- 1 INSERT news_candidates + N INSERTs news_candidate_images

**Sutaupymas vs. anksčiau:** ~90% mažiau AI costs (Sonnet drop).

**Per scout candidate** (kontekstui — nepakeitė): ~1 Sonnet, ~1 Haiku.

---

Sėkmės kitam thread'ui.
