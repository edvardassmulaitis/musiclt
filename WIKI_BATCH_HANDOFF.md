# Wiki Batch Reconciliation — Plan + Handoff
**Sukurta:** 2026-05-19
**Pradinis statusas:** Plan'as patvirtintas, dev pradedam kita sesija
**Repo:** `musiclt/` (origin/main `22259f2` arba naujesnis)

---

## Tikslas

Vienkartinis sutvarkymas: ~12k atlikėjų DB (legacy_scrape_v1 source) sinkronizuoti su Wikipedia kaip canonical reference. Tikslas — užbaigti grupių/atlikėjų metadata struktūrą (albumai, dates, types, covers, track_count), kad būtų konsistentinė data foundation.

**Out of scope (paliekam):**
- Tracks-level Wiki integration (lyrics, video_url, individual track years)
- Description'ai (per `project_description_policy_2026_05_08.md` — OFF)
- Awards / voting backfill (atskira sistema)
- Likes/comments — sacrosanct, niekada netoušiama

---

## Procesi pasitikėjimo pattern'as

Per kiekvieną sesiją:
1. **Auto-apply** kur per-field decision rules aiški (žr. žemiau)
2. **Klausiu Edvardo** kai matau neatitikimą, kurio rules neaprašo
3. Edvardas patikrina/sprendžia
4. **Įrašau į memory** kaip naują decision rule
5. **Tęsiu batch** su nauju rule galiojant ateičiai

Memory rules kaupiasi → pirmose 3-5 sesijose sukaupiama ~90% standartinių pattern'ų → vėliau sesijos eina greitai be daug klausimų.

---

## Per-field decision rules (initial set — bus papildyta)

| Field | Rule | Source |
|---|---|---|
| `release_year` | DB=NULL → Wiki FILL; DB≠Wiki ir source=legacy_scrape → Wiki wins; DB≠Wiki ir source=manual → DB wins, FLAG | Wiki autoritetingesnis dažnai |
| `release_month` / `day` | DB=NULL → Wiki FILL; mismatch → Wiki wins | Wiki dažnai turi precise date |
| `cover_image_url` | DB=NULL → Wiki FILL; DB=X → palik | Legacy turi often unique versijų |
| `type_studio/compilation/live/...` | Mismatch → Wiki wins | Wiki sekcija = canonical klasifikacija |
| `track_count` | Visada perskaičiuoti iš `album_tracks` count | Derived |
| `title` | Mismatch → FLAG (galimai dublikatas) | Manual sprendimas |
| `wiki_url` / `wikidata_id` | DB=NULL → Wiki FILL | Identifier'iai |
| `description` | NIEKADA neliesti | Per policy |

**Flagged scenarijai (klausiu Edvardo):**
- Wiki album'as su year ±2 metų skirtumu nuo DB → dublikatas ar legitimate
- DB album'as su `track_count=0` → broken legacy ar reall empty
- Wiki turi N albumų, DB turi M, |N-M| > 5 — gali būti scope mismatch (solo vs band)
- DB album'as su `legacy_id` bet be Wiki match'o — palik ar suspect'as

---

## Capacity per sesija

| Stage | Realistic per session |
|---|---|
| Pirmos 3-5 sesijos (memory rules sukaupimas, daug klausimų) | **50-100 atlikėjų** |
| Stabilios sesijos (rules turtingos) | **200-300 atlikėjų** |
| Wikipedia rate limit safe: | 1 req/s, ~3 req per artist = 6-8s/artist |

**Total ETA:** ~30-40 Cowork sesijų visiems 8500 (atlikėjai su Wiki).

---

## Architektūra

### 1. `scripts/wiki-diff.mjs` (statau sesijoje 2)
```bash
node scripts/wiki-diff.mjs --artist-id=500 --output=diff_queen.json
node scripts/wiki-diff.mjs --batch=100 --start-from-id=500
```

