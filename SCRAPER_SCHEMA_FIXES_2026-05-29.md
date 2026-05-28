# Scraper schema fixes 2026-05-29

Po Phase 2c architectural slim-down (2026-05-28c) buvo dropped DB stulpeliai, kuriuos scraper Python kodas vis dar bandydavo INSERT'inti. Rytojaus scrape'ai būtų FAIL'inę su PostgREST 4xx errorais.

Fix'inti failai (sandbox local, scraper/ NOT git-tracked):

## `scraper/forum_lib.py`

### `upsert_entity_comments()` (track/album/event/news comments → comments lentelė)
Pašalinta iš INSERT payload (line ~290):
- `"content_html"` (Phase 2c drop)

### `upsert_discussion_posts()` (forum thread posts → comments lentelė)
Pašalinta iš INSERT payload (line ~352):
- `"content_html"` (Phase 2c drop)
- `"legacy_parent_legacy_id"` (Phase 1 drop)

### `upsert_news_like()` ir `upsert_post_like()`
Jau buvo švarūs (`source`, `user_rank`, `user_avatar_url` jau pašalinti per 2026-05-28).
✅ no change required.

## `scraper/ugc_lib.py`

### `upsert_blog_post_comments()` (line ~2122)
Pašalinta iš INSERT payload:
- `"content_html"` (Phase 2c drop)

### `_insert_like_row()` (line ~1997)
Pašalinta iš `likes` INSERT body:
- `"source": "legacy_scrape"` (Phase 2c drop)

### Likę OK use cases:
- `upsert_friendship()` writes `source` į `user_friendships` → KEEP (skirtinga lentelė, source dar yra)
- `upsert_daily_song_pick()` writes `source` į `daily_song_picks` → KEEP

## Konstraint pakeitimas — likes_unique_legacy → partial unique

2026-05-29d migracija: ALTER TABLE likes DROP CONSTRAINT likes_unique_legacy
+ CREATE UNIQUE INDEX likes_unique_legacy_pending WHERE entity_id IS NULL.

**Veikiamos scraper logikos:**
- `Prefer: resolution=ignore-duplicates` — semantika nepasikeitė. PostgREST
  tikrina VISUS UNIQUE constraints; pending row'ams aktyvus
  `likes_unique_legacy_pending`, resolved row'ams `likes_unique_username`
  (entity_type, entity_id, user_username). Idempotency ok.

## Verifikacija prieš tomorrow's scrape

```bash
# Sanity check
cd "/Users/edvardas_s/Documents/Claude/Projects/Music.lt rebuild/scraper"
grep -n "content_html\|legacy_parent_legacy_id\|source.*legacy_scrape" \
  forum_lib.py ugc_lib.py | grep -vE "user_friendships|daily_song_picks|raw_html|sanitize|html_to_excerpt|content_html_raw"
# Expected output: TIK parser local vars + docstrings, JOKIŲ INSERT payload entries.
```

Jei rytojaus scrape sustoja ant PostgREST error 'column does not exist', `git log scraper/`
nepadės (scraper not in git) — read'inkite šitą failą + per `python -c` reapply'inkite
fixes pagal patterns aukščiau.
