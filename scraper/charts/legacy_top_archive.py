#!/usr/bin/env python3
"""legacy_top_archive.py — senojo music.lt savaitinių TOP 40 / LT TOP 30 archyvo
nuscrapinimas į top_weeks / top_entries (is_legacy=true, is_finalized=true).

Stdlib only (urllib) — portabilu Mac'ui. Env: NEXT_PUBLIC_SUPABASE_URL,
SUPABASE_SERVICE_ROLE_KEY.

Šaltinis (reverse-engineered iš /top40/archyvas kalendoriaus JS):
  GET /ajax.php?top;get_week.{w};from.{d};to.{d};      → kanoninė savaitė (pirmad..sekmad)
  GET /ajax.php?top;from.{firstday};to.{sunday};topid.{1|2}  → savaitės chart'as (HTML)
  topid: 1 = TOP 40, 2 = LT TOP 30.
  Kiekvienas įrašas turi /lt/daina/{slug}/{LEGACY_ID}/ → match'inam į tracks.legacy_id.

Naudojimas:
  cd "<projektas>" && set -a && . musiclt/.env.local && set +a
  python3 scraper/charts/legacy_top_archive.py --topid 1 --from 2014-06-16 --weeks 4
  python3 scraper/charts/legacy_top_archive.py --topid both --from 2008-01-07 --to 2025-12-29
  python3 scraper/charts/legacy_top_archive.py --topid 1 --from 2014-06-16 --weeks 2 --dry-run

Idempotentiška: upsert pagal (top_type, week_start); entries delete-then-insert.
Saugiklis: NETOUCH'inam live voting savaičių (is_legacy=false) — tik praleidžiam.
"""
from __future__ import annotations
import os, re, sys, json, time, ssl, argparse, datetime as dt
import urllib.request, urllib.parse, urllib.error

_CTX = ssl.create_default_context()
_CTX_NV = ssl._create_unverified_context()  # macOS fallback kai trūksta cert'ų

BASE = "https://www.music.lt"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
TOPID_TYPE = {1: "top40", 2: "lt_top30"}


def _env():
    return os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/"), os.environ["SUPABASE_SERVICE_ROLE_KEY"]


def _urlopen(req, retries: int = 3):
    """urlopen su macOS SSL fallback (Python.org build dažnai be cert'ų) + retry."""
    last = None
    for attempt in range(retries):
        for ctx in (_CTX, _CTX_NV):
            try:
                return urllib.request.urlopen(req, timeout=30, context=ctx)
            except urllib.error.HTTPError:
                raise  # HTTP klaidos (4xx/5xx) — ne SSL, mesti iškart
            except (urllib.error.URLError, ssl.SSLError) as e:
                last = e
                reason = getattr(e, "reason", None)
                if not isinstance(e, ssl.SSLError) and not isinstance(reason, ssl.SSLError):
                    break  # ne SSL — į retry su pauze (ne NV)
        time.sleep(1.0 * (attempt + 1))
    raise last if last else RuntimeError("urlopen failed")


def _sb(method, path, body=None, prefer=None):
    url, key = _env()
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url + path, data=data, method=method)
    req.add_header("apikey", key); req.add_header("Authorization", f"Bearer {key}")
    req.add_header("Content-Type", "application/json"); req.add_header("User-Agent", UA)
    if prefer:
        req.add_header("Prefer", prefer)
    try:
        with _urlopen(req) as r:
            txt = r.read().decode()
            return json.loads(txt) if txt.strip() else []
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path} -> {e.code}: {e.read().decode()[:300]}")


def _fetch(url: str) -> str:
    """GET su retry (music.lt kartais drop'ina/throttle'ina) + macOS SSL fallback."""
    req = urllib.request.Request(url)
    req.add_header("User-Agent", UA)
    with _urlopen(req) as r:
        return r.read().decode("utf-8", "replace")


# ─────────────────────────── music.lt fetch ───────────────────────────
def canonical_week(date: dt.date) -> dict | None:
    """date → {firstday, sunday} (kanoninė savaitė pagal music.lt)."""
    d = date.isoformat()
    url = f"{BASE}/ajax.php?top;get_week.0;from.{d};to.{d};"
    try:
        j = json.loads(_fetch(url))
        return {"firstday": j["firstday"], "sunday": j["sunday"]}
    except Exception:
        return None


def fetch_week_html(firstday: str, sunday: str, topid: int) -> str:
    url = f"{BASE}/ajax.php?top;from.{firstday};to.{sunday};topid.{topid}"
    return _fetch(url)


