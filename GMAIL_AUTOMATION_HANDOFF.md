# Gmail automation — handoff

**Sesija:** 2026-05-15 → 2026-05-17
**Status:** Phase 1a (inbox triage) deployed; Phase 1b (outbound) atidėtas
**Next session:** start nuo "Pending steps" sekcijos žemiau

---

## Architektūros sprendimas

Du keliai svarstyti:

| | GitHub Actions cron | Cowork scheduled task |
|---|---|---|
| Setup | 15 min OAuth (Google Cloud + Vercel env) | 30 s |
| Cost/run | ~$0.0005 (Haiku direct API) | ~$0.05-0.20 (Claude session credits) |
| Cost source | Anthropic API budget | Cowork sub (monthly įmoka) |
| Reliability | Bullet-proof | Research preview |
| Smart logic | Reikia code'inti | Agent reasoning |
| Atlikėjų korespondencijos potencialas | Mažas | Didelis (long-term tikslas) |

**Pasirinkimas:** Cowork scheduled tasks, nes:
1. Edvardas turi Anthropic sub'ą — credits ima iš ten, ne iš API budget'o (kuris vakar nukrito į $0)
2. Long-term tikslas: agentinis Gmail handler, kuris ras-rašys su LT atlikėjais
3. Gmail MCP jau prijungtas — jokio OAuth setup'o nereikia inbound'ui

**GH Actions cron'as palieka kaip backup'as** — `/api/internal/gmail-poll` endpoint'as + workflow veikia. Abu naudoja `-label:music-press-imported` filter'į, tad dubliavimo nebus. Kai scheduled task'as patvirtina stabilumą (1-2 sav.), galim deactivate GH cron'ą.

## Phase 1a — Inbox triage (deployed)

**Scheduled task:** `musiclt-inbox-triage`
**Schedule:** kasdien 09:00 Vilniaus laiku
**File:** `/Users/edvardas_s/Documents/Claude/Scheduled/musiclt-inbox-triage/SKILL.md`

**Ką daro:**

1. Skaito `~/.musiclt-env` (token + base URL)
2. Užtikrina Gmail labels: `music-press-imported`, `music-needs-reply`
3. `search_threads('is:unread in:inbox -label:music-press-imported', max=10)`
4. Per thread:
   - Filter automated senders (noreply, google, facebook, spotify, security@, etc.)
   - Filter trumpą body (<100 chars)
   - **Klasifikuoja** (press release / artist outreach / fan mail / spam)
   - Press release → POST į `/api/internal/gmail-ingest` → news_candidates pipeline
   - Artist outreach → label `music-needs-reply` (Edvardas pamatys, atsakys)
   - Fan / spam → tik mark processed
5. Visiems pridedamas `music-press-imported` + pašalinamas UNREAD
6. Galutinis summary su counters

## Files pushed šitoje sesijoje

| File | Commit | Description |
|---|---|---|
| `lib/gmail-client.ts` | `8bb8ea2` | Gmail API OAuth refresh token client |
| `app/api/internal/gmail-poll/route.ts` | `8bb8ea2` | Cron endpoint (fallback) |
| `.github/workflows/gmail-poll.yml` | `8bb8ea2` | GH Actions 2x/d cron (fallback) |
| `GMAIL_SETUP.md` | `69f8cf1` | OAuth setup guide (jei reikės grįžti į GH path) |

**Scheduled task SKILL.md** — local only, ne git'e (Cowork tools managina).

---

## ⚠️ Pending steps Edvardui (būtini prieš veikiant)

### 1. `~/.musiclt-env` failo fix

**Problema:** screenshot'e matėsi, kad failas turi literal placeholder vietoj reikšmės:

```
INTERNAL_CRON_TOKEN=<reikšmė iš Vercel env vars>   ← BAD
MUSICLT_BASE_URL=https://musiclt.vercel.app
```

**Fix:**

1. Atidaryk Vercel Dashboard → musiclt → Settings → Environment Variables
2. Surask `INTERNAL_CRON_TOKEN` → spustelėk "..." → "Edit" → copy value
3. Terminal'e:

```bash
cat > ~/.musiclt-env <<EOF
INTERNAL_CRON_TOKEN=PASTE_TIKRĄ_TOKEN_ČIA
MUSICLT_BASE_URL=https://musiclt.vercel.app
EOF
chmod 600 ~/.musiclt-env
```

Verify: `cat ~/.musiclt-env` — turi rodyti realią `eyJ...` arba random string'ą, ne `<reikšmę ...>`.

### 2. Pirmas paleidimas su tool approval

Be šito step'o — task'as kiekvieną kartą bandys gauti approval ir pause'ins.

1. Cowork sidebar → Scheduled → `musiclt-inbox-triage` → **Run now**
2. Approve'ink Gmail MCP + Bash tool'us kai pasirodys dialog'ai (kad ateities runs'ai veiks be intervencijos)
3. Pirmas paleidimas sukurs Gmail label'ius `music-press-imported`, `music-needs-reply`
4. Pažiūrėk output'ą — turi būti `Threads fetched: X` su sumary

### 3. Verify Vercel endpoint'ą

Po pirmo successful run'o:

1. Atidaryk Vercel Dashboard → musiclt → Logs → filter `/api/internal/gmail-ingest`
2. Turi būti POST entries iš scheduled task'o
3. `/admin/inbox` UI'uje turi atsirasti naujos kortelės su `source: gmail`

