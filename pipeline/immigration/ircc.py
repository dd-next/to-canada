"""IRCC permanent-resident admissions by province/territory and CMA of intended destination."""
from __future__ import annotations

import re
from collections import defaultdict

import openpyxl

from common_i import IRCC_ROW, PROV_NAME, PROV_CODE, place_geo, places, province_geo, geo, TODAY
from common.contract import obs
from common.fetch import fetch, fetch_json, meta_for, now_iso

SID = "ircc-pr-cma"
URL = "https://www.ircc.canada.ca/opendata-donneesouvertes/data/EN_ODP-PR-CMA.xlsx"
DATASET = "f7e5498e-0ad8-4417-85c9-9b8aff9b9eda"
LANDING = f"https://open.canada.ca/data/en/dataset/{DATASET}"
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
PROV_BY_TOTAL = {f"{n} Total": c for c, n in PROV_NAME.items()}


def cell(v):
    """IRCC cell -> (value, flags). '--' = 0-5 suppressed; others rounded to a multiple of 5."""
    if v is None:
        return None, ["not_available"]
    s = str(v).strip().replace(",", "")
    if s == "--":
        return None, ["suppressed"]
    if s in ("", "-"):
        return None, ["not_available"]
    return float(s), ["rounded"]


def load():
    path = fetch(URL)
    meta = meta_for(path)
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    title = rows[0][0]
    yr_row, sub_row, mon_row = rows[2], rows[3], rows[4]
    # Column map: annual totals and monthly cells.
    year_of = {}
    cur = None
    for i, c in enumerate(yr_row):
        if c and re.fullmatch(r"\d{4}", str(c)):
            cur = int(c)
        year_of[i] = cur
    annual_col, month_col = {}, {}
    for i, c in enumerate(sub_row):
        if c and re.fullmatch(r"\d{4} Total", str(c)):
            annual_col[int(str(c)[:4])] = i
    for i, c in enumerate(mon_row):
        if c in MONTHS and year_of.get(i):
            month_col[(year_of[i], MONTHS.index(c) + 1)] = i
    # A yearly total can be partial; the published monthly cells determine completeness.
    data = {}   # (kind,name,prov) -> {"annual":{y:(v,flags)}, "month":{(y,m):(v,flags)}}
    prov = None
    for r in rows[5:]:
        if not r or len(r) < 3:
            continue
        name0 = r[0] if r[0] not in (None, "") else None
        name1 = r[1]
        if name0 and name0 in PROV_BY_TOTAL:
            kind, name, p = "province", name0[:-6], PROV_BY_TOTAL[name0]
            prov = p
        elif name0 == "Total":
            kind, name, p = "country", "Canada", None
        elif name0 and name0.startswith("Province/territory not stated"):
            kind, name, p = "other", "Province/territory not stated", None
        elif name1:
            kind, name, p = "area", name1, None
        else:
            continue
        rec = {"annual": {}, "month": {}}
        for y, ci in annual_col.items():
            if ci < len(r):
                rec["annual"][y] = cell(r[ci])
        for (y, m), ci in month_col.items():
            if ci < len(r):
                rec["month"][(y, m)] = cell(r[ci])
        data.setdefault("_rows", []).append((kind, name, p, rec))
    # assign provinces to areas: areas precede their province total row
    out = {}
    pending = []
    for kind, name, p, rec in data["_rows"]:
        if kind == "area":
            pending.append((name, rec))
        elif kind == "province":
            for n, rc in pending:
                out[("area", n, p)] = rc
            pending = []
            out[("province", name, p)] = rec
        else:
            out[(kind, name, None)] = rec
    last_month = max(k for k, v in month_col.items() if v is not None and out[("country", "Canada", None)]["month"].get(k, (None, []))[0] is not None)
    first_month = min(k for k in month_col if out[("country", "Canada", None)]["month"].get(k, (None, []))[0] is not None)
    pkg = fetch_json("https://open.canada.ca/data/api/3/action/package_show", params={"id": DATASET}, max_age_days=1, retries=1, timeout=30)
    if not pkg.get("success") or not isinstance(pkg.get("result"), dict):
        raise ValueError("Official IRCC catalog format changed; cannot verify release metadata")
    catalog = pkg["result"]
    resource = next((r for r in catalog.get("resources", []) if "EN_ODP-PR-CMA.xlsx" in r.get("url", "")), {})
    updated = resource.get("last_modified") or catalog.get("metadata_modified")
    if not updated:
        raise ValueError("Official IRCC catalog lacks source update date; manual review required")
    meta["releaseDate"] = updated[:10]
    meta["publisherUpdatedAt"] = updated
    return out, {"title": title, "meta": meta, "first_month": first_month, "last_month": last_month, "annual_years": sorted(annual_col), "path": str(path)}