# ─────────────────────────── parsing ───────────────────────────
_RE_DAINA = re.compile(r"(?:lt/)?daina/([^/\"]+)/(\d+)")
_RE_GRUPE = re.compile(r"(?:lt/)?grupe/([^/\"]+)/(\d+)")
_RE_POS = re.compile(r'class="large">\s*(\d+)')
_RE_TITLE = re.compile(r'<a[^>]*title="([^"]*)"[^>]*>\s*<b>')
_RE_META = re.compile(r"Savaičių tope:\s*(\d+).*?aukščiausia vieta:\s*(\d+)", re.S)
_RE_CHANGE = re.compile(r'class="large">\s*\d+\s*<br\s*/?>\s*<span[^>]*>\s*([^<]*)</span>', re.S)


def _slug_to_name(slug: str) -> str:
    return urllib.parse.unquote(slug).replace("-", " ").strip()


def parse_week(html: str) -> list[dict]:
    """Grąžina [{position, legacy_track_id, title, artist_name, artist_legacy_id,
    weeks_in_top, peak_position, change}]."""
    out = []
    blocks = re.split(r'<tr class="table_row"', html)[1:]
    for b in blocks:
        mpos = _RE_POS.search(b)
        mdaina = _RE_DAINA.search(b)
        if not mpos or not mdaina:
            continue
        pos = int(mpos.group(1))
        slug, tid = mdaina.group(1), int(mdaina.group(2))
        mtitle = _RE_TITLE.search(b)
        title = (mtitle.group(1).strip() if mtitle else "")
        mgr = _RE_GRUPE.search(b)
        artist_name, artist_lid = "", None
        if mgr:
            artist_lid = int(mgr.group(2))
            # atlikėjo vardas iš link teksto
            mtxt = re.search(r"grupe/[^\"]+/\d+/\">([^<]+)</a>", b)
            artist_name = (mtxt.group(1).strip() if mtxt else _slug_to_name(mgr.group(1)))
        # fallback iš dainos slug'o „Artist-Title"
        if not title or not artist_name:
            parts = _slug_to_name(slug)
            if not artist_name and " " in parts:
                artist_name = artist_name or parts
        mmeta = _RE_META.search(b)
        weeks_in = int(mmeta.group(1)) if mmeta else None
        peak = int(mmeta.group(2)) if mmeta else None
        mch = _RE_CHANGE.search(b)
        change = (mch.group(1).strip() if mch else "")
        out.append({
            "position": pos, "legacy_track_id": tid, "title": title,
            "artist_name": artist_name, "artist_legacy_id": artist_lid,
            "weeks_in_top": weeks_in, "peak_position": peak, "change": change,
        })
    # dedupe pagal poziciją (kartais header'is įsimaišo)
    seen = {}
    for e in out:
        seen[e["position"]] = e
    return [seen[p] for p in sorted(seen)]


def prev_from_change(pos: int, weeks_in: int | None, change: str) -> tuple[int | None, bool]:
    """(prev_position, is_new) iš „+N/-N/NEW" žymos."""
    c = (change or "").upper()
    if "NAUJ" in c or "NEW" in c or (weeks_in == 1):
        return None, True
    m = re.search(r"([+-]?\d+)", c)
    if not m:
        return pos, False
    delta = int(m.group(1))   # +N = pakilo N (prev žemiau), -N = nukrito
    prev = pos + delta if delta > 0 else pos + delta  # prev = pos - (-delta)
    return (prev if prev > 0 else None), False


# ─────────────────────────── matching ───────────────────────────
def match_tracks(legacy_ids: list[int]) -> dict[int, dict]:
    """legacy_track_id → {id, artist_id} per tracks.legacy_id (batch)."""
    res = {}
    for i in range(0, len(legacy_ids), 150):
        chunk = legacy_ids[i:i + 150]
        idlist = ",".join(str(x) for x in chunk)
        rows = _sb("GET", f"/rest/v1/tracks?legacy_id=in.({idlist})&select=id,legacy_id,artist_id")
        for r in rows:
            res[r["legacy_id"]] = {"id": r["id"], "artist_id": r["artist_id"]}
    return res


