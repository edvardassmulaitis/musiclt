#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scraper/charts/ingest.py — išorinių topų (external_charts) ingestion.

Atkurta 2026-07-09 (senoji versija gyveno tik scheduled task aplinkoje ir dingo
kartu su ja — žr. pokalbio istoriją). Šaltiniai:

  KASDIEN:
    • apple      — Apple Music RSS most-played (lt/gb/us), 100 dainų
    • shazam     — 7 šalys po 20, per Apple Music playlist'us (listid iš
                   shazam.com/services/charts/locations; LT Shazam nepalaiko)
    • youtube    — kworb.net/youtube/insights/lt_daily.html (top 20)
  SAVAITINIAI (praleidžiami, jei period_label jau DB):
    • spotify    — kworb.net/spotify/country/{lt,us,gb,global}_weekly.html
    • billboard  — hot100 / global200 / billboard-200
    • official_uk— singles / albums TOP 40
    • agata      — dainų + albumų TOP 100 (URL discovery iš agata.lt)
    • mama       — M.A.M.A TOP 40 (muzikosapdovanojimai.lt)
  IŠVESTINIAI:
    • consensus  — perskaičiuojamas iš is_current laidų (žr. CONSENSUS_RECIPES)

Po ingest'o — resolver: chart_resolution_memory + tikslus katalogo match
(artists.name_norm / tracks.title_norm). Sudėtingesnius atvejus (prefix,
containment) paliekam admin „Auto-match"/rankiniam flow /admin/charts.

ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
Naudojimas: python3 ingest.py [--dry] [--only spotify,apple,...]
"""
import json
import os
import re
import sys
import time
import unicodedata
import urllib.request
import urllib.error
from datetime import date, datetime, timezone
from html import unescape

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

DRY = "--dry" in sys.argv
ONLY = None
for i, a in enumerate(sys.argv):
    if a == "--only" and i + 1 < len(sys.argv):
        ONLY = set(sys.argv[i + 1].split(","))
TODAY = date.today().isoformat()


# ────────────────────────────────────────────────────────── HTTP helpers ──
def http_get(url, timeout=45, headers=None):
    """GET be proxy (tiesioginis egress veikia visiems šaltiniams)."""
    h = {"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9,lt;q=0.8"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="replace")


def sb_req(method, path, body=None, params=""):
    """Supabase PostgREST užklausa service_role raktu."""
    url = f"{SUPABASE_URL}/rest/v1/{path}{params}"
    h = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation,resolution=merge-duplicates",
    }
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=60) as r:
            txt = r.read().decode()
            return json.loads(txt) if txt else None
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:500]
        raise RuntimeError(f"{method} {path} -> {e.code}: {detail}") from e


def sb_select(path_with_params):
    return sb_req("GET", path_with_params) or []


# ─────────────────────────────────────────────── normalizacija (resolver) ──
# Portas iš lib/chart-resolve.ts — laikyti sinchronizuotą!
LT_MAP = {
    "ą": "a", "č": "c", "ę": "e", "ė": "e", "į": "i", "š": "s", "ų": "u",
    "ū": "u", "ž": "z", "ł": "l", "ø": "o", "đ": "d", "æ": "ae", "œ": "oe",
    "ß": "ss",
}
VERSION_KW = (
    r"remaster|remastered|re-?master(?:ed)?|version|edit|mix|remix|mono|stereo|live|"
    r"acoustic|unplugged|demo|single|radio|instrumental|karaoke|bonus|expanded|deluxe|"
    r"anniversary|re-?recorded|reprise|explicit|clean|extended|club|dub|session|"
    r"sped\s*up|slowed|soundtrack|ost|taylor['’]s version"
)
_ver_re = re.compile(r"\s[-–—]\s[^-–—]*\b(?:%s)\b.*$" % VERSION_KW, re.I)
_feat_re = re.compile(
    r"\([^)]*\b(?:feat|ft|featuring)[^)]*\)|\([^)]*remix[^)]*\)|\([^)]*version[^)]*\)|"
    r"\([^)]*w/[^)]*\)|\b(?:feat|ft|featuring)\.?\b.*$"
)


def strip_version_suffix(s):
    out, prev = s, None
    while out != prev:
        prev = out
        out = _ver_re.sub("", out)
    return out.strip()


def deaccent(s):
    s = (s or "").lower()
    s = "".join(LT_MAP.get(c, c) for c in s)
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c))


def col_norm(s):
    return deaccent(s).strip()


def normalize_for_match(s):
    out = strip_version_suffix(deaccent(s))
    out = _feat_re.sub("", out)
    out = re.sub(r"[^\w\d]+", " ", out, flags=re.UNICODE).strip()
    out = re.sub(r"\s+", " ", out)
    return re.sub(r"^the\s+", "", out)


def norm_key(artist, title):
    return f"{normalize_for_match(artist)}|{normalize_for_match(title)}"


# ─────────────────────────────────────────────────────────── HTML utils ──
def strip_tags(s):
    return unescape(re.sub(r"<[^>]+>", "", s)).strip()


def parse_move(txt, position):
    """kworb '+2'/'-1'/'='/'NEW'/'RE' → (prev_position, is_new)."""
    t = (txt or "").strip()
    if t in ("NEW", "RE", ""):
        return None, t == "NEW"
    if t == "=":
        return position, False
    m = re.match(r"^([+-])(\d+)$", t)
    if m:
        delta = int(m.group(2))
        return position + delta if m.group(1) == "+" else position - delta, False
    return None, False


# ──────────────────────────────────────────────────────────── fetchers ──
# Kiekvienas grąžina (period_label, entries[]); entries laukai:
# position, artist_name, title, [prev_position, is_new, weeks_on_chart,
# cover_url, youtube_url]

def fetch_kworb_spotify(page):
    h = http_get(f"https://kworb.net/spotify/country/{page}_weekly.html")
    dm = re.search(r"(20\d\d)/(\d\d)/(\d\d)", h)
    period = f"{dm.group(1)}-{dm.group(2)}-{dm.group(3)}" if dm else TODAY
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", h, re.S)
    entries = []
    for r in rows[1:]:
        cells = re.findall(r"<td[^>]*>(.*?)</td>", r, re.S)
        if len(cells) < 5:
            continue
        pos_txt = strip_tags(cells[0])
        if not pos_txt.isdigit():
            continue
        pos = int(pos_txt)
        if pos > 100:
            break
        cell = cells[2]
        am = re.search(r'<a href="\.\./artist/[^"]*">(.*?)</a>', cell, re.S)
        tm = re.search(r'<a href="\.\./track/[^"]*">(.*?)</a>(.*)$', cell, re.S)
        if tm:
            artist = strip_tags(am.group(1)) if am else ""
            title = (strip_tags(tm.group(1)) + " " + strip_tags(tm.group(2))).strip()
        else:
            at = strip_tags(cell)
            if " - " not in at:
                continue
            artist, title = at.split(" - ", 1)
        if not artist:
            at = strip_tags(cell)
            artist = at.split(" - ", 1)[0]
        prev, is_new = parse_move(strip_tags(cells[1]), pos)
        wks = strip_tags(cells[3])
        entries.append({
            "position": pos, "artist_name": artist.strip(), "title": title.strip(),
            "prev_position": prev, "is_new": is_new,
            "weeks_on_chart": int(wks) if wks.isdigit() else None,
        })
    return period, entries


def fetch_apple(cc):
    h = http_get(f"https://rss.marketingtools.apple.com/api/v2/{cc}/music/most-played/100/songs.json")
    feed = json.loads(h)["feed"]
    entries = []
    for i, it in enumerate(feed.get("results", []), start=1):
        entries.append({
            "position": i,
            "artist_name": it.get("artistName", "").strip(),
            "title": it.get("name", "").strip(),
            "cover_url": it.get("artworkUrl100"),
        })
    return TODAY, entries


def fetch_kworb_youtube_lt():
    h = http_get("https://kworb.net/youtube/insights/lt_daily.html")
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", h, re.S)
    entries = []
    for r in rows[1:]:
        cells = re.findall(r"<td[^>]*>(.*?)</td>", r, re.S)
        if len(cells) < 3:
            continue
        pos = int(strip_tags(cells[0]))
        at = strip_tags(cells[2])
        if " - " not in at:
            artist, title = at, at
        else:
            artist, title = at.split(" - ", 1)
        prev, is_new = parse_move(strip_tags(cells[1]), pos)
        entries.append({
            "position": pos, "artist_name": artist.strip(), "title": title.strip(),
            "prev_position": prev, "is_new": is_new,
        })
    return TODAY, entries


_shazam_locations = None


def shazam_playlist_id(cc):
    """Shazam šalių topai = Apple Music grojaraščiai. listid iš viešo
    /services/charts/locations (vienintelis shazam.com path be IP blokavimo).
    PASTABA: Lietuvos Shazam NEpalaiko (70 šalių sąraše nėra LT) — senieji
    'lt' duomenys buvo geo-fallback šiukšlės."""
    global _shazam_locations
    if _shazam_locations is None:
        # DĖMESIO: shazam.com 405'ina pilną Chrome UA, bet leidžia paprastą.
        _shazam_locations = json.loads(http_get(
            "https://www.shazam.com/services/charts/locations",
            headers={"User-Agent": "Mozilla/5.0"}))
    for c in _shazam_locations["countries"]:
        if c["id"] == cc:
            return c["listid"]
    raise RuntimeError(f"Shazam nepalaiko šalies {cc}")


def fetch_apple_playlist(listid, limit=20):
    """Vieša Apple Music playlist puslapio serialized-server-data → tracklist."""
    h = http_get(f"https://music.apple.com/us/playlist/x/{listid}")
    m = re.search(r'<script type="application/json" id="serialized-server-data">(.*?)</script>', h, re.S)
    if not m:
        raise RuntimeError("Apple playlist be serialized-server-data")
    d = json.loads(m.group(1))
    tracks = []

    def w(o):
        if isinstance(o, dict):
            if "artistName" in o and "title" in o and str(o.get("id", "")).startswith("track-lockup"):
                tracks.append(o)
                return
            for v in o.values():
                w(v)
        elif isinstance(o, list):
            for v in o:
                w(v)

    w(d)
    entries = []
    for i, t in enumerate(tracks[:limit], start=1):
        art = None
        am = re.search(r'"url":\s*"(https://is\d[^"]*mzstatic[^"]*)"', json.dumps(t.get("artwork") or {}))
        if am:
            art = am.group(1)
        entries.append({
            "position": i,
            "artist_name": (t.get("artistName") or "").strip(),
            "title": (t.get("title") or "").strip(),
            "cover_url": art,
        })
    return entries


SHAZAM_CC = {"us": "US", "uk": "GB", "de": "DE", "fr": "FR", "br": "BR", "es": "ES", "mx": "MX"}


def fetch_shazam(key):
    if key not in SHAZAM_CC:
        raise RuntimeError(f"Shazam nepalaiko '{key}' (Lietuvos Shazam charts neegzistuoja)")
    entries = fetch_apple_playlist(shazam_playlist_id(SHAZAM_CC[key]), limit=20)
    if not entries:
        raise RuntimeError("tuščias Shazam playlist")
    return TODAY, entries


def fetch_billboard(slug):
    h = http_get(f"https://www.billboard.com/charts/{slug}/")
    dm = re.search(r"Week of (\w+ \d+, \d{4})", h)
    period = TODAY
    if dm:
        try:
            period = datetime.strptime(dm.group(1), "%B %d, %Y").date().isoformat()
        except ValueError:
            pass
    entries = []
    # Eilutės blokas prasideda '<ul class="o-chart-results-list-row' (viduje yra
    # nested <ul>, todėl non-greedy ...</ul> NETINKA — split'inam per pradžią).
    for block in h.split('<ul class="o-chart-results-list-row')[1:]:
        tm = re.search(r'<h3 id="title-of-a-story"[^>]*>(.*?)</h3>', block, re.S)
        labels = [strip_tags(x) for x in re.findall(r'<span class="\s*c-label[^"]*"[^>]*>(.*?)</span>', block, re.S)]
        if not tm or not labels or not labels[0].isdigit():
            continue
        pos = int(labels[0])
        title = strip_tags(tm.group(1))
        am = re.search(r'<span class="\s*c-label\s+a-no-trucate[^"]*"[^>]*>(.*?)</span>', block, re.S)
        artist = strip_tags(am.group(1)) if am else ""
        if not artist:
            cands = [x for x in labels[1:]
                     if x and not x.isdigit() and x != "-" and not re.fullmatch(r"(?i)NEW|RE-?\s*ENTRY", x)]
            artist = cands[0] if cands else ""
        nums = [x for x in labels[1:] if x.isdigit() or x == "-"]
        prev = int(nums[0]) if nums and nums[0].isdigit() else None
        wks = int(nums[2]) if len(nums) >= 3 and nums[2].isdigit() else None
        is_new = any(re.fullmatch(r"(?i)NEW|RE-?\s*ENTRY", x) for x in labels[1:3])
        if artist:
            entries.append({
                "position": pos, "artist_name": artist, "title": title,
                "prev_position": prev, "weeks_on_chart": wks, "is_new": is_new,
            })
    entries.sort(key=lambda e: e["position"])
    return period, entries[:100]


def fetch_official_uk(kind):
    slug = "singles-chart" if kind == "singles" else "albums-chart"
    h = http_get(f"https://www.officialcharts.com/charts/{slug}/")
    dm = re.search(r"(\d{1,2}\s+\w+\s+\d{4})\s*[-–—]\s*(\d{1,2}\s+\w+\s+\d{4})", strip_tags(h))
    period = TODAY
    if dm:
        try:
            period = datetime.strptime(re.sub(r"\s+", " ", dm.group(2)), "%d %B %Y").date().isoformat()
        except ValueError:
            pass
    entries = []
    seen = set()
    # officialcharts.com: .chart-item blokas su .chart-name / .chart-artist / .position
    for block in re.split(r'class="chart-item', h)[1:]:
        block = block[:6000]
        pm = re.search(r'class="position[^"]*"[^>]*>\s*<strong>?\s*(\d+)', block) or \
             re.search(r'<strong>(\d+)</strong>', block)
        nm = re.search(r'class="chart-name[^"]*"[^>]*>(.*?)</a>', block, re.S) or \
             re.search(r'class="chart-name[^"]*"[^>]*>(.*?)<', block, re.S)
        am = re.search(r'class="chart-artist[^"]*"[^>]*>(.*?)</a>', block, re.S) or \
             re.search(r'class="chart-artist[^"]*"[^>]*>(.*?)<', block, re.S)
        if not (pm and nm and am):
            continue
        pos = int(pm.group(1))
        if pos in seen or pos > 40:
            continue
        seen.add(pos)
        title = strip_tags(nm.group(1))
        title = re.sub(r"^(?:New|Re(?:-?entry)?)\s*(?=[A-Z0-9(])", "", title).strip()
        lw = re.search(r"LW:\s*(\d+|New|Re)", strip_tags(block), re.I)
        prev = int(lw.group(1)) if lw and lw.group(1).isdigit() else None
        entries.append({
            "position": pos, "artist_name": strip_tags(am.group(1)), "title": title,
            "prev_position": prev,
        })
    entries.sort(key=lambda e: e["position"])
    return period, entries[:40]


def agata_discover_url():
    h = http_get("https://www.agata.lt/lt/")
    m = re.search(r'href="\s*(?:https?://www\.agata\.lt)?(/lt/naujienos/s\d+-\d+/)\s*"', h)
    if not m:
        raise RuntimeError("nerasta savaitės topo nuoroda agata.lt")
    return "https://www.agata.lt" + m.group(1)


def fetch_agata(kind, url):
    """kind: 'singles' | 'albums'. Puslapyje 2 lentelės: 1-a dainų, 2-a albumų."""
    h = http_get(url)
    wm = re.search(r"/s(\d+)-", url)
    week = int(wm.group(1)) if wm else 0
    period = f"2026 {week} sav." if week else TODAY
    tables = re.findall(r"<table[^>]*>(.*?)</table>", h, re.S)
    if not tables:
        raise RuntimeError("AGATA lentelių nerasta")
    # Puslapyje 1-a lentelė — ALBUMAI, 2-a — SINGLAI (patikrinta prieš DB laidas).
    idx = 1 if (kind == "singles" and len(tables) > 1) else 0
    entries = []
    for r in re.findall(r"<tr[^>]*>(.*?)</tr>", tables[idx], re.S):
        cells = [strip_tags(c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", r, re.S)]
        if len(cells) < 5 or not cells[0].isdigit():
            continue
        prev = int(cells[1]) if cells[1].isdigit() else None
        wks = int(cells[2]) if cells[2].isdigit() else None
        entries.append({
            "position": int(cells[0]), "artist_name": cells[3], "title": cells[4],
            "prev_position": prev, "weeks_on_chart": wks, "is_new": prev is None,
        })
    return period, entries[:100]


MAMA_PLAYLIST_FALLBACK = "2LcUqwlD7WzrbCbsWSW4GQ"


def fetch_mama():
    """M.A.M.A TOP 40 = Spotify grojaraštis (atnaujinamas penktadieniais).
    Track sąrašas — iš viešo open.spotify.com/embed puslapio __NEXT_DATA__."""
    pid = MAMA_PLAYLIST_FALLBACK
    try:
        page = http_get("https://muzikosapdovanojimai.lt/m-a-m-a-top-40/")
        m = re.search(r"open\.spotify\.com/embed/playlist/([A-Za-z0-9]+)", page)
        if m:
            pid = m.group(1)
    except Exception:
        pass
    h = http_get(f"https://open.spotify.com/embed/playlist/{pid}")
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', h, re.S)
    if not m:
        raise RuntimeError("spotify embed be __NEXT_DATA__")
    d = json.loads(m.group(1))

    def find_tracklist(o):
        if isinstance(o, dict):
            if "trackList" in o:
                return o["trackList"]
            for v in o.values():
                r = find_tracklist(v)
                if r is not None:
                    return r
        elif isinstance(o, list):
            for v in o:
                r = find_tracklist(v)
                if r is not None:
                    return r
        return None

    tl = find_tracklist(d) or []
    entries = []
    for i, t in enumerate(tl[:40], start=1):
        entries.append({
            "position": i,
            "artist_name": (t.get("subtitle") or "").strip(),
            "title": (t.get("title") or "").strip(),
        })
    # grojaraštis atnaujinamas penktadieniais → period = paskutinis penktadienis
    today = date.today()
    friday = today.toordinal() - ((today.weekday() - 4) % 7)
    period = date.fromordinal(friday).isoformat()
    return period, entries


# ───────────────────────────────────────────────────────── DB operacijos ──
def get_current_charts():
    return sb_select("external_charts?is_current=eq.true&select=*")


def get_entries(chart_id):
    out, frm = [], 0
    while True:
        page = sb_select(
            f"external_chart_entries?chart_id=eq.{chart_id}"
            f"&select=position,prev_position,weeks_on_chart,artist_name,title,cover_url,youtube_url"
            f"&order=position&offset={frm}&limit=1000")
        out.extend(page)
        if len(page) < 1000:
            return out
        frm += 1000


def edition_exists(source, chart_key, period_label):
    r = sb_select(
        "external_charts?select=id&source=eq.%s&chart_key=eq.%s&period_label=eq.%s"
        % (source, chart_key, urllib.request.quote(period_label)))
    return bool(r)


def insert_edition(meta, period_label, entries, prev_entries):
    """Įrašo naują edition + entries. Trigger'is nuima seną is_current."""
    prev_map = {norm_key(e["artist_name"], e["title"]): e for e in prev_entries}
    chart = {k: meta[k] for k in (
        "source", "chart_key", "title", "subtitle", "country", "scope", "size",
        "accent", "source_url", "attribution", "cover_image_url", "featured",
        "featured_order") if k in meta}
    chart.update({
        "period_label": period_label,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "is_current": True,
    })
    if DRY:
        print(f"  DRY: {meta['source']}/{meta['chart_key']} '{period_label}' — {len(entries)} entries; "
              f"top3: " + "; ".join(f"{e['position']}.{e['artist_name']} - {e['title']}" for e in entries[:3]))
        return None
    created = sb_req("POST", "external_charts", [chart])
    chart_id = created[0]["id"]
    rows = []
    for e in entries:
        k = norm_key(e["artist_name"], e["title"])
        pe = prev_map.get(k)
        prev_pos = e.get("prev_position")
        if prev_pos is None and pe:
            prev_pos = pe["position"]
        wks = e.get("weeks_on_chart")
        if wks is None:
            wks = (pe.get("weeks_on_chart") or 0) + 1 if pe else 1
        rows.append({
            "chart_id": chart_id,
            "position": e["position"],
            "prev_position": prev_pos,
            "weeks_on_chart": wks,
            "is_new": bool(e.get("is_new")) if e.get("is_new") is not None else (pe is None),
            "artist_name": e["artist_name"][:300],
            "title": e["title"][:300],
            "cover_url": e.get("cover_url") or (pe or {}).get("cover_url"),
            "youtube_url": e.get("youtube_url") or (pe or {}).get("youtube_url"),
        })
    for i in range(0, len(rows), 200):
        sb_req("POST", "external_chart_entries", rows[i:i + 200])
    print(f"  ✓ {meta['source']}/{meta['chart_key']} '{period_label}' — {len(rows)} entries (chart_id={chart_id})")
    return chart_id


