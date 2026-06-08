#!/usr/bin/env python3
"""
backfill_mood_songs.py
======================
Pasiima visų narių "Nuotaikos dainą" iš senosios music.lt ir įrašo
mood_song_track_id į naujosios sistemos profiles lentelę.

Veikia be autentifikacijos — duomenys statiniame HTML puslapyje
https://www.music.lt/user/{username}

Paleidimas:
    python3 scraper/backfill_mood_songs.py
    python3 scraper/backfill_mood_songs.py --limit 500
    python3 scraper/backfill_mood_songs.py --dry-run

Reikalavimai:
    pip install httpx selectolax python-dotenv --break-system-packages
"""

import argparse
import re
import time
import sys
import os
from pathlib import Path

import httpx
from selectolax.parser import HTMLParser

# ── Supabase creds ──────────────────────────────────────────────────────────
env_path = Path(__file__).parent.parent / ".env.local"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SB_HDR = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
          "Content-Type": "application/json"}

OLD_BASE = "https://www.music.lt"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/124.0.0.0 Safari/537.36")

# ── DB helpers ──────────────────────────────────────────────────────────────

def sb_get(path: str, params: dict = None) -> list:
    r = httpx.get(f"{SB_URL}/rest/v1/{path}", headers=SB_HDR,
                  params=params, timeout=15)
    r.raise_for_status()
    return r.json()


def sb_patch(table: str, filters: dict, data: dict) -> bool:
    params = {k: f"eq.{v}" for k, v in filters.items()}
    r = httpx.patch(f"{SB_URL}/rest/v1/{table}",
                    headers={**SB_HDR, "Prefer": "return=minimal"},
                    params=params, json=data, timeout=15)
    return r.status_code in (200, 204)


# ── Fetch mood song iš /user/{username} statinio HTML ───────────────────────

def fetch_mood_song(username: str, client: httpx.Client):
    """
    Grąžina (legacy_track_id, artist_name, track_title) arba None.

    Senoji music.lt rodo nuotaikos dainą statiniame HTML puslapyje
    https://www.music.lt/user/{username} — nereikia autentifikacijos.

    HTML struktūra:
      <a href="lt/grupe/{slug}/{group_id}/"><img ... /></a>
      <a href="lt/daina/{slug}/{track_id}/"><b>Track Title</b></a><br />
      <a href="lt/grupe/{slug}/{group_id}/">Artist Name</a>
      ...
      <img src="/images/d/play_mood.jpg" ...>
    """
    url = f"{OLD_BASE}/user/{username}"
    try:
        r = client.get(url, timeout=15)
        if r.status_code != 200:
            return None

        html = r.text

        # Raskime play_mood.jpg bloką — jis visada šalia nuotaikos dainos
        idx = html.find('play_mood.jpg')
        if idx < 0:
            return None  # nėra nuotaikos dainos

        # Ieškom track URL prieš play_mood.jpg (iki 800 chars atgal)
        snippet = html[max(0, idx - 800):idx + 100]

        # Track link: lt/daina/{slug}/{id}/
        track_id = None
        track_title = None
        artist_name = None

        track_m = re.search(r'lt/daina/([^/\"\']+)/(\d+)/', snippet)
        if track_m:
            track_id = int(track_m.group(2))

        # Title iš <b>...</b> po daina linko
        title_m = re.search(r'lt/daina/[^\"\']+\"[^>]*><b>([^<]+)</b>', snippet)
        if title_m:
            track_title = title_m.group(1).strip()

        # Artist name iš paskutinio lt/grupe linko (be img)
        for am in re.finditer(r'href="lt/grupe/[^/]*/\d+/">([^<]+)</a>', snippet):
            text = am.group(1).strip()
            if text:
                artist_name = text

        if track_id and track_title:
            return track_id, artist_name, track_title
        return None

    except Exception as e:
        print(f"  [warn] fetch error for {username}: {e}")
        return None


# ── Match track in new DB by legacy track ID ─────────────────────────────────

def find_track_by_legacy_id(legacy_track_id: int) -> int | None:
    """Ieško track'o DB pagal legacy_id lauką."""
    rows = sb_get("tracks", {
        "legacy_id": f"eq.{legacy_track_id}",
        "select": "id,title",
        "limit": "1",
    })
    return rows[0]["id"] if rows else None