# ─────────────────────────── storage ───────────────────────────
def get_or_create_week(top_type: str, week_start: str, dry: bool,
                       override_live: bool = False) -> int | None:
    rows = _sb("GET", f"/rest/v1/top_weeks?top_type=eq.{top_type}&week_start=eq.{week_start}"
                      f"&select=id,is_legacy,is_active")
    if rows:
        w = rows[0]
        if not w.get("is_legacy"):
            # Default: NETOUCH'inam live voting savaitės (saugiklis).
            if not override_live:
                print(f"    SKIP {top_type} {week_start}: egzistuoja NE-legacy (live voting) savaitė")
                return None
            # --override-live: perėjimo periodu (kol nauja sistema be balsuotojų)
            # perimam live savaitę music.lt duomenimis: pažymim kaip legacy/finalizuotą,
            # išjungiam aktyvumą. store_week paskui pakeis entries.
            if not dry:
                _sb("PATCH", f"/rest/v1/top_weeks?id=eq.{w['id']}",
                    {"is_legacy": True, "is_finalized": True, "is_active": False},
                    prefer="return=minimal")
            print(f"    OVERRIDE {top_type} {week_start}: live savaitė → legacy (music.lt)")
        return w["id"]
    if dry:
        return -1
    row = {"top_type": top_type, "week_start": week_start, "is_legacy": True,
           "is_finalized": True, "is_active": False, "total_votes": 0,
           "vote_close": f"{week_start}T23:59:59+00:00"}
    res = _sb("POST", "/rest/v1/top_weeks", [row], prefer="return=representation")
    return res[0]["id"]


def store_week(top_type: str, week_start: str, entries: list[dict], dry: bool,
               override_live: bool = False) -> dict:
    week_id = get_or_create_week(top_type, week_start, dry, override_live)
    if week_id is None:
        return {"skipped": True}
    matched_map = match_tracks([e["legacy_track_id"] for e in entries])

    rows = []
    for e in entries:
        m = matched_map.get(e["legacy_track_id"])
        prev, is_new = prev_from_change(e["position"], e["weeks_in_top"], e["change"])
        rows.append({
            "week_id": week_id, "top_type": top_type, "position": e["position"],
            "track_id": m["id"] if m else None,
            "legacy_track_id": e["legacy_track_id"],
            "artist_name": e["artist_name"] or None,
            "title": e["title"] or None,
            "prev_position": prev, "is_new": is_new,
            "weeks_in_top": e["weeks_in_top"], "peak_position": e["peak_position"],
            "total_votes": 0,
        })
    # Dedupe canonical track_id WITHIN savaitė: kelios legacy versijos (radio edit,
    # album cut) gali map'intis į tą patį kanoninį track'ą → (week_id, track_id) unique
    # constraint 409. Geriausią poziciją paliekam su track_id, dublikatams track_id=NULL
    # (legacy_track_id/title/artist lieka rodymui + vėlesniam relink'ui). NULL'ai unique
    # constraint'o nelaužia.
    seen_tid = {}
    dup_n = 0
    for r in sorted(rows, key=lambda x: x["position"]):
        tid = r["track_id"]
        if tid is None:
            continue
        if tid in seen_tid:
            r["track_id"] = None
            dup_n += 1
        else:
            seen_tid[tid] = r["position"]
    matched_n = sum(1 for r in rows if r["track_id"])
    if dry:
        return {"week_id": week_id, "entries": len(rows), "matched": matched_n,
                "dup": dup_n, "dry": True}

    _sb("DELETE", f"/rest/v1/top_entries?week_id=eq.{week_id}")
    for i in range(0, len(rows), 100):
        _sb("POST", "/rest/v1/top_entries?on_conflict=week_id,track_id",
            rows[i:i + 100], prefer="return=minimal,resolution=merge-duplicates")
    return {"week_id": week_id, "entries": len(rows), "matched": matched_n, "dup": dup_n}


# ─────────────────────────── driver ───────────────────────────
def mondays(start: dt.date, end: dt.date):
    # poslinkis iki pirmadienio
    d = start - dt.timedelta(days=start.weekday())
    while d <= end:
        yield d
        d += dt.timedelta(days=7)


def current_week_monday(today: dt.date | None = None) -> dt.date:
    """Einamosios kalendorinės savaitės pirmadienis (Mon-Sun; sekmadienis → tos
    pačios savaitės pirmadienis). Atitinka musiclt/lib/top-week.ts
    getCurrentWeekMonday()."""
    d = today or dt.date.today()
    return d - dt.timedelta(days=d.weekday())


