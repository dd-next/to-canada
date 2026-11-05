"""Computed insights for the work domain (work-wages, work-labour)."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.contract import load_places, PROCESSED  # noqa: E402
from common.fetch import now_iso  # noqa: E402

WORK = PROCESSED / "work"
OCC10 = [("21232", "Software developers"), ("31301", "Registered nurses"), ("73300", "Transport truck drivers"),
         ("42202", "Early childhood educators"), ("11100", "Accountants and auditors"), ("72200", "Electricians"),
         ("63200", "Cooks"), ("64100", "Retail salespersons"), ("44101", "Home support workers"), ("72106", "Welders")]
NOCNAME = dict(OCC10)
WSRC = "jobbank-wages-2025"
LSRCS = ["statcan-14-10-0459-01", "statcan-14-10-0292-01", "statcan-14-10-0462-01"]
NOT_RANKED = {"whitehorse", "yellowknife", "iqaluit", "charlottetown", "brandon"}  # not CMA-level / not SA: left out of rankings


def primary_er(p):
    ers = p.get("economicRegions") or p.get("geo", {}).get("economicRegions")
    return str(ers[0]["id"])


def per_place(table, noc, places):
    out = {}
    for p in places:
        c = table["byNoc"].get(noc, {}).get(primary_er(p))
        if c and c[1] is not None:
            assert c[3] == 0
            out[p["id"]] = c
    return out


def dedupe(vals, places, namemap):
    """Places sharing one economic region (Vancouver / Abbotsford-Mission) appear once."""
    seen, out = {}, []
    for p in places:
        if p["id"] not in vals:
            continue
        er = primary_er(p)
        if er in seen:
            out[seen[er]]["label"] += f" / {p['name']}"
            continue
        seen[er] = len(out)
        out.append({"pid": p["id"], "label": p["name"], "er": er, "c": vals[p["id"]]})
    return out


def build():
    places = load_places()
    table = json.loads((WORK / "wages.json").read_text())
    obs = json.loads((WORK / "observations.json").read_text())
    series = {s["id"]: s for s in json.loads((WORK / "series.json").read_text())}
    pname = {p["id"]: p["name"] for p in places}
    wdetail = lambda c: f"${c[0]:.2f}-${c[2]:.2f}"  # noqa: E731

    # ---------------- wages: no pooled city ranking or mixed-method wage range.
    from collections import Counter
    wage_source = table["sourceId"]
    metadata = table.get("metadata", {})
    findings, charts, related = [], [], set()
    periods = sorted({m["referencePeriod"] for cells in metadata.values() for m in cells.values() if m.get("referencePeriod")})
    for noc, name in [("31301", "Registered nurses"), ("72106", "Welders"), ("73300", "Transport truck drivers")]:
        candidates = {}
        for p in places:
            er = primary_er(p)
            cell = table["byNoc"].get(noc, {}).get(er)
            provenance = metadata.get(noc, {}).get(er)
            geography = table["geos"].get(er, {})
            if not cell or cell[1] is None or cell[3] != 0 or not provenance:
                continue
            if geography.get("level") != "economic_region" or not provenance.get("referencePeriod") or not provenance.get("methodology"):
                continue
            signature = (provenance["referencePeriod"], provenance["methodology"])
            candidates.setdefault(er, {"cell": cell, "signature": signature, "geo": geography, "pid": p["id"]})
        counts = Counter(r["signature"] for r in candidates.values())
        if not counts:
            continue
        signature = sorted(counts, key=lambda key: (-counts[key], key))[0]
        cohort = sorted((r for r in candidates.values() if r["signature"] == signature), key=lambda r: r["geo"]["name"])
        reference, method = signature
        points = [{"x": r["geo"]["name"], "y": r["cell"][1], "y0": r["cell"][0], "y1": r["cell"][2], "placeId": r["pid"]} for r in cohort]
        charts.append({"id": f"wage-region-{noc}", "type": "range", "title": f"{name}: published economic-region wages",
                       "subtitle": f"NOC {noc} · {reference} · {method}", "unit": "CAD_hour", "yLabel": "CAD per hour",
                       "series": [{"id": noc, "label": name, "points": points}], "sourceIds": [wage_source],
                       "notes": f"Economic regions, not cities; shared regions appear once. Only hourly cells with the same period and source method are shown. {len(candidates) - len(cohort)} other-method or other-period regions omitted."})
        related.update(r["pid"] for r in cohort)
        if len(cohort) >= 2:
            low, high = min(cohort, key=lambda r: r["cell"][1]), max(cohort, key=lambda r: r["cell"][1])
            findings.append({"id": f"wage-region-range-{noc}", "kind": "observation",
                             "headline": f"{name}: comparable regional medians range from ${low['cell'][1]:.2f} to ${high['cell'][1]:.2f} per hour",
                             "detail": f"Among {len(cohort)} economic regions using {method}, reference period {reference}: {low['geo']['name']} has ${low['cell'][1]:.2f}/hour and {high['geo']['name']} has ${high['cell'][1]:.2f}/hour. These are regional wages of employed workers, not city pay or starting salaries.",
                             "placeIds": [low["pid"], high["pid"]], "sourceIds": [wage_source], "metricId": "noc_wage", "mapParams": {"noc": noc},
                             "calc": "Distinct economic regions; identical hourly unit, observation period and methodology; largest comparable cohort for this occupation."})
    wages_ins = {
        "id": "work-wages", "topic": "work", "title": "Read regional wages with their period and source method",
        "question": "What do employed workers earn in the economic regions around these places?",
        "dek": "Job Bank low, median and high wages, grouped by comparable period and methodology.",
        "findings": findings, "charts": charts,
        "interpretation": ["Economic-region wages provide context around a city; they are not city-level estimates or an offer a newcomer should expect.",
                           "Compare wages only when the occupation, hourly or annual basis, period and source method agree. Annual cells are kept in the data but excluded from these hourly charts."],
        "methodology": ["The source edition is discovered through the official open.canada.ca catalog. Each wage cell retains Reference_Period and Data_Source_E from the CSV.",
                        "For each chart, keep the largest cohort of distinct economic regions with the same period and methodology. Regions are listed alphabetically; provincial and national fallbacks are not substituted."],
        "limitations": ["Different methods or periods are not pooled into a single ranking. Published periods in this snapshot: " + (", ".join(periods) or "not available; no comparative claims generated"),
                        "Wages are nominal earnings of employed workers; they are not adjusted for regional living costs and exclude benefits. Some occupations and regions have no published estimate."],
        "sourceIds": [wage_source, "statcan-noc-2021-v1.0"], "relatedPlaceIds": sorted(related), "computedAt": now_iso(),
    }

    # ---------------- labour
    def val(pid, mid):
        for o in obs:
            if o["placeId"] == pid and o["metricId"] == mid and o["period"] == period and o["value"] is not None:
                return o
        return None
    period = max(o["period"] for o in obs if o["metricId"] == "lfs_unemployment_rate" and o["geo"]["level"] == "cma")
    units = [p for p in places if p["id"] not in NOT_RANKED and (o := val(p["id"], "lfs_unemployment_rate"))
             and o["geo"]["level"] == "cma" and o["sourceId"] == LSRCS[0]
             and o["geo"]["id"] == p.get("geo", {}).get("cma", {}).get("id")]
    ur = sorted(((val(p["id"], "lfs_unemployment_rate")["value"], p["id"]) for p in units if val(p["id"], "lfs_unemployment_rate")))
    er_ = {p["id"]: val(p["id"], "lfs_employment_rate")["value"] for p in units if val(p["id"], "lfs_employment_rate")}
    ch = {}
    for p in units:
        o = val(p["id"], "lfs_unemployment_rate_change_1y")
        if o:
            m = re.search(r"change: ([\d.]+) pp", o.get("note", ""))
            ch[p["id"]] = (o["value"], float(m.group(1)) if m else None)
    lo, hi = ur[0], ur[-1]
    n_units = len(ur)
    median_ur = sorted(v for v, _ in ur)[n_units // 2]
    emp_hi, emp_lo = max(er_.items(), key=lambda kv: kv[1]), min(er_.items(), key=lambda kv: kv[1])
    l1 = {"id": "labour-rate-spread", "kind": "observation",
          "headline": f"Unemployment ranges from {lo[0]:.1f}% in {pname[lo[1]]} to {hi[0]:.1f}% in {pname[hi[1]]} (three months to {period})",
          "detail": (f"Across {n_units} CMAs the seasonally adjusted three-month average unemployment rate runs from {lo[0]:.1f}% ({pname[lo[1]]}) to {hi[0]:.1f}% ({pname[hi[1]]}); the middle is about {median_ur:.1f}%. "
                     f"Employment rates (share of everyone 15+ who is working) range from {emp_lo[1]:.1f}% in {pname[emp_lo[0]]} to {emp_hi[1]:.1f}% in {pname[emp_hi[0]]}, which also reflects age structure and who is in the labour force. "
                     f"Ottawa-Gatineau parts are shown separately from whole-CMA ranks. Differences of one point or less between nearby cities are often within sampling error."),
          "stat": {"value": round(hi[0] - lo[0], 1), "unit": "pp", "label": "Highest minus lowest unemployment rate", "period": period},
          "placeIds": [lo[1], hi[1], emp_hi[0], emp_lo[0], "ottawa", "gatineau"], "metricId": "lfs_unemployment_rate", "sourceIds": [LSRCS[0]],
          "calc": f"Table 14-10-0459-01, seasonally adjusted, Estimate, REF_DATE {period}; unemployment rate and employment rate for whole-CMA places on the same geography; territories, Charlottetown (provincial) and Brandon (regional, unadjusted) excluded from the ranking."}
    sig_dec = sorted((k for k, (v, se) in ch.items() if se and v < 0 and abs(v) > 1.96 * se), key=lambda k: ch[k][0])
    sig_inc = sorted((k for k, (v, se) in ch.items() if se and v > 0 and abs(v) > 1.96 * se), key=lambda k: -ch[k][0])
    n_dec = sum(1 for v, _ in ch.values() if v < 0)
    n_inc = sum(1 for v, _ in ch.values() if v > 0)
    l2 = {"id": "labour-yoy-change", "kind": "calculation",
          "headline": f"Compared with a year earlier, unemployment fell in {n_dec} of {len(ch)} places and rose in {n_inc}, but only {len(sig_dec) + len(sig_inc)} changes are clearly larger than sampling noise",
          "detail": ("Changes beyond 1.96 standard errors: "
                     + (", ".join(f"{pname[k]} {ch[k][0]:+.1f} pp" for k in sig_dec + sig_inc) or "none")
                     + ". Every other change is small relative to the survey's sampling error and should not be read as a trend. "
                       "Both values are three-month moving averages, so a one-month swing is dampened and consecutive months overlap."),
          "stat": {"value": len(sig_dec) + len(sig_inc), "unit": "count", "label": "Changes exceeding 1.96 standard errors", "period": period},
          "placeIds": sig_dec + sig_inc, "metricId": "lfs_unemployment_rate_change_1y", "sourceIds": [LSRCS[0]],
          "calc": f"change = rate({period}) - rate({int(period[:4]) - 1}{period[4:]}) from 14-10-0459-01 (SA, 3-month moving average); significant if |change| > 1.96 x published standard error of year-over-year change; whole-CMA places."}

    def ur_pts(items, key):
        return [{"x": pname[pid], "y": v, "placeId": pid} for v, pid in items]
    cA = {"id": "unemployment-ranked", "type": "bar_ranked", "title": f"Unemployment rate by city, three months to {period}",
          "subtitle": "Seasonally adjusted three-month moving average, population 15+", "unit": "percent",
          "series": [{"id": "ur", "label": "Unemployment rate", "points": ur_pts(sorted(ur, reverse=True), 0)}],
          "notes": "Whole CMAs only; Ottawa-Gatineau provincial parts, territories, Charlottetown and Brandon are not ranked because the LFS publishes them on a different geography or basis.", "sourceIds": [LSRCS[0]]}
    cB = {"id": "unemployment-change-ranked", "type": "bar_ranked", "title": "Change in unemployment rate vs a year earlier (percentage points)",
          "subtitle": f"{period} minus {int(period[:4]) - 1}{period[4:]}, three-month moving averages", "unit": "pp",
          "series": [{"id": "chg", "label": "Change, pp", "points": [{"x": pname[k], "y": v, "placeId": k, "label": ("significant at 1.96 SE" if (se and abs(v) > 1.96 * se) else "within sampling error")}
                                                                   for k, (v, se) in sorted(ch.items(), key=lambda kv: -kv[1][0])]}],
          "notes": "Label says whether the change exceeds 1.96 x Statistics Canada's standard error of the year-over-year change.", "sourceIds": [LSRCS[0]]}
    sel = ["toronto", "montreal", "vancouver", "calgary", "halifax", "quebec-city"]
    cC = {"id": "unemployment-trend", "type": "line", "title": "Unemployment rate since January 2019, selected CMAs",
          "subtitle": "Seasonally adjusted three-month moving average", "unit": "percent",
          "series": [{"id": pid, "label": pname[pid], "placeId": pid,
                      "points": [{"x": q["t"], "y": q["v"]} for q in series[f"lfs_unemployment_rate:{pid}"]["points"]]} for pid in sel],
          "notes": "The 2020 spike reflects the pandemic; compare current levels with 2019 and early 2020 for context.", "sourceIds": [LSRCS[0]]}
    labour_ins = {
        "id": "work-labour", "topic": "work",
        "title": "Job markets differ by several points between Canadian cities, and the year-on-year moves are mostly small",
        "question": "Which cities have tighter labour markets, and how are conditions changing?",
        "dek": "Labour Force Survey rates for comparable whole-CMA areas, with other places shown on their published geography.",
        "findings": [l1, l2], "charts": [cA, cB, cC],
        "interpretation": [
            "A lower unemployment rate and a higher employment rate usually mean employers compete harder for workers, but rates describe everyone in the labour force, not newcomers in your occupation. Check Job Bank wages and current postings for your field.",
            "Treat gaps of a point or less as ties. Small metropolitan areas have larger sampling error, and the three-month moving average smooths month-to-month changes.",
            "For Whitehorse, Yellowknife and Iqaluit the figures are territory-wide; Charlottetown shows Prince Edward Island; Brandon shows the Southwest economic region (unadjusted). They sit in the map and place profiles with that label rather than in the rankings.",
        ],
        "methodology": [
            f"Source: Statistics Canada Labour Force Survey, Table 14-10-0459-01 (CMA, three-month moving average, seasonally adjusted), latest period {period}; release date is shown in Sources. Territories: Table 14-10-0292-01 (seasonally adjusted series); Brandon: Table 14-10-0462-01 (economic region, unadjusted).",
            "Each rate is the three-month moving average ending in the month shown. The one-year change subtracts the same measure twelve months earlier; significance uses Statistics Canada's standard error of the year-over-year change.",
            "Ottawa and Gatineau use the LFS's Ontario and Quebec parts of the Ottawa-Gatineau CMA.",
        ],
        "limitations": [
            "The LFS is a sample survey; estimates for small metros are volatile and Statistics Canada rounds to one decimal. Levels and changes are not forecasts.",
            "Rates describe all residents 15+, including students, retirees and people outside the labour force, and say little about opportunities for a specific occupation or for people who are not yet in Canada.",
            "For Nunavut the published seasonally adjusted values equal the unadjusted values in every month since 2019 (and in about a third of months for the Northwest Territories), so the SA label is largely nominal there.",
        ],
        "sourceIds": LSRCS,
        "relatedPlaceIds": sorted({lo[1], hi[1], "toronto", "montreal", "vancouver", "calgary", "ottawa", "gatineau", "london", "kelowna"}),
        "computedAt": now_iso(),
    }
    return [wages_ins, labour_ins]


if __name__ == "__main__":
    for i in build():
        print(i["id"])
        for f in i["findings"]:
            print(" -", f["headline"]); print("   ", f["detail"][:400])