Output JSON struktūra:
```json
{
  "artist_id": 500,
  "wiki_url": "https://en.wikipedia.org/wiki/Queen",
  "wiki_albums_count": 44,
  "db_albums_count": 25,
  "matched": [
    {
      "db_id": 100835,
      "db_title": "Absolute Greatest",
      "wiki_title": "Absolute Greatest",
      "diffs": [
        { "field": "release_year", "db": null, "wiki": 2009, "decision": "AUTO_FILL" },
        { "field": "type_compilation", "db": true, "wiki": true, "decision": "OK" }
      ]
    }
  ],
  "unmatched_wiki": [
    { "title": "Live at the Rainbow '74", "year": 2014, "type": "live", "decision": "FLAG_NEW_ALBUM" }
  ],
  "unmatched_db": [
    { "id": 100864, "title": "Live At Wembley '86", "track_count": 0, "decision": "FLAG_BROKEN" }
  ],
  "flagged": [...]
}
```

### 2. `scripts/wiki-apply.mjs`
```bash
node scripts/wiki-apply.mjs --diff=diff_queen.json --dry-run
node scripts/wiki-apply.mjs --diff=diff_queen.json --apply
```

Vykdo `AUTO_*` decisions tiesiogiai į DB (per service role). Flagged items → output kaip `flagged_queue.json` review'ui.

### 3. Cowork session loop (aš per sesijos vykdau)
```
foreach artist in batch:
  1. wiki-diff → diff.json
  2. patikrint flagged items prieš apply
  3. jei flagged turi unknown pattern'us — klausiu Edvardo
  4. wiki-apply (auto + manual decisions po confirm)
  5. update progress: artists_completed_session.json
```

### 4. `/admin/wiki-flagged` (jei reikės — pridėsim vėliau)
Statyti UI tik jei flagged queue tampa per didelis (200+ pending). Pirma matom kaip auga.

---

## Pradinis pilot — Queen (sesija 2)

Queen jau turi:
- 25 DB albumus
- 44 Wiki albumus (po parser fix'o 22259f2)
- 9 unmatched Wiki (Queen+Paul Rodgers albumus, "On Air", "Queen Rock Montreal", etc.)
- 3 broken DB albumai (Wembley/Magic/GH1981 — track_count = 0)
- 4 duplikatai su FM (2 merge'inti, 2 palikt)

**Sesija 2 pirmasis run:** Queen-only end-to-end. Validate diff'o accuracy → adjust rules → tada batch'ai.

---

## Kuriose vietose memory rules kauptis

`feedback_wiki_diff_rules.md` — naujas memory file. Per sesijas pridėsiu rules formatu:
```
- release_year mismatch su source=legacy_scrape → Wiki wins (Edvardas 2026-05-XX)
- "Greatest Hits Vol. X" prie atlikėjo su daugiau nei 3 GH compilations → FLAG (galimai compilation noise)
- ...
```

---

## Pre-flight checklist sesijai 2

- [ ] Confirm migration `20260519_merge_tracks_likes_comments.sql` aplikuota
- [ ] Confirm Barcelona + Great Pretender merge'ai paleisti (`bash scripts/queen_merge_postmigration.sh`)
- [ ] Verify Queen disko UI dabar rodo realius 44 albumus (po parser fix 22259f2)
- [ ] DATABASE_URL nustatytas `.env.local` (reikia migracijai + scripts run-migration.mjs)
- [ ] Edvardas turi 30-40 min focused dėmesio pirmoms sesijoms (klausimų bus daug)

---

## Session 2 kickoff prompt
```
Tęsiame Wiki batch reconciliation pagal WIKI_BATCH_HANDOFF.md. Pirma 
pilot ant Queen'o (artist_id=500) — statyk wiki-diff.mjs + wiki-apply.mjs, 
paleisk ant Queen, parodyk diff'us prieš apply. Klauk apie flagged 
items pagal pasitikėjimo pattern'ą.
```

---

## Šios sesijos (2026-05-19) pasiekimai

Commits push'inti į `origin/main`:
- `08522a6` — Wiki parser Brazilian year extraction
- `47ec51d` — merge_tracks RPC v2 migration
- `ec890cf` — Queen audit handoff + post-merge script
- `22259f2` — parseDiscographyPage skip "Collaborations and other appearances" sections

DB pakeitimai:
- Queen 25 albumų `track_count` backfilled

Memory updates (2 nauji entry'iai):
- `feedback_merge_tracks_v2.md` — RPC v2 dėl cross-artist merge'ų
- `project_queen_audit_2026_05_19.md` — Queen audit current state
- `feedback_disco_section_skip.md` — parser pattern už appearance section'us