# ─────────────────────────────────────────────────────────── consensus ──
CONSENSUS_RECIPES = {
    "lt":           [("agata", "singles"), ("apple", "lt_songs"), ("mama", "top40"), ("spotify", "lt")],
    "us":           [("apple", "us_songs"), ("billboard", "hot100"), ("spotify", "us")],
    "uk":           [("apple", "gb_songs"), ("official_uk", "singles"), ("spotify", "uk")],
    "world":        [("billboard", "global200"), ("spotify", "global")],
    "albums":       [("billboard", "albums"), ("official_uk", "albums")],
    "shazam_world": [("shazam", k) for k in ("us", "uk", "de", "fr", "br", "es", "mx")],
}


def rebuild_consensus(charts_by_key):
    for ckey, recipe in CONSENSUS_RECIPES.items():
        meta = charts_by_key.get(("consensus", ckey))
        if not meta:
            continue
        size = meta.get("size") or 100
        agg = {}
        used = []
        for (src, key) in recipe:
            src_meta = charts_by_key.get((src, key))
            if not src_meta:
                continue
            entries = get_entries(src_meta["id"])
            if not entries:
                continue
            used.append(src)
            n = max(len(entries), 1)
            for e in entries:
                k = norm_key(e["artist_name"], e["title"])
                score = (n - e["position"] + 1) / n
                a = agg.setdefault(k, {"score": 0.0, "cnt": 0, "e": e})
                a["score"] += score
                a["cnt"] += 1
        if not agg:
            print(f"  consensus/{ckey}: nėra šaltinių, praleista")
            continue
        ranked = sorted(agg.values(), key=lambda a: (-(a["score"] + 0.05 * a["cnt"]), a["e"]["position"]))[:size]
        entries = []
        for i, a in enumerate(ranked, start=1):
            e = a["e"]
            entries.append({
                "position": i, "artist_name": e["artist_name"], "title": e["title"],
                "cover_url": e.get("cover_url"), "youtube_url": e.get("youtube_url"),
            })
        prev = get_entries(meta["id"])
        meta2 = dict(meta)
        meta2["attribution"] = "Apjungta: " + ", ".join(sorted(set(used)))
        if edition_exists("consensus", ckey, TODAY):
            print(f"  consensus/{ckey}: {TODAY} jau yra, praleista")
            continue
        insert_edition(meta2, TODAY, entries, prev)


