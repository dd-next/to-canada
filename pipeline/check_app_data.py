"""Focused checks of the app snapshot (public/data) against the contract and raw sources.

Usage (repo root):  python3 -I pipeline/check_app_data.py
    Add --sources for strict integration verification against downloaded raw files.
    Missing raw files fail only that explicit integration mode.
Exit code 1 on any failure. Checks are deliberately few and aimed at facts a
user relies on: units/scales, missing-vs-zero, geography flags, and a sample of
displayed values re-read from the original downloads.
"""
from __future__ import annotations

import json
import os
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common.contract import ROOT  # noqa: E402

D = Path(os.environ.get("NORTHWARD_APP_DATA", ROOT / "public" / "data"))
VERIFY_SOURCES = "--sources" in sys.argv
fails: list[str] = []
oks: list[str] = []


def check(cond: bool, msg: str) -> None:
    (oks if cond else fails).append(msg)


obs = json.loads((D / "observations.json").read_text())
metrics = {m["id"]: m for m in json.loads((D / "metrics.json").read_text())}
places = {p["id"]: p for p in json.loads((D / "places.json").read_text())}
manifest = json.loads((D / "manifest.json").read_text())

# 1. Not a provisional build
check(manifest.get("provisional") is False, "snapshot is not provisional")

# 2. Plausible ranges by unit (catches scalar-factor and unit mix-ups)
RANGES = {"CAD_month": (300, 6000), "CAD_hour": (10, 200), "percent": (-100, 100), "degC": (-45, 40),
          "mm": (0, 3500), "cm": (0, 1000), "per_1000": (0, 100), "pp": (-20, 20), "days": (0, 366)}
for o in obs:
    m = metrics[o["metricId"]]
    lo_hi = RANGES.get(m["unit"])
    v = o["value"]
    if v is not None and lo_hi and not (lo_hi[0] <= v <= lo_hi[1]):
        fails.append(f"out-of-range {o['metricId']} {o['placeId']} = {v} {m['unit']}")
oks.append("unit ranges checked")

# 3. Missing stays missing: null values carry a reason; zeros only where zero is meaningful
nulls_without_flag = [o for o in obs if o["value"] is None and not o.get("flags")]
check(not nulls_without_flag, f"every null has a flag ({len(nulls_without_flag)} without)")
zero_ok_units = {"days", "pp", "percent", "cm", "mm", "degC"}
zeros = [o for o in obs if o["value"] == 0 and metrics[o["metricId"]]["unit"] not in zero_ok_units]
check(not zeros, f"no zero-filled money/count values ({[(o['placeId'], o['metricId']) for o in zeros][:5]})")

# 4. Geography honesty: a value measured for a broader area must be flagged
for o in obs:
    p = places[o["placeId"]]
    lvl = o["geo"]["level"]
    fl = set(o.get("flags", []))
    if o["value"] is None:
        continue  # missing values are shown as missing; their geo only says what was looked up
    if lvl == "province" and "provincial_value" not in fl:
        fails.append(f"province-level value not flagged: {o['placeId']} {o['metricId']}")
    if lvl == "economic_region" and "regional_value" not in fl and o["metricId"].startswith(("lfs_", "imm_")):
        fails.append(f"ER-level value not flagged: {o['placeId']} {o['metricId']}")
    if p["id"] in ("ottawa", "gatineau") and lvl == "cma" and "cma_wide" not in fl and o["metricId"].startswith(("rent_", "lfs_", "imm_")):
        fails.append(f"Ottawa–Gatineau CMA-wide value not flagged: {o['placeId']} {o['metricId']}")
oks.append("geography flags checked")
# Toronto CMA values must never be attached to a separate Mississauga/Brampton place
check(not any(pid in places for pid in ("mississauga", "brampton")), "no municipality-level duplicates of Toronto CMA")


# Contract regressions on the actual generated snapshot, independent of raw caches.
programs = json.loads((D / "programs.json").read_text())
fstp = next((p for p in programs if p["id"] == "express-entry-fstp"), None)
check(bool(fstp and fstp["jobOfferRequired"] == "conditional" and "certificate" in fstp.get("jobOfferNote", "").lower()
           and " or " in fstp.get("jobOfferNote", "").lower()), "FSTP preserves job offer OR certificate alternative")
mbm = [o for o in obs if o["metricId"].startswith("cost_mbm_")]
check(bool(mbm) and all(o.get("referenceHouseholdSize") == (5 if places[o["placeId"]]["province"] == "NU" else 4)
                       and bool(o.get("methodology")) for o in mbm), "MBM observations preserve methodology and four/five-person reference household")
wage_table = json.loads((D / "wages.json").read_text())
missing_provenance = [(noc, geo) for noc, cells in wage_table["byNoc"].items() for geo, cell in cells.items()
                      if not wage_table.get("metadata", {}).get(noc, {}).get(geo, {}).get("referencePeriod")
                      or not wage_table.get("metadata", {}).get(noc, {}).get(geo, {}).get("methodology") or cell[3] not in (0, 1)]