def clear_current_week_stub(topids: list[int], scraped_starts: dict[int, set], dry: bool):
    """Override režime: jei einamoji kalendorinė savaitė NETURI music.lt duomenų
    (music.lt jos dar nepaskelbė), išvalom jos stub įrašus, kad public puslapio
    resolveDisplayWeek fallback'intų į šviežiausią tikrą music.lt savaitę
    (žr. musiclt/lib/top-week.ts — sistema TAM ir suprojektuota).
    Live savaitės eilutės NETRINAM — tik jos entries; balsų vis tiek nėra."""
    cw = current_week_monday().isoformat()
    for topid in topids:
        top_type = TOPID_TYPE[topid]
        if cw in scraped_starts.get(topid, set()):
            continue  # music.lt turi šią savaitę — jos neliečiam
        rows = _sb("GET", f"/rest/v1/top_weeks?top_type=eq.{top_type}&week_start=eq.{cw}"
                          f"&select=id,is_legacy")
        if not rows:
            continue
        w = rows[0]
        if w.get("is_legacy"):
            continue  # jau legacy (turi tikrus duomenis) — neliečiam
        cnt = _sb("GET", f"/rest/v1/top_entries?week_id=eq.{w['id']}&select=id")
        if not cnt:
            continue
        print(f"    CLEAR {top_type} {cw}: {len(cnt)} stub įrašų išvalyta "
              f"(→ fallback į šviežiausią music.lt savaitę){' [DRY]' if dry else ''}")
        if not dry:
            _sb("DELETE", f"/rest/v1/top_entries?week_id=eq.{w['id']}")


def run(topids: list[int], start: dt.date, end: dt.date, weeks_cap: int | None,
        delay: float, dry: bool, override_live: bool = False):
    total = {"weeks": 0, "entries": 0, "matched": 0, "skipped": 0, "empty": 0}
    scraped_starts: dict[int, set] = {t: set() for t in topids}
    n = 0
    for monday in mondays(start, end):
        if weeks_cap and n >= weeks_cap:
            break
        n += 1
        # Savaitė = pirmadienis..sekmadienis (music.lt kanoninė; jau einam per pirmad.).
        # get_week endpoint'as NEnaudojamas — buvo lūžimo/throttle šaltinis ant Mac'o.
        firstday = monday.isoformat()
        sunday = (monday + dt.timedelta(days=6)).isoformat()
        for topid in topids:
            top_type = TOPID_TYPE[topid]
            time.sleep(delay)   # politeness PRIEŠ kiekvieną fetch — be rapid-fire
            try:
                html = fetch_week_html(firstday, sunday, topid)
                entries = parse_week(html)
            except Exception as ex:
                print(f"  {firstday} {top_type}: FETCH/PARSE klaida {ex}")
                continue
            if not entries:
                total["empty"] += 1
                print(f"  {firstday} {top_type}: tuščia")
                continue
            scraped_starts[topid].add(firstday)
            r = store_week(top_type, firstday, entries, dry, override_live)
            if r.get("skipped"):
                total["skipped"] += 1
                continue
            total["weeks"] += 1
            total["entries"] += r["entries"]
            total["matched"] += r["matched"]
            tag = " [DRY]" if dry else ""
            dtag = f", {r['dup']} dub→NULL" if r.get("dup") else ""
            print(f"  {firstday} {top_type}: {r['entries']} įrašų, {r['matched']} matched{dtag}{tag}")
    if override_live:
        print("── Tvarkau einamąją savaitę (override režimas) ──")
        clear_current_week_stub(topids, scraped_starts, dry)
    print(f"\nBAIGTA: {total['weeks']} savaitės, {total['entries']} įrašų, "
          f"{total['matched']} matched, {total['skipped']} skip, {total['empty']} tuščios")
    return total