# ──────────────────────────────────────────────────────────── resolver ──
def resolve_new_entries():
    """Memory + tikslus katalogo match visiems pending/text_only is_current entry."""
    charts = {c["id"]: c for c in get_current_charts() if c["source"] != "consensus" or True}
    ids = list(charts.keys())
    if not ids:
        return
    pend = []
    for i in range(0, len(ids), 30):
        chunk = ",".join(str(x) for x in ids[i:i + 30])
        pend.extend(sb_select(
            f"external_chart_entries?chart_id=in.({chunk})"
            f"&resolve_state=in.(pending,text_only)&select=id,chart_id,artist_name,title"))
    if not pend:
        print("  resolver: nėra pending")
        return 0
    print(f"  resolver: {len(pend)} entries")

    # 1) chart_resolution_memory
    keys = {}
    for e in pend:
        keys.setdefault(norm_key(e["artist_name"], e["title"]), []).append(e)
    mem = []
    klist = list(keys.keys())
    for i in range(0, len(klist), 50):
        qs = ",".join('"%s"' % k.replace('"', '') for k in klist[i:i + 50])
        mem.extend(sb_select(
            f"chart_resolution_memory?kind=eq.track&norm_key=in.({urllib.request.quote(qs)})"
            f"&select=norm_key,track_id,artist_id"))
    matched = {}
    for m in mem:
        for e in keys.get(m["norm_key"], []):
            matched[e["id"]] = {"track_id": m["track_id"], "artist_id": m["artist_id"]}

    # 2) tikslus katalogas: artists.name_norm → tracks.title_norm
    rest = [e for e in pend if e["id"] not in matched]
    a_norms = {}
    for e in rest:
        full = col_norm(e["artist_name"])
        first = col_norm(re.split(r",|&| x | X |\bfeat\b|\bft\b", e["artist_name"])[0])
        for cand in {full, first}:
            if cand:
                a_norms.setdefault(cand, []).append(e)
    artists = []
    alist = list(a_norms.keys())
    for i in range(0, len(alist), 60):
        qs = ",".join('"%s"' % a.replace('"', '') for a in alist[i:i + 60])
        artists.extend(sb_select(f"artists?name_norm=in.({urllib.request.quote(qs)})&select=id,name_norm"))
    art_by_norm = {}
    for a in artists:
        art_by_norm.setdefault(a["name_norm"], a["id"])
    want = {}
    for anorm, aid in art_by_norm.items():
        for e in a_norms.get(anorm, []):
            if e["id"] in matched:
                continue
            tn = col_norm(strip_version_suffix(e["title"]))
            want.setdefault((aid, tn), []).append(e)
    pairs = list(want.keys())
    for i in range(0, len(pairs), 40):
        chunk = pairs[i:i + 40]
        aids = ",".join(str(a) for a, _ in chunk)
        tns = ",".join('"%s"' % t.replace('"', '') for _, t in chunk)
        found = sb_select(
            f"tracks?artist_id=in.({aids})&title_norm=in.({urllib.request.quote(tns)})"
            f"&select=id,artist_id,title_norm")
        for t in found:
            for e in want.get((t["artist_id"], t["title_norm"]), []):
                if e["id"] not in matched:
                    matched[e["id"]] = {"track_id": t["id"], "artist_id": t["artist_id"]}

    print(f"  resolver: match'inta {len(matched)}")
    if DRY:
        return 0
    items = list(matched.items())
    for eid, m in items:
        sb_req("PATCH", f"external_chart_entries?id=eq.{eid}",
               {"track_id": m["track_id"], "artist_id": m["artist_id"], "resolve_state": "matched"})
    # world/social scope be match → text_only (kad UI rodytų tekstinį įrašą)
    for e in pend:
        if e["id"] in matched:
            continue
        scope = charts.get(e["chart_id"], {}).get("scope")
        if scope in ("world", "social"):
            sb_req("PATCH", f"external_chart_entries?id=eq.{e['id']}&resolve_state=eq.pending",
                   {"resolve_state": "text_only"})
    # atmintis
    mem_rows = []
    seen = set()
    by_id = {e["id"]: e for e in pend}
    for eid, m in items:
        e = by_id[eid]
        k = norm_key(e["artist_name"], e["title"])
        if k in seen:
            continue
        seen.add(k)
        mem_rows.append({
            "norm_key": k, "kind": "track", "track_id": m["track_id"],
            "artist_id": m["artist_id"], "resolve_state": "matched",
            "last_artist_name": e["artist_name"], "last_title": e["title"],
        })
    for i in range(0, len(mem_rows), 100):
        try:
            sb_req("POST", "chart_resolution_memory?on_conflict=norm_key,kind",
                   mem_rows[i:i + 100], params="")
        except RuntimeError:
            pass  # atmintis — best effort
    return len(matched)