### 4. Gmail labels patikrinimas

Gmail UI'uje pakrutink labels sąraše turi atsirasti:
- `music-press-imported` (auto-aplied processed laiškams)
- `music-needs-reply` (artist outreach flagged)

Galima jiems set'inti spalvas Gmail UI'e personal preference.

---

## Phase 1b — Outbound (atidėtas, sketch'as)

**Edvardo prašymas:** "noriu kad tas gmail setupas darytusi gudresis su laiku, susirašinėtų su LT atlikėjais, atrašinėtų jiems"

**Apribojimas:** Gmail MCP turi tik `create_draft`, **NE** `send_message`. Anthropic safety limit'as.

**Edvardo klausimas (2026-05-17):** "ar tikrai neleidzia automatiskai issiusti? arba confirm daryti pvz. per web admin issiuntimui"

**Atsakymas:** Anthropic MCP ne, bet **mes patys galim** per `lib/gmail-client.ts`. OAuth refresh token jau setup'intas (vakar pastatėm `lib/gmail-client.ts`), tik reikia pridėt `sendMessage()` funkciją + admin endpoint'ą.

### Siūloma architektūra (kai grįžtam prie outbound)

```
┌────────────────────────────────────────┐
│ Scheduled task: musiclt-artist-outreach│
│ Sched: 1x/sav. (pirmadienio rytą)      │
└──────────────┬─────────────────────────┘
               │
               ▼
   1. Pick N=3-5 prioritetinius atlikėjus
      (filter pagal kažkokį kriterijų — TBD)
   2. Research'ina (DB + Wiki + web)
   3. Drafts personalizuotą email LT
   4. Saves via Gmail MCP create_draft
               │
               ▼
┌────────────────────────────────────────┐
│ /admin/outreach (NEW UI)               │
│  - Lists pending drafts                │
│  - Side-by-side: draft + artist DB ctx │
│  - "Siųsti" button per draft           │
│  - "Siųsti visus" batch button         │
└──────────────┬─────────────────────────┘
               │
               ▼
┌────────────────────────────────────────┐
│ POST /api/internal/outreach-send       │
│  - Auth: NextAuth admin session        │
│  - Calls lib/gmail-client.ts:          │
│    sendDraft(draftId) per Gmail API    │
│  - Logs to artist_outreach table       │
│  - Labels Gmail thread "music-outreach"│
└────────────────────────────────────────┘
```

### Open klausimai prieš build'inant Phase 1b

1. **Email source** — iš kur atlikėjų email'us imti? Variantai:
   - Manualus CSV (`~/.musiclt-outreach-targets.csv`) — max kontrolė
   - Web search (Wikipedia infobox, official sites) — mažiau patikima
   - Hibridas: artists.contact_email kolona + web fallback

2. **Atlikėjų priority** — kam pirmiausia rašyti?
   - Top legacy_likes
   - Aktyvūs (nauji release/event)
   - Underground
   - Mix

3. **Reply'ai į esamus thread'us** — atskira sistema? Kol kas Phase 1a tik flag'iuoja `music-needs-reply` ir Edvardas atsako Gmail UI'uje. Galim padaryti analogišką `/admin/replies` view su Claude-suggested reply drafts.

### Required code (kai prie outbound grįšim)

**`lib/gmail-client.ts`** — pridėti:

```typescript
export async function sendMessage(opts: {
  to: string
  subject: string
  body: string         // plain text arba HTML
  threadId?: string    // jei reply
}): Promise<{ messageId: string; threadId: string }> {
  // gmail.users.messages.send su raw RFC822 message
}

export async function sendDraft(draftId: string): Promise<{ messageId: string }> {
  // gmail.users.drafts.send
}
```

**`app/api/internal/outreach-send/route.ts`** — POST endpoint per session auth, calls `sendMessage` arba `sendDraft`.

**`app/admin/outreach/page.tsx`** — admin UI listing pending drafts su artist context.

**Migration** `artist_outreach` lentelė:
```sql
create table artist_outreach (
  id serial primary key,
  artist_id int references artists(id),
  email text not null,
  draft_id text,
  sent_at timestamptz,
  thread_id text,
  status text check (status in ('draft', 'sent', 'replied', 'bounced')),
  outreach_template text,
  created_at timestamptz default now()
);
create unique index on artist_outreach(artist_id, email);
```

---

## Memory.md updates (siūlomos prie next session)

Pridėti šitas memories:

- `project_gmail_automation_2026_05_17.md` — pivot iš GH Actions į scheduled task'us; Phase 1a deployed
- `feedback_anthropic_subscription_credits.md` — Edvardas turi Cowork sub; scheduled tasks credits ima iš sub'o, ne API budget'o; rinktis scheduled tasks vietoj API cron kai task agentic

---

## TL;DR — Kitos sesijos pradžia

1. Patikrink `~/.musiclt-env` ar turi tikrą token'ą (ne placeholder'į)
2. Patikrink scheduled task `musiclt-inbox-triage` last run output'ą — turi būti success su counters
3. Patikrink `/admin/inbox` UI'uje ar matosi `source: gmail` kortelės
4. Jei viskas OK 1-2 sav. — deactivate GH Actions cron'ą per `.github/workflows/gmail-poll.yml` (palikti tik workflow_dispatch)
5. Tada pradėti Phase 1b — outbound drafts + send via admin UI (žr. "Open klausimai" sąrašą)
