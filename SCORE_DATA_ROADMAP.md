# Score / Stats Data Roadmap

Kokius duomenis verta kaupti dabar, kad ateities scoring formulės būtų lanksčios ir teisingos.

## Esama (jau capture'inama)

### tracks
- `video_url`, `video_views`, `video_views_checked_at` — YT current
- `track_video_views_history` — append-only snapshots (1 per enrich)
- `release_year`, `release_month`, `release_day` — issue: dažnai NULL music.lt'e
- `lyrics`, `chords`
- `spotify_id` ⭐ NEW (2026-05-06) — iš music.lt embed
- `legacy_id`, `slug`, `source`, `source_url` — provenance
- `score`, `score_breakdown`, `peak_chart_position`, `certifications`
- `page_view_count`, `video_embeddable` ⭐
- `comment_count` indirect via `comments` table

### artists
- `score` (LT/INT formulės)
- `country`, `active_from`, `active_until` → career_years
- `cover_image_url`, `cover_image_wide_url`
- Social URLs: `spotify`, `youtube`, `instagram`, `facebook`, `soundcloud`, `bandcamp`, `tiktok`, `twitter`
- `legacy_concert_count`, `legacy_discussion_count`, `legacy_news_count`
- `page_view_count` ⭐

### albums
- `peak_chart_position`, `certifications` (Wiki via INT formulė)
- `page_view_count` ⭐

## Trūksta — verta pridėti

### KRITINIAI score formulei

| Laukas | Šaltinis | Kodėl |
|---|---|---|
| `tracks.video_published_at` | YT `videoDetails.publishDate` | Δ-time popularity calc — kada video uploaded'as. Track release_year music.lt'e nepatikimas. |
| `tracks.video_likes` | YT Data API `videos.list?part=statistics` | YT engagement rate, papildoma signalui prie views |
| `artists.spotify_popularity` (0-100) | Spotify API `artists/{id}` | Spotify uždirba normalizuotą populiarumą — labai svarbus signalas |
| `artists.spotify_followers` | Spotify API | Indikatorius bazei |
| `artists.youtube_channel_id` + `youtube_subscriber_count` | YT Data API `search` + `channels` | Channel-level audience signal |

### Naudingi (medium priority)

| Laukas | Šaltinis | Kodėl |
|---|---|---|
| `tracks.spotify_popularity` (0-100) | Spotify API `tracks/{id}` | Per-track Spotify pop |
| `tracks.duration_sec` | YT `videoDetails.lengthSeconds` ARBA Spotify | Filter skits/intros < 60s, edits > 12min |
| `tracks.is_explicit` | Spotify | LT relevance, content rating |
| `tracks.bpm`, `tracks.key`, `tracks.energy`, `tracks.danceability` | Spotify Audio Features | Mood/genre clustering |
| `tracks.lang` | Detect from lyrics | Filter LT vs translated |
| `albums.spotify_id` | Music.lt embed (jei yra) ARBA Spotify search | Album linking |
| `artists.wikipedia_inbound_links` | Wikipedia API | Notability signal |

### Time-series (svarbiau ilgalaikiai)

| Lentelė | Frequency | Saugo |
|---|---|---|
| `track_video_views_history` ✅ EGZISTUOJA | per enrich | ad-hoc snapshots |
| `track_views_weekly` (NEW) | savaitinis cron | cleaned weekly delta |
| `artist_followers_history` (NEW) | savaitinis cron | Spotify followers + YT subs over time |
| `track_chart_history` ✅ `top_entries` egzistuoja | weekly admin | site chart performance |

## Recommended next-steps

### Phase 1 — Pigūs wins (be Spotify API)
1. Migracija: `tracks.video_published_at TIMESTAMPTZ`
2. enrichTrack updates: po getVideoDetails() saugo publishDate (jau ateina iš InnerTube /player response — tik mes neimam)
3. Migracija: `tracks.duration_sec INTEGER` — irgi iš /player response
4. Update `recent_video_views` calc'ą: vietoj `release_year >= now-3y`, naudoti `video_published_at >= now-3y` (tikslesnis).

### Phase 2 — Spotify API integration
1. Setup Spotify Client Credentials flow (server-side, no user OAuth)
2. New `lib/spotify.ts` su getArtist/getTrack/getAudioFeatures funkcijomis
3. Migracija: `artists.spotify_popularity, spotify_followers, spotify_genres[]`
4. Migracija: `tracks.spotify_popularity, duration_ms, explicit`
5. Background enricher: po Wiki/scrape — fetch Spotify info jei spotify_id yra
6. Update score formulę: pridėti spotify popularity kaip dar vieną signal'ą (mix su YT — naudoti **max** arba **avg**, neauguoti)

### Phase 3 — Cron-based time series
1. New `cron/weekly-views-snapshot` task
2. Per-artist iterates tracks → calls /api/admin/yt/artist/X/enrich
3. Tikslus delta-week views available after 4-8 weeks duomenų
4. Nauja kategorija "Trending" — viewsų augimo greitis (Δ per week)

### Phase 4 — Album-level scoring
1. computeAlbumScore tobulinimai analogiškai (popularity_recent, certifications proper)
2. Album page_view_count už visą albumo srautą
3. Albumo sumos per visus track'us — koreliuoja ar albumas "veikia"

## Score formulių reading list

LT (current): catalog 22 + media 10 + popularity_recent 13 + popularity_alltime 12 + community 13 + career 10 + awards 20 = **100**

INT (current): catalog 20 + chart 30 + commercial 20 + reach 15 + awards 15 = **100**

Trade-offs:
- **LT**: focus on local engagement + YT popularity + community votes. Awards weighed less than INT (LT awards scene mažesnis).
- **INT**: focus on chart performance + certifications (RIAA Gold/Platinum signals). Reach replaces popularity (career + media combined).

Po Phase 2: pridėti `spotify_popularity` → INT formulė labiau pritaikoma globalioms metrikoms.
