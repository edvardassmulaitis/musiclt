# Queen disko audit — handoff
**Sesija:** 2026-05-19
**Statusas:** Foundation paklota; Wiki orchestrator dar nepradėtas
**Repo:** `musiclt/` (origin/main `47ec51d`)

---

## Ką pavyko padaryti

### 1. Migracija parašyta + push'inta
`supabase/migrations/20260519_merge_tracks_likes_comments.sql` — `merge_tracks` RPC v2.

**Pakeitimai:**
- Pridėtas likes transfer su `(entity_type, entity_id, user_username)` ON CONFLICT DO NOTHING dedup
- Pridėtas comments + track_lyric_comments transfer (UPDATE)
- Pridėtas track_drops transfer su unique handling
- Pridėtas track_plays + video_views_history + news/blog/playlist tracks + daily_song_picks transfer
- **PAŠALINTAS** auto-add loser_main_artist → winner_featuring (klaidingai dėdavo Queen kaip featuring į FM Barcelona)
- Snapshot išplėstas likes/comments/lyric_comments — revert galimas

**Apply (Edvardas paleidžia ant Mac'o):**
```bash
cd musiclt
node scripts/run-migration.mjs supabase/migrations/20260519_merge_tracks_likes_comments.sql
```

Reikia `DATABASE_URL` `.env.local`'e (žr. komentarą scripts/run-migration.mjs viršuje — instrukcija kaip gauti iš Supabase dashboard).

### 2. Track_count backfill
Visiems 25 Queen albumams `track_count` užfilling'intas iš `album_tracks` COUNT'o. Padaryta tiesiogiai per PostgREST PATCH (be migracijos).

### 3. Queen DB state — pilnas snapshot'as

**Albumai (25):**
```
top 4 problemini'ai:
  100864 Live At Wembley '86        — 0 tracks (BROKEN — Wiki import)
  100866 Live Magic                 — 0 tracks (BROKEN — Wiki import)
  100836 Greatest Hits (1981)       — 1 track  (BROKEN — Wiki import)
  100839 Queen on Fire (Disc 2)     — 3 tracks (Disc 1 missing — manual)
likę 21 albumas: 9–22 tracks, atrodo OK
```

**Tracks (223 Queen + 52 FM):**
- 16/223 Queen tracks be `release_year`
- 33/223 be `video_url`
- 19/223 be `lyrics`
- Visi turi `source = 'legacy_scrape_v1'` (Wiki niekada neimport'inta)

**Queen ↔ Mercury duplicate'ai (4 atvejai):**

| Queen | Mercury | Title | Sprendimas |
|---|---|---|---|
| 107783 | 107931 | Barcelona | **MERGE** Q→FM (post-migration) |
| 107802 | 107938 | The Great Pretender | **MERGE** Q→FM (FM 1987 solo cover, Queen niekada nedainavo) |
| 107588 | 107922 | I Was Born to Love You | **PALIKTI** dvi versijas (FM 1985 solo + Queen 1995 re-record) |
| 107598 | 107921 | Made in Heaven | **PALIKTI** dvi versijas (FM 1985 solo + Queen 1995 title track) |

### 4. Merge command paruoštas
`scripts/queen_merge_postmigration.sh` — vykdo abu merge'us (Barcelona + Great Pretender) tik PO migration apply. Su pre/post state print'ais kad galima patikrint.

```bash
bash scripts/queen_merge_postmigration.sh
```

**Like overlap analizė (jau patikrinta):**
- Barcelona: 0 user'iai liko abi versijas → visi 6 Queen likes persikels švariai
- Great Pretender: 2 user'iai liko abi → 3 persikels, 2 dedup'inami (acceptable)

---

## Kas DAR NEPRADĖTA

### Wiki import orchestrator (25 albumai)
**Tikslas:** Visiems 25 Queen albumams paleisti automatizuotą Wiki import'ą be UI clicks.

**Kas reikia:**

1. **Naujas API endpoint** `POST /api/admin/wiki/import-album/[albumId]`
   - Body: `{ wiki_page_url?: string, mode: 'preview' | 'apply' }`
   - Auto-discovery: `{{Main|X albums discography}}` link iš artist main page
   - Fetch Wiki disco page (or fallback `X discography` → `X`)
   - Match'inti DB album'ą (su Wiki entry'ius pagal title + year + type)
   - Extract tracklist (per `extractTrackListingsWithPos` arba `parseHashListTracks`)
   - Match DB tracks ↔ Wiki tracks pagal normalizuotą title (slug similarity)

2. **Match semantika — Edvardo input'as reikalingas:**
   - FILL-only (jei DB jau turi field'ą, nepatikrink overwrite)? Ar OVERWRITE jei Wiki turi geresnį source'ą?
   - Match'inant kompiliacijos track'us ant Greatest Hits — match'inti į canonical track (pvz Queen GH II "Bohemian Rhapsody" matches į 'A Night at the Opera' Bohemian Rhapsody)? Ar kurti naujus track entries?
   - Cover artwork — overwrite ar tik FILL?

3. **Server-side action layer**
   - Refactor'inti `WikipediaImportDiscography.tsx` import logic'ą į `lib/wiki-import.ts`
   - Sukurti idempotent dry-run mode'ą
   - Backfill loop visam Queen artist'ui (`/api/admin/wiki/import-artist/[artistId]`)

4. **Admin review UI**
   - Atvaizduoti, kas keisis kiekvienam albumui prieš apply
   - Iteruotis po 25 albumus su confirm/skip per album'ą

**Estimated effort:** 1–2 sesijos focused darbo.

### Broken 3 albumai (galima ir per UI rankomis)
Jei orchestrator atidedam, šie 3 galima rankomis per UI Wiki import:
- 100864 Live At Wembley '86 → Wiki: en.wikipedia.org/wiki/Live_at_Wembley_%2786
- 100866 Live Magic → Wiki: en.wikipedia.org/wiki/Live_Magic
- 100836 Greatest Hits (1981) → Wiki: en.wikipedia.org/wiki/Greatest_Hits_(Queen_album)

---

## Atidaryti klausimai

1. **Wiki orchestrator scope** — visiems atlikėjams kartą (12k LT + intl), ar pirma Queen-only pilot?
2. **Match semantika** — FILL vs REPLACE per field (release_year, video_url, lyrics, cover_url)?
3. **Made in Heaven (1995) + Born to Love You (1995) Queen versijos** — palikti atskiras nuo FM, bet kurio albumo (Queen 'Made in Heaven' 1995) tracklist'as tikrai turi šias dainas? Reikia patikrint, ar po Wiki import album_tracks bus teisingai.
4. **Featuring artists policy** — dabar admin'ai pridėjinėja per atskirą UI input'ą. Reikia patikrint, kad Queen GH III 'Show Must Go On (live, 1992)' su Elton John ir 'Under Pressure (Rah Mix)' su Bowie featuring'ai išliks po visų merge'ų ir Wiki import'ų (atsiranda iš track_artists).

---

## Verify einamą prod state prieš tęsiant

```bash
cd musiclt
git ls-remote origin main   # turi būti 47ec51d arba naujesnis
git log --oneline -5

# Patikrint, ar migracija aplikuota
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/merge_tracks?p_winner_id=1&p_loser_id=2" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -d '{}' 
# jei RPC v2 — return value turi 'likes_moved' field'ą; jei v1 — neturi
```

---

## Sąraso failai šios sesijos commit'uose

- `supabase/migrations/20260519_merge_tracks_likes_comments.sql` — migracija (push'inta)
- `scripts/queen_merge_postmigration.sh` — merge runner (po migration apply)
- `QUEEN_AUDIT_HANDOFF.md` — šis handoff
