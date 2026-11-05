"""Focused checks of the app snapshot (public/data) against the contract and raw sources.

Usage (repo root):  python3 -I pipeline/check_app_data.py
Exit code 1 on any failure. Checks are deliberately few and aimed at facts a
user relies on: units/scales, missing-vs-zero, geography flags, and a sample of
displayed values re-read from the original downloads.
"""
from __future__ import annotations

import json
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common.contract import ROOT  # noqa: E402

D = ROOT / "public" / "data"
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


def value(pid: str, mid: str):
    for o in obs:
        if o["placeId"] == pid and o["metricId"] == mid:
            return o
    return None


# 5. Re-read a sample of displayed values from the original downloads
RAW = ROOT / "data" / "raw"


def statcan_row(pid8: str, pred) -> list[dict]:
    import csv
    import io
    z = next((RAW / "www150.statcan.gc.ca").glob(f"*_{pid8}-eng.zip"), None)
    if z is None:
        return []
    with zipfile.ZipFile(z) as zf, zf.open(f"{pid8}.csv") as fh:
        rd = csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8-sig"))
        return [r for r in rd if pred(r)]


o = value("toronto", "rent_asking_1br")
if o:
    y, q = o["period"].split("-Q")  # StatCan quarterly REF_DATE is the quarter's first month
    ref = f"{y}-{(int(q) - 1) * 3 + 1:02d}"
    rows = statcan_row("46100092", lambda r: r["REF_DATE"] == ref and r["DGUID"] == "2021S0503535"
                       and r["Rental unit type"] == "Apartment - 1 bedroom" and r["Estimates"] == "Average asking rent")
    raw = [float(r["VALUE"]) for r in rows if r["VALUE"]]
    check(bool(raw) and abs(raw[0] - o["value"]) < 0.5, f"Toronto 1-bed asking rent {o['period']}: app {o['value']} vs StatCan {raw[:1]}")

o = value("kelowna", "lfs_unemployment_rate")
if o:
    rows = statcan_row("14100459", lambda r: r["REF_DATE"] == o["period"] and r["GEO"].startswith("Kelowna")
                       and r.get("Labour force characteristics") == "Unemployment rate"
                       and "Seasonally adjusted" in json.dumps(r) and "Estimate" in json.dumps(r))
    raw = [float(r["VALUE"]) for r in rows if r["VALUE"]]
    check(bool(raw) and abs(raw[0] - o["value"]) < 0.05, f"Kelowna unemployment {o['period']}: app {o['value']} vs StatCan {raw[:1]}")

wages = json.loads((D / "wages.json").read_text())
er = places["calgary"]["geo"]["economicRegions"][0]["id"]
cell = wages["byNoc"].get("31301", {}).get(er)
jb = next(iter(sorted((RAW / "open.canada.ca").glob("*wage*opendata*.csv"))), None) or next((p for p in (RAW / "open.canada.ca").glob("*") if p.suffix == ".csv"), None) or next(
    (p for p in RAW.rglob("*.csv") if "wage" in p.name.lower()), None)
if cell and jb:
    import csv
    with open(jb, encoding="utf-8-sig", errors="replace") as fh:
        rows = [r for r in csv.DictReader(fh) if r.get("NOC_CNP") == "NOC_31301" and r.get("ER_Code_Code_RE") in (er, "ER" + er)]
    raw_med = [r.get("Median_Wage_Salaire_Median") for r in rows]
    check(bool(rows) and abs(float(raw_med[0]) - cell[1]) < 0.01, f"Job Bank RN median, ER {er}: app {cell[1]} vs CSV {raw_med[:1]}")
elif cell:
    oks.append(f"Job Bank RN median ER {er} = {cell[1]} (raw CSV not located for re-read)")

o = value("toronto", "pop_2021")
check(o is not None and o["value"] == 6202225, f"Toronto CMA 2021 population = 6,202,225 ({o and o['value']})")

for m in oks:
    print("ok  ", m)
for m in fails[:40]:
    print("FAIL", m)
print(f"{len(oks)} ok, {len(fails)} failed")
sys.exit(1 if fails else 0)