check(bool(wage_table["byNoc"]) and not missing_provenance, f"Every wage cell retains individual period, methodology and annual/hourly unit ({len(missing_provenance)} missing)")


def value(pid: str, mid: str):
    for o in obs:
        if o["placeId"] == pid and o["metricId"] == mid:
            return o
    return None


if VERIFY_SOURCES:
    # 5. Re-read a sample of displayed values from the original downloads
    RAW = Path(os.environ.get("NORTHWARD_RAW", ROOT / "data" / "raw"))


    def statcan_row(pid8: str, pred) -> list[dict]:
        import csv
        import io
        z = next((RAW / "www150.statcan.gc.ca").glob(f"*_{pid8}-eng.zip"), None)
        if z is None:
            fails.append(f"Source verification unavailable: missing raw archive {pid8}-eng.zip")
            return []
        with zipfile.ZipFile(z) as zf, zf.open(f"{pid8}.csv") as fh:
            rd = csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8-sig"))
            return [r for r in rd if pred(r)]


    o = value("toronto", "rent_asking_1br")
    check(o is not None, "source verification target exists: Toronto asking rent")
    if o:
        y, q = o["period"].split("-Q")  # StatCan quarterly REF_DATE is the quarter's first month
        ref = f"{y}-{(int(q) - 1) * 3 + 1:02d}"
        rows = statcan_row("46100092", lambda r: r["REF_DATE"] == ref and r["DGUID"] == "2021S0503535"
                           and r["Rental unit type"] == "Apartment - 1 bedroom" and r["Estimates"] == "Average asking rent")
        raw = [float(r["VALUE"]) for r in rows if r["VALUE"]]
        check(bool(raw) and abs(raw[0] - o["value"]) < 0.5, f"Toronto 1-bed asking rent {o['period']}: app {o['value']} vs StatCan {raw[:1]}")

    o = value("kelowna", "lfs_unemployment_rate")
    check(o is not None, "source verification target exists: Kelowna unemployment")
    if o:
        rows = statcan_row("14100459", lambda r: r["REF_DATE"] == o["period"] and r["GEO"].startswith("Kelowna")
                           and r.get("Labour force characteristics") == "Unemployment rate"
                           and "Seasonally adjusted" in json.dumps(r) and "Estimate" in json.dumps(r))
        raw = [float(r["VALUE"]) for r in rows if r["VALUE"]]
        check(bool(raw) and abs(raw[0] - o["value"]) < 0.05, f"Kelowna unemployment {o['period']}: app {o['value']} vs StatCan {raw[:1]}")

    wages = json.loads((D / "wages.json").read_text())
    er = places["calgary"]["geo"]["economicRegions"][0]["id"]
    cell = wages["byNoc"].get("31301", {}).get(er)
    check(cell is not None, "source verification target exists: Calgary RN median wage")
    # Select the exact edition cited by this snapshot, never an arbitrary cached CSV.
    from common.fetch import _cache_path
    source = next((r for r in json.loads((D / "sources.json").read_text()) if r["id"] == wages["sourceId"]), {})
    jb = _cache_path(source["downloadUrl"], None, None) if source.get("downloadUrl") else None
    if jb is not None and not jb.exists():
        jb = None
    if cell and jb:
        import csv
        with open(jb, encoding="utf-8-sig", errors="replace") as fh:
            rows = [r for r in csv.DictReader(fh) if r.get("NOC_CNP") == "NOC_31301" and r.get("ER_Code_Code_RE") in (er, "ER" + er)]
        raw_med = [r.get("Median_Wage_Salaire_Median") for r in rows]
        check(bool(rows) and abs(float(raw_med[0]) - cell[1]) < 0.01, f"Job Bank RN median, ER {er}: app {cell[1]} vs CSV {raw_med[:1]}")
        provenance = wages.get("metadata", {}).get("31301", {}).get(er, {})
        check(bool(rows) and provenance.get("referencePeriod") == rows[0]["Reference_Period"] and provenance.get("methodology") == rows[0]["Data_Source_E"], "Job Bank RN period and methodology match its raw source record")
    elif cell:
        fails.append(f"Source verification unavailable: missing Job Bank wage CSV for ER {er}")

else:
    print("SKIP source integration checks (run --sources with the original raw downloads)")

o = value("toronto", "pop_2021")
check(o is not None and o["value"] == 6202225, f"Toronto CMA 2021 population = 6,202,225 ({o and o['value']})")

for m in oks:
    print("ok  ", m)
for m in fails[:40]:
    print("FAIL", m)
print(f"{len(oks)} ok, {len(fails)} failed")
sys.exit(1 if fails else 0)