# ───────────────────────────────────────────────────────────────── main ──
DAILY_SOURCES = [
    ("apple", "lt_songs", lambda: fetch_apple("lt")),
    ("apple", "gb_songs", lambda: fetch_apple("gb")),
    ("apple", "us_songs", lambda: fetch_apple("us")),
    ("youtube", "lt_music", fetch_kworb_youtube_lt),
    ("shazam", "us", lambda: fetch_shazam("us")),
    ("shazam", "uk", lambda: fetch_shazam("uk")),
    ("shazam", "de", lambda: fetch_shazam("de")),
    ("shazam", "fr", lambda: fetch_shazam("fr")),
    ("shazam", "br", lambda: fetch_shazam("br")),
    ("shazam", "es", lambda: fetch_shazam("es")),
    ("shazam", "mx", lambda: fetch_shazam("mx")),
]
WEEKLY_SOURCES = [
    ("spotify", "lt", lambda: fetch_kworb_spotify("lt")),
    ("spotify", "us", lambda: fetch_kworb_spotify("us")),
    ("spotify", "uk", lambda: fetch_kworb_spotify("gb")),
    ("spotify", "global", lambda: fetch_kworb_spotify("global")),
    ("billboard", "hot100", lambda: fetch_billboard("hot-100")),
    ("billboard", "global200", lambda: fetch_billboard("billboard-global-200")),
    ("billboard", "albums", lambda: fetch_billboard("billboard-200")),
    ("official_uk", "singles", lambda: fetch_official_uk("singles")),
    ("official_uk", "albums", lambda: fetch_official_uk("albums")),
]


