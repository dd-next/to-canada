"""Compare every source we publish with what the official publisher offers today.

Usage (from repo root):
    python3 -I pipeline/freshness.py            # report + write data/processed/freshness.json
    python3 -I pipeline/freshness.py --strict   # exit 1 when any source has newer official data

Checks (all read-only, through common.fetch: cached, honest User-Agent, no bot-protection bypass):
  * StatCan tables: WDS getCubeMetadata -> cubeEndDate / releaseTime vs our referencePeriod / releaseDate.
  * open.canada.ca datasets (Job Bank wages, IRCC PR admissions): CKAN package_show ->
    metadata_modified and resource names/last_modified (a newer yearly edition shows up as a new resource).
  * CMHC Rental Market Survey: does the next edition's workbook URL (pattern in housing/cmhc.py) exist?
  * Census 2021, climate normals 1991-2020, NOC 2021, boundary files: 'static' (fixed reference vintage).
  * Web pages read by hand (program pages, community sites): 'unknown' (no machine-readable release signal).

status: current | newer_available | static | unknown
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common.contract import PROCESSED, ROOT  # noqa: E402
from common.fetch import FetchError, fetch, fetch_json, fetch_text, now_iso  # noqa: E402
from common.statcan import WDS, pid_of  # noqa: E402

CKAN = "https://open.canada.ca/data/api/3/action/package_show"
CMHC_BASE = ("https://assets.cmhc-schl.gc.ca/sites/cmhc/professional/housing-markets-data-and-research/"
             "housing-data-tables/rental-market/rental-market-report-data-tables/{year}/rmr-{slug}-{year}-en.xlsx")
CMHC_PROBE_SLUG = "toronto"
STATIC_NOTES = {
    "statcan-98-10-": "Census of Population 2021: fixed reference year; the next census is 2026 (first results expected 2027).",
    "statcan-cbf-": "2021 Census boundary files: fixed vintage until the 2026 Census geography.",
    "statcan-noc-": "NOC 2021 Version 1.0 classification: fixed until a new NOC version is published.",
    "eccc-climate-normals": "Climate normals 1991-2020: fixed 30-year period; the next set is not yet published.",
}
TABLE_RE = re.compile(r"^\d{2}-\d{2}-\d{4}-\d{2}$")


def day(s: str | None) -> str:
    value = (s or "")[:10]
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except (ValueError, TypeError):
        return ""
    return value


def load_sources() -> list[dict]:
    """All SourceRecords across domains, one per id (the most recently retrieved wins)."""
    by_id: dict[str, dict] = {}
    for f in sorted(PROCESSED.glob("*/sources.json")):
        for s in json.loads(f.read_text(encoding="utf-8")):
            prev = by_id.get(s["id"])
            if prev is None or (s.get("retrievedAt") or "") > (prev.get("retrievedAt") or ""):
                by_id[s["id"]] = s
    return list(by_id.values())


def result(s: dict, status: str, latest_period: str | None, latest_release: str | None, note: str, our_period: str | None = None) -> dict:
    return {"sourceId": s["id"], "title": s.get("title"), "ourPeriod": our_period or s.get("referencePeriod"),
            "latestPeriod": latest_period, "latestRelease": latest_release or None, "status": status, "note": note}


def check_statcan(s: dict) -> dict:
    tid = s["tableId"]
    res = fetch_json(f"{WDS}/getCubeMetadata", json_payload=[{"productId": int(pid_of(tid))}], max_age_days=0, retries=1, timeout=30)
    item = res[0] if isinstance(res, list) else res
    if item.get("status") != "SUCCESS":
        return result(s, "unknown", None, None, f"getCubeMetadata did not succeed: {str(item)[:120]}")
    o = item.get("object")
    if not isinstance(o, dict):
        return result(s, "unknown", None, None, "Publisher metadata lacks a valid cube object.")
    latest_rel, our_rel = day(o.get("releaseTime")), day(s.get("releaseDate"))
    end = day(o.get("cubeEndDate"))
    if not latest_rel or not end:
        return result(s, "unknown", end or None, latest_rel or None, "Publisher metadata lacks a valid release date or observation end date.")
    if not our_rel:
        return result(s, "unknown", end, latest_rel, "Our record has no releaseDate to compare.")
    if latest_rel > our_rel:
        return result(s, "newer_available", end, latest_rel,
                      f"StatCan released this table on {latest_rel}; we hold the {our_rel} release (cube ends {end}).")
    if latest_rel < our_rel:
        return result(s, "unknown", end, latest_rel, "Publisher metadata predates the stored release; freshness cannot be established.")
    return result(s, "current", end, latest_rel, f"Matches StatCan's latest release ({latest_rel}); cube ends {end}.")


def ckan(pid: str) -> dict:
    try:
        response = fetch_json(CKAN, params={"id": pid}, max_age_days=0, retries=1, timeout=30)
        if not response.get("success") or not isinstance(response.get("result"), dict):
            raise ValueError("Official catalog returned an unexpected format")
        return response["result"]
    except (FetchError, ValueError):
        # Same official catalog exposes semantic DataDownload/dateModified markup.
        from work.wages import catalog_from_html
        package = catalog_from_html(fetch_text(f"https://open.canada.ca/data/en/dataset/{pid}", max_age_days=0, retries=1, timeout=30))
        if not package.get("metadata_modified") or not package.get("resources"):
            raise ValueError("Official catalog HTML also lacks release metadata; manual review required")
        return package


def check_jobbank(s: dict) -> dict:
    pid = re.search(r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})", s.get("tableId", "") + s.get("url", "")).group(1)
    pkg = ckan(pid)
    edition = int(re.search(r"(\d{4})", s["id"]).group(1))
    years = []
    for r in pkg.get("resources", []):
        m = re.match(r"^\s*(\d{4})\s+Wages", r.get("name") or "")
        if m:
            years.append((int(m.group(1)), day(r.get("last_modified") or r.get("created"))))
    if not years:
        return result(s, "manual_update_required", None, None, "Official catalog contained no recognizable wage edition; inspect publisher resources before updating.")
    top = max(years)
    mod = day(pkg.get("metadata_modified"))
    if top[0] > edition or (top[1] and top[1] > day(s.get("releaseDate"))):
        return result(s, "newer_available", f"{top[0]} edition", top[1] or mod,
                      f"Job Bank published a {top[0]} wage edition (resource modified {top[1] or mod}); we use {edition}.", f"{edition} edition")
    if top[0] < edition or not (top[1] or mod) or not day(s.get("releaseDate")):
        return result(s, "unknown", f"{top[0]} edition", top[1] or mod, "Missing or inconsistent release metadata; freshness cannot be established.")
    return result(s, "current", f"{top[0]} edition", top[1] or mod,
                  f"{edition} is the newest edition listed on open.canada.ca (dataset modified {mod}). Editions are annual, usually Nov-Dec.", f"{edition} edition")


def check_ircc(s: dict) -> dict:
    pid = re.search(r"dataset ([0-9a-f-]{36})", s["tableId"]).group(1)
    pkg = ckan(pid)
    mod, ours = day(pkg.get("metadata_modified")), day(s.get("releaseDate"))
    ours_period = (s.get("referencePeriod") or "").split(" to ")[-1].split(";")[0]
    if not mod or not ours or mod < ours:
        return result(s, "unknown", None, mod or None, "Missing, invalid or inconsistent catalog update date; freshness cannot be established.")
    if mod > ours:
        return result(s, "newer_available", f"update posted {mod}", mod,
                      f"IRCC dataset on open.canada.ca modified {mod}; we hold the {ours} update ({ours_period}).")
    return result(s, "current", ours_period, mod,
                  f"Dataset last modified {mod}, same as our {ours} update; IRCC publishes monthly (about the 20th).")


def check_cmhc(s: dict) -> dict:
    edition = int(re.search(r"(\d{4})", s["id"]).group(1))
    text = fetch_text(s["url"], max_age_days=0, retries=1, timeout=30)
    years = [int(y) for y in re.findall(r"rmr-[^\s\"<>]+?-(20\d{2})-en\.xlsx", text)]
    if not years:
        return result(s, "manual_update_required", None, None,
                      "Official CMHC catalog did not expose recognizable edition workbooks. A manual catalog review is required; a guessed URL returning 404 is not proof of freshness.")
    newest = max(years)
    return result(s, "newer_available" if newest > edition else "current", f"October {newest}", None,
                  f"Newest workbook edition linked by the official CMHC catalog: {newest}; stored edition: {edition}.")


def check(s: dict) -> dict:
    sid = s["id"]
    for pre, note in STATIC_NOTES.items():
        if sid.startswith(pre):
            return result(s, "static", s.get("referencePeriod"), None, note)
    if sid.startswith("jobbank-wages"):
        return check_jobbank(s)
    if sid.startswith("ircc-pr-"):
        return check_ircc(s)
    if sid.startswith("cmhc-rms"):
        return check_cmhc(s)
    if TABLE_RE.match(s.get("tableId") or ""):
        return check_statcan(s)
    return result(s, "manual_update_required", None, None, "Web page read by hand; no machine-readable release signal. Re-read when refreshing programs.")


def main() -> int:
    strict = "--strict" in sys.argv
    previous_path = PROCESSED / "freshness.json"
    previous = {r["sourceId"]: r for r in json.loads(previous_path.read_text())} if previous_path.exists() else {}
    out = []
    for s in sorted(load_sources(), key=lambda x: x["id"]):
        try:
            out.append(check(s))
        except Exception as e:  # a failed probe must not hide the other sources
            out.append(result(s, "unknown", None, None, f"Check failed: {type(e).__name__}: {str(e)[:140]}"))
    checked_at = now_iso()
    for row in out:
        row["checkedAt"] = checked_at
        old = previous.get(row["sourceId"], {})
        row["lastSuccessfulCheckAt"] = checked_at if row["status"] in ("current", "newer_available") else old.get("lastSuccessfulCheckAt")
    p = PROCESSED / "freshness.json"
    p.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    app = Path(os.environ.get("NORTHWARD_APP_DATA", ROOT / "public" / "data"))
    if app.exists():
        target = app / "freshness-checks.json"
        temp = target.with_suffix(".json.tmp")
        temp.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        temp.replace(target)

    print(f"Data freshness as of {datetime.now(timezone.utc).date()} (wrote data/processed/freshness.json)\n")
    for status in ("newer_available", "current", "static", "unknown", "manual_update_required"):
        rows = [r for r in out if r["status"] == status]
        if not rows:
            continue
        print(f"== {status} ({len(rows)})")
        shown = rows
        if status == "unknown":
            pages = [r for r in rows if r["note"].startswith("Web page")]
            shown = [r for r in rows if r not in pages]
            if pages:
                print(f"   {len(pages)} hand-read web pages (program/community pages): no release signal")
        for r in shown:
            print(f"   {r['sourceId']:<34} ours: {str(r['ourPeriod'])[:44]:<44} latest: {r['latestPeriod']} ({r['latestRelease']})")
            print(f"      {r['note']}")
    newer = [r["sourceId"] for r in out if r["status"] == "newer_available"]
    print("\nNewer official data available for:", ", ".join(newer) if newer else "nothing")
    if any(r["status"] == "unknown" for r in out):
        return 2
    return 1 if (strict and newer) else 0


if __name__ == "__main__":
    raise SystemExit(main())