def relink_all(dry: bool):
    """Be scrape'o: susieja archyvo įrašus (track_id NULL, legacy_track_id≠NULL) su
    tracks per legacy_id. Paleisti po diskografijų scrape — deterministinis ID match,
    JOKIO fuzzy. Idempotentiškas, galima kartoti."""
    print("Re-link: ieškau nesusietų archyvo įrašų su legacy_track_id…")
    pending = []
    frm = 0
    while True:
        rows = _sb("GET", f"/rest/v1/top_entries?track_id=is.null&legacy_track_id=not.is.null"
                          f"&select=id,week_id,legacy_track_id&order=id&offset={frm}&limit=1000")
        if not rows:
            break
        pending.extend(rows)
        if len(rows) < 1000:
            break
        frm += 1000
    print(f"  {len(pending)} nesusietų įrašų su legacy ID")
    if not pending:
        return
    lids = sorted({r["legacy_track_id"] for r in pending})
    m = match_tracks(lids)
    print(f"  {len(m)} legacy ID dabar randa track'ą kataloge")

    # Preload jau UŽIMTUS (week_id, track_id) slot'us — kelios legacy versijos
    # toje pačioje savaitėje map'inasi į tą patį kanoninį track'ą, tad PATCH'as
    # laužtų (week_id, track_id) unique constraint (409). Tokius praleidžiam —
    # įrašas lieka su track_id=NULL (legacy_track_id išsaugotas rodymui).
    taken: set[tuple[int, int]] = set()
    frm = 0
    while True:
        rows = _sb("GET", "/rest/v1/top_entries?track_id=not.is.null"
                          f"&select=week_id,track_id&order=week_id&offset={frm}&limit=1000")
        if not rows:
            break
        for r in rows:
            taken.add((r["week_id"], r["track_id"]))
        if len(rows) < 1000:
            break
        frm += 1000

    linked = dups = 0
    for r in pending:
        hit = m.get(r["legacy_track_id"])
        if not hit:
            continue
        key = (r["week_id"], hit["id"])
        if key in taken:
            dups += 1
            continue
        if not dry:
            try:
                _sb("PATCH", f"/rest/v1/top_entries?id=eq.{r['id']}",
                    {"track_id": hit["id"]}, prefer="return=minimal")
            except RuntimeError as ex:
                # Backstop: jei kažkas vis tiek konflikuoja (23505), praleidžiam.
                if "23505" in str(ex) or "409" in str(ex):
                    dups += 1
                    continue
                raise
        taken.add(key)
        linked += 1
    print(f"BAIGTA re-link: {'(DRY) ' if dry else ''}{linked} įrašų susieta, "
          f"{dups} dub praleista (slot'as savaitėje jau užimtas)")

    # 2 pakopa: name+title match (atlikėjo name_norm + dainos title_norm) toms
    # dainoms, kurios kataloge YRA, bet be legacy_id (pvz. naujai pridėtos per
    # diskografijų scrape) → legacy_id relink jų nepagauna. Tikslus normalizuotas
    # sutapimas (žemas false-positive), pirmenybė grojamiems (video), gerbia
    # (week_id, track_id) unikalumą. Logika DB funkcijoje relink_top_entries_by_name().
    if not dry:
        try:
            res = _sb("POST", "/rest/v1/rpc/relink_top_entries_by_name", {})
            n = res if isinstance(res, int) else (res[0] if isinstance(res, list) and res else 0)
            print(f"BAIGTA name-relink: {n} įrašų susieta pagal atlikėją+pavadinimą")
        except Exception as ex:
            print(f"  name-relink praleistas (RPC klaida: {ex})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--relink", action="store_true",
                    help="Be scrape'o: tik perlinkinti esamus archyvo įrašus į katalogą (po diskografijų)")
    ap.add_argument("--topid", default="both", help="1 (TOP40) | 2 (LT TOP30) | both")
    ap.add_argument("--from", dest="dfrom", default=None, help="YYYY-MM-DD (imama savaitė nuo)")
    ap.add_argument("--to", dest="dto", default=None, help="YYYY-MM-DD (imtinai iki; default šiandien)")
    ap.add_argument("--weeks", type=int, default=None, help="maks. savaičių (cap)")
    ap.add_argument("--delay", type=float, default=0.7, help="pauzė tarp fetch'ų (s)")
    ap.add_argument("--override-live", action="store_true",
                    help="PERĖJIMO periodas: perrašyti live voting savaites music.lt "
                         "duomenimis (vietoj skip) + išvalyti einamosios sav. stub'ą. "
                         "Nuimti perėjus į gyvą balsavimą.")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    if a.relink:
        relink_all(a.dry_run)
        return
    if not a.dfrom:
        ap.error("--from privalomas (arba naudok --relink)")

    topids = [1, 2] if a.topid == "both" else [int(a.topid)]
    start = dt.date.fromisoformat(a.dfrom)
    end = dt.date.fromisoformat(a.dto) if a.dto else dt.date.today()
    print(f"Legacy TOP archyvas: topids={topids} {start}..{end} "
          f"weeks_cap={a.weeks} dry={a.dry_run} override_live={a.override_live}")
    run(topids, start, end, a.weeks, a.delay, a.dry_run, a.override_live)


if __name__ == "__main__":
    main()