def main():
    if not SUPABASE_URL or not SERVICE_KEY:
        print("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY nenustatyti", file=sys.stderr)
        sys.exit(1)
    charts = get_current_charts()
    by_key = {(c["source"], c["chart_key"]): c for c in charts}
    results = {"ok": [], "skip": [], "err": []}

    sources = DAILY_SOURCES + WEEKLY_SOURCES
    # AGATA (bendras URL discovery abiem topams)
    try:
        agata_url = agata_discover_url()
        sources += [
            ("agata", "singles", lambda: fetch_agata("singles", agata_url)),
            ("agata", "albums", lambda: fetch_agata("albums", agata_url)),
        ]
    except Exception as e:
        results["err"].append(f"agata discovery: {e}")
    sources.append(("mama", "top40", fetch_mama))

    for source, chart_key, fn in sources:
        if ONLY and source not in ONLY:
            continue
        meta = by_key.get((source, chart_key))
        if not meta:
            results["skip"].append(f"{source}/{chart_key}: nėra metaduomenų DB")
            continue
        try:
            period, entries = fn()
            if len(entries) < 5:
                raise RuntimeError(f"per mažai entries ({len(entries)}) — parseris lūžo?")
            if period == meta["period_label"] or edition_exists(source, chart_key, period):
                results["skip"].append(f"{source}/{chart_key}: '{period}' jau yra")
                continue
            prev = get_entries(meta["id"])
            insert_edition(meta, period, entries, prev)
            results["ok"].append(f"{source}/{chart_key} → {period} ({len(entries)})")
        except Exception as e:
            results["err"].append(f"{source}/{chart_key}: {e}")
        time.sleep(0.4)

    # consensus — iš atsinaujinusių is_current
    if not ONLY or "consensus" in ONLY:
        try:
            charts2 = {(c["source"], c["chart_key"]): c for c in get_current_charts()}
            rebuild_consensus(charts2)
        except Exception as e:
            results["err"].append(f"consensus: {e}")

    # resolver — kartojam kol nebėra naujų match'ų (PostgREST 1000/page cap)
    if not DRY:
        for _ in range(6):
            try:
                if resolve_new_entries() == 0:
                    break
            except Exception as e:
                results["err"].append(f"resolver: {e}")
                break

    print("\n== SUVESTINĖ ==")
    for k in ("ok", "skip", "err"):
        for line in results[k]:
            print(f" {k.upper()}: {line}")
    if results["err"]:
        sys.exit(2)


if __name__ == "__main__":
    main()
