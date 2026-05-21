# Pilno user'io duomenų scrape — handoff

Status: einaras13 pilot, 2026-05-21

## Kas jau migruota

`scraper/ugc_user_scrape.py einaras13 --phases profile,mood,diary,creation,translate,daily,topas,friends`

| Faze | Įrašai | Pastaba |
|---|---|---|
| profile | 1 | Visa profilio meta (karma 49,688, VIP, Vilnius, gimęs 1998-08-25, chemija) |
| mood | 1 | Nuotaikos daina |
| diary | 508 | Dienoraščio įrašai → blog_posts |
| translate | 8 | Vertimai → blog_posts |
| daily | 1000 | Dienos dainos → daily_song_picks (990 dar laukia track resolve) |
| topas | n/a | Topai (jei yra) |
| friends | 42 | user_friendships |
| **comments** | **2305** | Visi komentarai per canonical pipeline |

## Kas DAR nemigruota

### 1. Likes (♥) — blokuoja auth + JS lazy-load

URL: `/?users;user.<id>;likes` (einaras13 ID = 107352)
Problema: puslapis lazy-load'ina turinį per JS po prisijungimo. Be auth session cookie atsako tuščia.

**Kas reikalinga:**
1. Prisijungti prie music.lt (browser).
2. DevTools → Application → Cookies → nukopijuoti `PHPSESSID` (arba kokio session cookie) value.
3. Paleisti scraper'į su cookie (TODO: scraper extension):
   ```bash
   python3 scraper/ugc_user_scrape.py einaras13 --phases likes --session-cookie 'PHPSESSID=xxxxxxx'
   ```
4. Scraper turi pasiekti:
   - palaikinti atlikėjai (entity_type='artist')
   - palaikinti albumai (entity_type='album')
   - palaikinti dainos (entity_type='track')

Visi įrašai rašomi į `likes` lentelę su `user_id`=einaras13.id, `entity_type` + `entity_id`. Tada UI sekcijos „Mėgstamiausi albumai" / „Mėgstamiausios dainos" automatiškai užsipildo.

**Implementacijos TODO scraper/ugc_lib.py:**
- `parse_likes_page(html)` — extract'ina entity_type, legacy_entity_id, sort_order
- `record_like(user_id, entity_type, legacy_entity_id)` — rezolvina legacy_id → modern UUID, įrašo į likes
- `ugc_user_scrape.py` — `--session-cookie` arg, passes per `httpx.Client(cookies=...)`

Po implementacijos einaras13 likes turėtų būti ~2,000+ įrašų (legacy_liked_artists_count + albums + tracks).

### 2. Daily picks track resolve (990/1000 pending)

Track'ai daily_song_picks turi `legacy_track_id`, bet `track_id` (FK į modern tracks) NULL, kol legacy_id nematomas mūsų DB.

**Du keliai:**
1. **Wait for batch migration** — kai bus migruoti atlikėjai + albumai + track'ai, `cleanup_daily_picks_resolve.py` paskaitys `ugc_pending_links` ir prijungs.
2. **Per-pick artist resolve** — kiekviena pending daina turi pavadinimą + atlikėją (galima parsint iš /lt/daina/X). Jei to atlikėjo dar nėra DB — ghost user'is iškart paleidžia mini import.

Šiuo metu deferred — laukia LT atlikėjų migracijos progreso.

### 3. Kūryba (creation) endpoint parser

`/user/<username>/kuryba` puslapis grąžina HTML, bet dabartinis parser'is falls back į global content. Reikia:
- Verify URL pattern (gal `/user/<u>/kuryba` ≠ atlikėjo /kuryba)
- Specifinis selector'is per-user'io kūrybai

Žemas prioritetas — einaras13 neturi kūrybos įrašų.

## Kaip paleisti dabar — komandos

```bash
cd "Music.lt rebuild"
source scraper/.venv/bin/activate
export $(grep -v '^#' .env.local | xargs)

# Pilnas re-sweep (be likes)
python3 scraper/ugc_user_scrape.py einaras13 \
  --phases profile,mood,diary,creation,translate,daily,topas,friends

# Tik viena faze
python3 scraper/ugc_user_scrape.py einaras13 --phases daily

# Dry-run (test, nieko neraso į DB)
python3 scraper/ugc_user_scrape.py einaras13 --dry-run
```

## Antras user'is — batch run

Po einaras13 validacijos, top aktyvūs nariai (pagal karma):
1. Reikia query: `SELECT username FROM profiles WHERE provider='legacy_forum' ORDER BY legacy_karma_points DESC NULLS LAST LIMIT 20`
2. Wrap'inti į `scrape_top_active_users.sh` — sequential calls į `ugc_user_scrape.py`
3. Lapse'ai tarp user'ių 5-10s, kad music.lt nesivargintų

Galima taikyti po einaras13 vizualinės validacijos ir likes implementacijos.
