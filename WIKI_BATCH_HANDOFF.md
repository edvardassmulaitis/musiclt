# Wiki Batch Reconciliation — Handoff
**Sukurta:** 2026-05-19
**Statusas:** Pasirengimo etapas baigtas (migration aplikuota, Queen Barcelona/GP merge'inti). Tęsiame batch'ą per Cowork sesijas.

---

## Tikslas

Vienkartinis darbas: ~12k atlikėjų DB (legacy_scrape_v1 source) sutvarkyti naudojant Wikipedia kaip canonical reference. Album-level metadata (release dates, types, covers, track_count, wiki_url/wikidata_id) konsoliduoti.

**Out of scope:**
- Tracks-level Wiki integration (lyrics/video tvarkomi per egzistuojančius `enrich` tools'us)
- Description'ai (per `project_description_policy_2026_05_08.md` — OFF)
- Likes/comments — sacrosanct
- Atskirų script'ų ar UI infrastructure'os build'as. Tai vienkartis darbas — viską darau gyvai per Cowork sesijas.

---

## Procesas

Aš per Cowork sesiją iteruoju per atlikėjus. Vienam atlikėjui:

1. Fetch Wiki main + disco page (jau patikimas po `22259f2` parser fix'o)
2. Diff prieš DB albumus
3. Auto-apply, kur turiu rule (žr. žemiau)
4. Flagged neatitikimui — **klausiu Edvardo**, jis sprendžia
5. Sprendimą **įrašau į memory**, ateičiai auto-apply pagal kaupiamą rule set'ą
6. Tęsiu sekantį atlikėją

Tikslas: pirmose 3-5 sesijose sukaupti ~90% standartinių pattern'ų. Vėliau sesijos eina greitai be klausimų.

---

## Initial decision rules

| Field | Rule |
|---|---|
| `release_year` | DB=NULL → Wiki FILL (auto); DB≠Wiki ir source=legacy → Wiki wins (auto); DB≠Wiki ir source=manual → DB wins, FLAG |
| `release_month` / `day` | DB=NULL → FILL; mismatch → Wiki wins |
| `cover_image_url` | DB=NULL → FILL; DB=X → palik (legacy turi unique versijų) |
| `type_*` (studio/comp/live/...) | Mismatch → Wiki wins |
| `track_count` | Visada perskaičiuoti iš `album_tracks` |
| `wiki_url`, `wikidata_id` | DB=NULL → Wiki FILL |
| `title` mismatch tarp matched | FLAG (galimai dublikatas) |
| `description` | NIEKADA neliesti |

Memory rules atsiranda kai matom edge case'us (kaupiamas `feedback_wiki_diff_rules.md`).

---

## Capacity per sesiją

**Pradinė strategija:** 1-by-1 atlikėjas pirmose 2-3 sesijose, kad išvystytume rule set'ą ir validuotume diff logic'ą. Pradedam Queen'u (sesija 2).

**Vėliau, kai rules stabilios:** batch'ai po N atlikėjus per sesiją.

| Stage | Per session |
|---|---|
| Sesija 2-3 (rule discovery, 1-by-1) | **3-10 atlikėjų** |
| Sesija 4-5 (small batches, sąrašu) | **20-50 atlikėjų** |
| Stabilios (rules turtingos) | **150-250 atlikėjų** |

Wikipedia rate limit safe: ~1 req/s, ~3 fetch'ai per atlikėją = 5-8s/artist + parse + DB apply.

**Total ETA:** ~30-40 Cowork sesijų visiems ~8500 atlikėjų (kurie turi Wiki). Per kelias savaites darbų.

---

## Pre-flight checklist (jau padaryta šios sesijos)

- [x] `merge_tracks` RPC v2 migracija aplikuota (Edvardas paleido sėkmingai)
- [x] Barcelona + Great Pretender merge'ai įvykdyti (`scripts/queen_merge_postmigration.sh`)
- [x] Parser fix appearance sekcijoms (`22259f2`)
- [x] Queen 25 albumų `track_count` backfilled
- [x] Memory rules pradiniai įrašai

## Pasiruošimas sesijai 2

- [ ] Patikrinti Queen Greatest Hits III UI'e — track #6 Barcelona dabar FM, track #9 Great Pretender dabar FM
- [ ] DATABASE_URL `.env.local`'e išlieka (būsim naudoti per sesijas)
- [ ] Pakankamai laiko fokus'u 30-40 min — Queen pilot reikalauja klausimų

---

## Sesija 2 kickoff prompt

```
Tęsiame Wiki batch reconciliation pagal WIKI_BATCH_HANDOFF.md.
Pradedam pilot ant Queen (artist_id=500): fetch Wiki, diff prieš DB,
auto-apply pagal rules, klausk apie flagged items. Po Queen tęsiam
sekantį atlikėją pagal legacy_likes prioritization.
```

---

## Šios sesijos (2026-05-19) commits

| Commit | Kas |
|---|---|
| `08522a6` | Wiki parser Brazilian year extraction |
| `47ec51d` | `merge_tracks` RPC v2 migracija |
| `ec890cf` | Queen audit handoff + merge script |
| `22259f2` | Parser fix appearance sekcijoms |
| `31ef674` | (perrašytas šitas dokumentas) |

Memory updates:
- `feedback_merge_tracks_v2.md`
- `project_queen_audit_2026_05_19.md`
- `feedback_disco_section_skip.md`