def build():
    data, info = load()
    ly, lm = info["last_month"]          # last published month from the workbook
    full_years = [y for y in info["annual_years"] if y < ly or (y == ly and lm == 12)]
    if len(full_years) < 2:
        raise ValueError("IRCC workbook needs two complete years for year-on-year comparisons")
    latest, prev = full_years[-1], full_years[-2]
    ytd_label = f"{ly}-01 to {ly}-{lm:02d}"
    obs_out, series_out, gaps = [], [], []
    area_index = {(k[1], k[2]): v for k, v in data.items() if k[0] == "area"}
    ytd_vals = {}
    for pi in places():
        pid = pi["id"]
        row = IRCC_ROW.get(pid)
        pg = place_geo(pi)
        if row is None:
            gaps.append((pid, "IRCC publishes Nunavut only as 'Other - Nunavut' (no Iqaluit row)"))
            continue
        rec = None
        for (n, p), rc in area_index.items():
            if n == row and (PROV_CODE[pi["province"]] and p == pi["province"]):
                rec = rc
        if rec is None:
            gaps.append((pid, f"row '{row}' not found in IRCC table"))
            continue
        flags_extra = []
        if pi["part"]:
            note_geo = "IRCC publishes the Ontario and Quebec parts of Ottawa - Gatineau separately; this is the provincial part."
        else:
            note_geo = None
        rec_geo = pg
        v, f = rec["annual"][latest]
        pv, pf = rec["annual"][prev]
        base_note = f"IRCC permanent-resident admissions by CMA/CA of intended destination at landing (not current residence). Values are rounded to the nearest 5; 0-5 shown as '--' (suppressed)."
        if note_geo:
            base_note += " " + note_geo
        obs_out.append(obs(pid, "imm_pr_admissions", v, str(latest), rec_geo, SID, f, base_note))
        if v is not None and pv is not None and pv > 0:
            ch = (v / pv - 1) * 100
            obs_out.append(obs(pid, "imm_pr_admissions_change", round(ch, 1), str(latest), rec_geo, SID, ["rounded"],
                               f"({latest} admissions / {prev} admissions - 1) x 100, computed from IRCC values rounded to the nearest 5 ({v:g} vs {pv:g})."))
        else:
            obs_out.append(obs(pid, "imm_pr_admissions_change", None, str(latest), rec_geo, SID,
                               ["suppressed"] if (v is None or pv is None) else ["not_available"],
                               f"{latest} or {prev} admissions suppressed by IRCC (0-5), so the change cannot be computed."))
        # Series of complete years and the current partial year, if any.
        pts = []
        for y in info["annual_years"]:
            if y not in full_years:
                continue
            val, fl = rec["annual"][y]
            p_ = {"t": str(y), "v": val}
            if fl:
                p_["f"] = fl
            pts.append(p_)
        ytd = sum_months(rec, ly, lm)
        if lm < 12:
            pts.append({"t": f"{ly} YTD (Jan-{MONTHS[lm-1]})", "v": ytd[0], "f": ytd[1]})
        ytd_vals[pid] = ytd
        series_out.append({
            "id": f"imm_pr_admissions_{pid}", "label": f"Permanent resident admissions by intended destination - {pi['name']}",
            "unit": "persons", "placeId": pid, "metricId": "imm_pr_admissions", "geo": rec_geo, "sourceId": SID,
            "dims": {"basis": "calendar year; last point is year-to-date " + ytd_label},
            "points": pts})
    # provincial / national context rows
    prov_totals = {}
    for (kind, name, p), rec in data.items():
        if kind in ("province", "country"):
            prov_totals[(kind, p)] = rec
    return obs_out, series_out, gaps, {"latest": latest, "prev": prev, "ytd": ytd_label, "ly": ly, "lm": lm,
                                       "info": info, "data": data, "ytd_vals": ytd_vals}


def sum_months(rec, y, last_m):
    """Sum monthly cells Jan..last_m. IRCC's own YTD total column is used when present; monthly sums are not
    used because each month is rounded separately. Returns (value, flags)."""
    v, f = rec["annual"].get(y, (None, ["not_available"]))
    return v, f


def per_1000(obs_list: list[dict], latest: int):
    """imm_pr_admissions_per_1000 = admissions (IRCC, rounded) / July-1 population (StatCan 17-10-0148-01) x 1000."""
    import pop as popmod
    df = popmod.read_filtered()
    df = df[df["REF_DATE"] == str(latest)]
    by_dguid_suffix = {}
    for _, r in df.iterrows():
        by_dguid_suffix[r["DGUID"]] = r
    out, gaps, pops = [], [], {}
    for o in obs_list:
        if o["metricId"] != "imm_pr_admissions":
            continue
        g = o["geo"]
        row = None
        for d, r in by_dguid_suffix.items():
            if d.startswith("2021S05") and d.endswith(g["id"]) and len(d) == 7 + (len(g["id"]) + 2 if len(g["id"]) == 3 else len(g["id"])):
                row = r
        if row is None:
            for d, r in by_dguid_suffix.items():
                if d.startswith("2021S05") and d.endswith(g["id"]):
                    row = r
        if row is None or pd_isnan(row["VALUE_NUM"]):
            gaps.append((o["placeId"], "population denominator not found"))
            out.append(obs(o["placeId"], "imm_pr_admissions_per_1000", None, o["period"], g, SID, ["not_available"],
                           "No July-1 population estimate matched this geography."))
            continue
        p = float(row["VALUE_NUM"])
        pops[o["placeId"]] = (p, row["GEO"], row["DGUID"])
        if o["value"] is None:
            out.append(obs(o["placeId"], "imm_pr_admissions_per_1000", None, o["period"], g, SID, ["suppressed"],
                           "Admissions suppressed by IRCC (0-5)."))
            continue
        out.append(obs(o["placeId"], "imm_pr_admissions_per_1000", round(o["value"] / p * 1000, 2), o["period"], g, SID,
                       ["rounded"],
                       f"{o['value']:g} admissions (IRCC, rounded to 5) / {p:,.0f} residents (StatCan 17-10-0148-01, July 1 {o['period']}, {row['GEO']}) x 1,000."))
    return out, gaps, pops


def pd_isnan(x):
    return x != x