def find_track_by_name(artist_name: str, track_title: str) -> int | None:
    """Fallback: ieško pagal pavadinimą ir atlikėją."""
    if not artist_name or not track_title:
        return None

    rows = sb_get("tracks", {
        "title": f"ilike.{track_title}",
        "select": "id,title,artist_id,artists:artist_id(name)",
        "limit": "20",
    })
    for row in rows:
        a = row.get("artists")
        if a and a.get("name", "").lower() == artist_name.lower():
            return row["id"]
    for row in rows:
        a = row.get("artists")
        if a and artist_name.lower() in a.get("name", "").lower():
            return row["id"]

    # Ieškome atlikėjo, tada jo dainų
    artists = sb_get("artists", {
        "name": f"ilike.{artist_name}",
        "select": "id,name",
        "limit": "3",
    })
    for art in artists:
        tracks = sb_get("tracks", {
            "artist_id": f"eq.{art['id']}",
            "title": f"ilike.{track_title}",
            "select": "id,title",
            "limit": "3",
        })
        if tracks:
            return tracks[0]["id"]
    return None


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=500)
    ap.add_argument("--offset", type=int, default=0)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--refetch", action="store_true",
                    help="Taip pat tikrinti profilius kurie jau turi mood_song_track_id")
    args = ap.parse_args()

    # Greitas test su žinomu vartotoju
    print("Testing endpoint with known user (gintuks77)...")
    with httpx.Client(headers={"User-Agent": UA}, follow_redirects=True) as client:
        test = fetch_mood_song("gintuks77", client)
        if test:
            print(f"✅ Test OK — gintuks77 mood: '{test[2]}' — {test[1]} (legacy_id={test[0]})\n")
        else:
            print("⚠️  Test FAILED — gintuks77 mood song nerastas. Bandyk vėliau.\n")
            sys.exit(1)

    print("Fetching profiles without mood song...")

    params = {
        "select": "id,username",
        "limit": str(args.limit),
        "offset": str(args.offset),
        "order": "legacy_karma_points.desc.nullslast",
    }
    if not args.refetch:
        params["mood_song_track_id"] = "is.null"

    profiles = sb_get("profiles", params)
    print(f"Found {len(profiles)} profiles to check\n")

    stats = {"checked": 0, "found": 0, "matched": 0, "updated": 0, "no_mood": 0, "not_in_db": 0}

    with httpx.Client(headers={"User-Agent": UA}, follow_redirects=True) as client:
        for p in profiles:
            uname = p["username"]
            stats["checked"] += 1

            result = fetch_mood_song(uname, client)
            if not result:
                stats["no_mood"] += 1
                if stats["checked"] % 50 == 0:
                    print(f"  [{stats['checked']}/{len(profiles)}] progress: "
                          f"found={stats['found']}, matched={stats['matched']}")
                time.sleep(0.2)
                continue

            legacy_track_id, artist_name, track_title = result
            stats["found"] += 1
            print(f"  [{stats['checked']}/{len(profiles)}] {uname}: "
                  f"'{track_title}' — {artist_name or '?'} (legacy_id={legacy_track_id})")

            # Pirma bandome pagal legacy_id
            new_track_id = find_track_by_legacy_id(legacy_track_id)
            if new_track_id:
                print(f"    → matched by legacy_id → new id={new_track_id}")
            elif artist_name and track_title:
                new_track_id = find_track_by_name(artist_name, track_title)
                if new_track_id:
                    print(f"    → matched by name → new id={new_track_id}")

            if not new_track_id:
                stats["not_in_db"] += 1
                print(f"    → NOT IN DB: '{artist_name}' — '{track_title}'")
                time.sleep(0.15)
                continue

            stats["matched"] += 1
            if not args.dry_run:
                ok = sb_patch("profiles", {"id": p["id"]}, {
                    "mood_song_track_id": new_track_id,
                    "mood_song_set_at": "2026-06-08T00:00:00Z",
                })
                if ok:
                    stats["updated"] += 1
                    print(f"    → SET ✓")
                else:
                    print(f"    → DB update FAILED")
            else:
                stats["updated"] += 1
                print(f"    → [dry-run] would set id={new_track_id}")

            time.sleep(0.2)

    print("\n── Results ──")
    for k, v in stats.items():
        print(f"  {k}: {v}")
    if stats["found"] > 0:
        match_rate = stats["matched"] / stats["found"] * 100
        print(f"  match rate: {match_rate:.0f}%")


if __name__ == "__main__":
    main()
