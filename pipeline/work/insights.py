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

    # ---------------- wages
    ca = {n: table["byNoc"][n]["CA"] for n, _ in OCC10}
    ordered = sorted(OCC10, key=lambda x: ca[x[0]][1])
    lo_n, hi_n = ordered[0], ordered[-1]
    ratio = ca[hi_n[0]][1] / ca[lo_n[0]][1]
    f1 = {"id": "wage-occupation-gap", "kind": "calculation",
          "headline": f"Median hourly pay across 10 common newcomer occupations ranges from ${ca[lo_n[0]][1]:.2f} ({lo_n[1].lower()}) to ${ca[hi_n[0]][1]:.2f} ({hi_n[1].lower()})",
          "detail": (f"Canada-wide medians for employed workers run from ${ca[lo_n[0]][1]:.2f}/hour for {lo_n[1].lower()} to ${ca[hi_n[0]][1]:.2f}/hour for {hi_n[1].lower()}, "
                     f"a ratio of {ratio:.1f}x. Within an occupation the low-to-high range is wide: {hi_n[1].lower()} run {wdetail(ca[hi_n[0]])}. "
                     "These describe people already working in the occupation in Canada, not starting pay for new arrivals."),
          "stat": {"value": round(ca[hi_n[0]][1], 2), "unit": "CAD_hour", "label": f"Median, {hi_n[1].lower()}, Canada", "period": "2023-2024"},
          "placeIds": [], "metricId": None, "sourceIds": [WSRC],
          "calc": "Job Bank Wages 2025 edition, geography Canada (ER00), median wage for NOC 21232, 31301, 73300, 42202, 11100, 72200, 63200, 64100, 44101, 72106 (all hourly, Annual_Wage_Flag=0); ratio = max median / min median."}
    # RN regional
    rn = per_place(table, "31301", places)
    rn_d = dedupe(rn, places, pname)
    rn_prov = [r for r in rn_d if r["pid"] not in ("whitehorse", "yellowknife", "iqaluit")]
    rn_hi, rn_lo = max(rn_prov, key=lambda r: r["c"][1]), min(rn_prov, key=lambda r: r["c"][1])
    terr = [r for r in rn_d if r["pid"] in ("whitehorse", "yellowknife", "iqaluit")]
    terr_txt = ", ".join(f"{r['label']} ${r['c'][1]:.2f}" for r in terr)
    f2 = {"id": "wage-rn-regional", "kind": "calculation",
          "headline": f"Registered nurses' median hourly wage is ${rn_hi['c'][1]:.2f} in {rn_hi['label']} but ${rn_lo['c'][1]:.2f} in {rn_lo['label']} (provinces, same occupation)",
          "detail": (f"Among the places' economic regions in the ten provinces, the highest published median for registered nurses and registered psychiatric nurses is ${rn_hi['c'][1]:.2f} ({rn_hi['label']} economic region) "
                     f"and the lowest ${rn_lo['c'][1]:.2f} ({rn_lo['label']}), a gap of ${rn_hi['c'][1]-rn_lo['c'][1]:.2f}/hour. Territorial medians are higher still ({terr_txt}). "
                     "Remote places also tend to have higher living costs; wages here are nominal and not adjusted for prices."),
          "stat": {"value": round(rn_hi['c'][1] - rn_lo['c'][1], 2), "unit": "CAD_hour", "label": "Gap between highest and lowest provincial place median", "period": "2023-2024"},
          "placeIds": [rn_hi["pid"], rn_lo["pid"]] + [r["pid"] for r in terr], "metricId": "noc_wage", "mapParams": {"noc": "31301"}, "sourceIds": [WSRC],
          "calc": "For each place take the median wage of NOC 31301 in its primary economic region (geo.economicRegions[0]); shared ERs counted once; gap = max - min over the 10 provinces' places, territories reported separately."}
    # trades premium
    wel = per_place(table, "72106", places)
    trk = per_place(table, "73300", places)
    ab = lambda v: [v[k][1] for k in ("calgary", "edmonton")]  # noqa: E731
    on_mtl = lambda v: [v[k][1] for k in ("toronto", "montreal")]  # noqa: E731
    wel_ab, wel_ot = sum(ab(wel)) / 2, sum(on_mtl(wel)) / 2
    trk_ab, trk_ot = sum(ab(trk)) / 2, sum(on_mtl(trk)) / 2
    f3 = {"id": "wage-alberta-trades", "kind": "calculation",
          "headline": f"Welders' median wage in Calgary and Edmonton (${wel['calgary'][1]:.2f}, ${wel['edmonton'][1]:.2f}) is about {100*(wel_ab/wel_ot-1):.0f}% above Toronto and Montréal (${wel['toronto'][1]:.2f}, ${wel['montreal'][1]:.2f})",
          "detail": (f"The pattern is similar for transport truck drivers: ${trk['calgary'][1]:.2f} (Calgary) and ${trk['edmonton'][1]:.2f} (Edmonton) versus ${trk['toronto'][1]:.2f} (Toronto) and ${trk['montreal'][1]:.2f} (Montréal), "
                     f"about {100*(trk_ab/trk_ot-1):.0f}% higher. For child-care, retail and food-service occupations regional differences are much smaller. Always compare against local rents before treating a wage gap as a gain."),
          "stat": {"value": round(100 * (wel_ab / wel_ot - 1), 1), "unit": "percent", "label": "Welders: Calgary/Edmonton mean median vs Toronto/Montréal mean median", "period": "2023-2024"},
          "placeIds": ["calgary", "edmonton", "toronto", "montreal"], "metricId": "noc_wage", "mapParams": {"noc": "72106"}, "sourceIds": [WSRC],
          "calc": "Median wage NOC 72106 (welders) and 73300 (truck drivers) in primary ERs of the four places (4830, 4860, 3530, 2440); percent = mean(Calgary, Edmonton) / mean(Toronto, Montréal) - 1."}

    def rng_points(items):
        return [{"x": r["label"], "y": r["c"][1], "y0": r["c"][0], "y1": r["c"][2], "placeId": r["pid"]} for r in items]

    c1 = {"id": "rn-wage-range", "type": "range", "title": "Registered nurses: hourly wage range by place's economic region",
          "subtitle": "Low, median and high wage of employed workers, NOC 31301, 2023-2024 reference period", "unit": "CAD_hour", "yLabel": "CAD per hour",
          "series": [{"id": "rn", "label": "Registered nurses and registered psychiatric nurses",
                      "points": rng_points(sorted(rn_d, key=lambda r: -r["c"][1]))}],
          "notes": "Each point is the place's primary Job Bank economic region, not the city alone. Vancouver and Abbotsford-Mission share one region.", "sourceIds": [WSRC]}
    occ_items = [{"x": NOCNAME[n], "y": ca[n][1], "y0": ca[n][0], "y1": ca[n][2]} for n, _ in sorted(OCC10, key=lambda x: -ca[x[0]][1])]
    c2 = {"id": "occupation-wage-range", "type": "range", "title": "Ten common occupations: hourly wage range, Canada",
          "subtitle": "Low, median and high wage of employed workers, 2023-2024", "unit": "CAD_hour", "yLabel": "CAD per hour",
          "series": [{"id": "canada", "label": "Canada", "points": occ_items}],
          "notes": "Wages of people currently employed in the occupation; not advertised pay and not an offer you should expect on arrival.", "sourceIds": [WSRC]}
    wel_d = dedupe(wel, places, pname)
    c3 = {"id": "welder-wage-ranked", "type": "bar_ranked", "title": "Welders: median hourly wage by place's economic region",
          "subtitle": "NOC 72106, employed workers, 2023-2024", "unit": "CAD_hour",
          "series": [{"id": "welders", "label": "Median wage, welders and related machine operators",
                      "points": [{"x": r["label"], "y": r["c"][1], "placeId": r["pid"]} for r in sorted(wel_d, key=lambda r: -r["c"][1])]}],
          "notes": "Places whose economic region has no published welder wage are omitted.", "sourceIds": [WSRC]}
    # occupation coverage note
    miss = {n: sorted(pname[p["id"]] for p in places if p["id"] not in per_place(table, n, places)) for n, _ in OCC10}

    wages_ins = {
        "id": "work-wages", "topic": "work",
        "title": "Pay depends more on the occupation than the city, but some regions pay a clear premium",
        "question": "What do people in common newcomer occupations earn, and how much does it differ between places?",
        "dek": "Job Bank wage estimates for ten occupations: low, median and high hourly wages of employed workers, by economic region.",
        "findings": [f1, f2, f3], "charts": [c2, c1, c3],
        "interpretation": [
            "Use the occupation first: the spread between occupations is far larger than the spread between most cities for the same occupation. Regional differences matter most for trades, truck driving and health care, where Alberta, British Columbia and the territories sit at the top.",
            "The low wage in several occupations is identical across occupations within a region (for example $17.60 for cooks, retail and food-service workers in Toronto and Ottawa), which looks like a minimum-wage floor, so low-end figures partly reflect legal floors rather than market pay. Median and high values say more about experienced workers.",
            "Credential recognition, licensing and Canadian experience can put new arrivals below these medians at first, especially in regulated occupations such as nursing.",
        ],
        "methodology": [
            "Source: Employment and Social Development Canada, Job Bank Wages (open data, 2025 edition, revision date 2025-11-19). Wage estimates are for employed workers by NOC 2021 unit group and economic region; they are not advertised wages.",
            "Estimates come from the Labour Force Survey (2023-2024), Employment Insurance survey data, Small Area Estimation (2024) and, for a few occupations, the 2021 Census; the source of each cell is in the open file.",
            "Each place is represented by its primary economic region (the first economic region listed for the place). Values are nominal hourly dollars; all ten occupations are published hourly.",
            "Occupations were chosen for newcomer relevance (high-demand, large and regulated and trades occupations) and for data availability; occupations with an annual-rate flag were avoided.",
        ],
        "limitations": [
            "Economic regions are not the same as cities: Vancouver and Abbotsford-Mission share one region (Lower Mainland--Southwest), Québec City's primary region is Capitale-Nationale, and Montréal's is the Montréal region only (not Laval or the suburbs).",
            "Small Area Estimation and LFS-based estimates carry sampling error; cells without enough data are not published and are left empty here (not replaced by provincial values). Missing places per occupation: "
            + "; ".join(f"{NOCNAME[n]}: {', '.join(v) if v else 'none'}" for n, v in miss.items() if v),
            "Reference period is 2023-2024 (mostly); wages have moved since. Wages are not adjusted for local prices and exclude benefits.",
        ],
        "sourceIds": [WSRC, "statcan-noc-2021-v1.0"],
        "relatedPlaceIds": sorted({"calgary", "edmonton", "toronto", "montreal", "vancouver", "yellowknife"}),
        "computedAt": now_iso(),
    }

    # ---------------- labour
    def val(pid, mid):
        for o in obs:
            if o["placeId"] == pid and o["metricId"] == mid and o["period"] == period and o["value"] is not None:
                return o
        return None
    period = max(o["period"] for o in obs)
    units = [p for p in places if p["id"] not in NOT_RANKED]
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
          "detail": (f"Across {n_units} CMAs and CMA parts the seasonally adjusted three-month average unemployment rate runs from {lo[0]:.1f}% ({pname[lo[1]]}) to {hi[0]:.1f}% ({pname[hi[1]]}); the middle is about {median_ur:.1f}%. "
                     f"Employment rates (share of everyone 15+ who is working) range from {emp_lo[1]:.1f}% in {pname[emp_lo[0]]} to {emp_hi[1]:.1f}% in {pname[emp_hi[0]]}, which also reflects age structure and who is in the labour force. "
                     f"The Ottawa-Gatineau halves differ: Ontario part {val('ottawa','lfs_unemployment_rate')['value']:.1f}%, Quebec part {val('gatineau','lfs_unemployment_rate')['value']:.1f}%. Differences of one point or less between nearby cities are often within sampling error."),
          "stat": {"value": round(hi[0] - lo[0], 1), "unit": "pp", "label": "Highest minus lowest unemployment rate", "period": period},
          "placeIds": [lo[1], hi[1], emp_hi[0], emp_lo[0], "ottawa", "gatineau"], "metricId": "lfs_unemployment_rate", "sourceIds": [LSRCS[0]],
          "calc": f"Table 14-10-0459-01, seasonally adjusted, Estimate, REF_DATE {period}; unemployment rate and employment rate for the 26 CMA / Ottawa-Gatineau part places; territories, Charlottetown (provincial) and Brandon (regional, unadjusted) excluded from the ranking."}
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
          "stat": {"value": ch[sig_inc[0]][0] if sig_inc else ch[sig_dec[0]][0], "unit": "pp", "label": f"Largest significant change ({pname[(sig_inc or sig_dec)[0]]})", "period": period},
          "placeIds": sig_dec + sig_inc, "metricId": "lfs_unemployment_rate_change_1y", "sourceIds": [LSRCS[0]],
          "calc": f"change = rate({period}) - rate({int(period[:4]) - 1}{period[4:]}) from 14-10-0459-01 (SA, 3-month moving average); significant if |change| > 1.96 x published standard error of year-over-year change; 26 CMA / part places."}

    def ur_pts(items, key):
        return [{"x": pname[pid], "y": v, "placeId": pid} for v, pid in items]
    cA = {"id": "unemployment-ranked", "type": "bar_ranked", "title": f"Unemployment rate by city, three months to {period}",
          "subtitle": "Seasonally adjusted three-month moving average, population 15+", "unit": "percent",
          "series": [{"id": "ur", "label": "Unemployment rate", "points": ur_pts(sorted(ur, reverse=True), 0)}],
          "notes": "CMAs and Ottawa-Gatineau provincial parts only; territories, Charlottetown and Brandon are not ranked because the LFS publishes them on a different geography or basis.", "sourceIds": [LSRCS[0]]}
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
        "dek": "Labour Force Survey rates for 26 metro areas, with the smaller places shown on their published geography.",
        "findings": [l1, l2], "charts": [cA, cB, cC],
        "interpretation": [
            "A lower unemployment rate and a higher employment rate usually mean employers compete harder for workers, but rates describe everyone in the labour force, not newcomers in your occupation. Check Job Bank wages and current postings for your field.",
            "Treat gaps of a point or less as ties. Small metropolitan areas have larger sampling error, and the three-month moving average smooths month-to-month changes.",
            "For Whitehorse, Yellowknife and Iqaluit the figures are territory-wide; Charlottetown shows Prince Edward Island; Brandon shows the Southwest economic region (unadjusted). They sit in the map and place profiles with that label rather than in the rankings.",
        ],
        "methodology": [
            f"Source: Statistics Canada Labour Force Survey, Table 14-10-0459-01 (CMA, three-month moving average, seasonally adjusted), latest period {period} (released 2026-10-09). Territories: Table 14-10-0292-01 (seasonally adjusted series); Brandon: Table 14-10-0462-01 (economic region, unadjusted).",
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
