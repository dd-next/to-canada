"""Insights: immigrant-income and settlement. Every number is computed from the built observations/series."""
from __future__ import annotations

import statistics

from common_i import TODAY, places

CATK = ["econ_pa", "econ_dep", "family", "refugee"]
CATLABEL = {"econ_pa": "Economic principal applicants", "econ_dep": "Economic spouses and dependants",
            "family": "Family sponsored", "refugee": "Refugees", "all": "All categories"}


def _pts(series, sid):
    s = next(x for x in series if x["id"] == sid)
    return {int(p["t"]): p["v"] for p in s["points"]}


def money(x):
    return f"${x:,.0f}"


def build(ircc_obs, ircc_info, rates, pops, inc_obs, inc_series, ret_obs, ret_series, ircc_data):
    names = {p["id"]: p["name"] for p in places()}
    ins = []
    # ------------------------------------------------------------------ immigrant-income
    y5 = {}
    for ck in CATK:
        y5[ck] = _pts(inc_series, f"imm_emp_income_canada_{ck}_2018")[5]
    allc5 = _pts(inc_series, "imm_emp_income_canada_all_2018")[5]
    g = {}
    for ck in CATK:
        p = _pts(inc_series, f"imm_emp_income_canada_{ck}_2015")
        g[ck] = (p[1], p[8], (p[8] / p[1] - 1) * 100)
    best = max(CATK, key=lambda k: g[k][2])
    wages = [(o["placeId"], o["value"], o.get("flags", [])) for o in inc_obs if o["metricId"] == "imm_median_wages_5y"]
    cma_w = sorted([(p, v) for p, v, f in wages if v is not None and "provincial_value" not in f], key=lambda t: -t[1])
    med = statistics.median(v for _, v in cma_w)
    top, bot = cma_w[:3], cma_w[-3:]
    f1 = {"id": "income-by-category-yr5", "kind": "observation",
          "headline": f"Five years after admission, economic principal applicants report median employment income of {money(y5['econ_pa'])}, versus {money(y5['family'])} for family-sponsored and {money(y5['refugee'])} for refugees",
          "detail": (f"Canada, immigrants admitted in 2018, observed in the 2023 tax year (year 5), median employment income of taxfilers aged 15+ with employment income, 2023 constant dollars: "
                     f"economic principal applicants {money(y5['econ_pa'])}; economic spouses and dependants {money(y5['econ_dep'])}; family sponsored {money(y5['family'])}; refugees {money(y5['refugee'])}; all categories {money(allc5)}. "
                     "These are historical group medians of people who filed taxes and had employment income, not a forecast for any individual; categories differ in age, family role, language and how many people are working at all."),
          "stat": {"value": y5["econ_pa"], "unit": "CAD_year", "label": "median employment income, economic principal applicants, year 5 (2018 cohort)", "period": "2023"},
          "placeIds": [], "sourceIds": ["statcan-43-10-0030-01"],
          "calc": "Table 43-10-0030-01, GEO=Canada, Sex=Total, Admission year=2018, REF_DATE (tax year)=2023 (years since admission = 2023-2018 = 5), Statistics='Median employment income', categories as named."}
    f2 = {"id": "income-growth-yr1-yr8", "kind": "calculation",
          "headline": f"For the 2015 cohort, median employment income rose between year 1 and year 8 in every category, most for {CATLABEL[best].lower()} (+{g[best][2]:.0f}%)",
          "detail": "; ".join(f"{CATLABEL[k]}: {money(g[k][0])} (year 1, 2016) to {money(g[k][1])} (year 8, 2023), +{g[k][2]:.0f}%" for k in CATK) +
                    ". Constant 2023 dollars; each year's median covers whoever filed with employment income that year, so composition changes (arrivals/departures, entry into work) are part of the movement. Year 1 medians are often low because many people work only part of the first full tax year.",
          "stat": {"value": round(g[best][2], 1), "unit": "percent", "label": f"change in median employment income, year 1 to year 8, {CATLABEL[best].lower()}, 2015 cohort", "period": "2016-2023"},
          "placeIds": [], "sourceIds": ["statcan-43-10-0030-01"],
          "calc": "(median employment income in tax year 2023 / median in tax year 2016 - 1) x 100, admission year 2015, Canada, each category, constant 2023 dollars."}
    f3 = {"id": "wages-5y-by-cma", "kind": "observation",
          "headline": f"Five years after admission, median wages of the 2018 cohort range from {money(bot[-1][1])} in {names[bot[-1][0]]} to {money(top[0][1])} in {names[top[0][0]]} among {len(cma_w)} CMAs",
          "detail": (f"Median wages, salaries and commissions (2023 constant dollars) of immigrant taxfilers admitted in 2018, all categories, in the 2023 tax year, by CMA of residence when filing: highest {', '.join(f'{names[p]} {money(v)}' for p, v in top)}; "
                     f"lowest {', '.join(f'{names[p]} {money(v)}' for p, v in reversed(bot))}; median across CMAs {money(med)}. Differences reflect who settled where (admission category mix, occupations, age) as well as local labour markets, so they are not a prediction of what a newcomer would earn in a city. "
                     "Whitehorse, Yellowknife and Iqaluit are not in the table; Charlottetown and Brandon have only provincial values (not ranked)."),
          "stat": {"value": top[0][1], "unit": "CAD_year", "label": f"highest CMA median wages, year 5 ({names[top[0][0]]})", "period": "2023"},
          "placeIds": [p for p, _ in top] + [p for p, _ in bot], "metricId": "imm_median_wages_5y", "sourceIds": ["statcan-43-10-0030-01"],
          "calc": "Table 43-10-0030-01, Statistics='Median wages, salaries and commissions', Admission year=2018, REF_DATE=2023, category='Total, immigrant admission category', Sex=Total; CMAs only, sorted descending; median over the CMAs shown."}
    chart_line = {"id": "income-by-years-since-admission", "type": "line", "title": "Median employment income by years since admission (2015 admission cohort, Canada)",
                  "subtitle": "Immigrant taxfilers aged 15+ with employment income, 2023 constant dollars",
                  "unit": "CAD_year", "xLabel": "Years since admission", "yLabel": "Median employment income",
                  "series": [{"id": ck, "label": CATLABEL[ck], "points": [{"x": t, "y": v} for t, v in sorted(_pts(inc_series, f"imm_emp_income_canada_{ck}_2015").items())]} for ck in CATK],
                  "notes": "Year 0 (admission year) is not published. Medians exclude people with no employment income. Category definitions are StatCan's admission categories (economic principal applicants; economic spouses and dependants; sponsored by family; refugees).",
                  "sourceIds": ["statcan-43-10-0030-01"]}
    chart_wages = {"id": "wages-5y-cma", "type": "bar_ranked", "title": "Median wages five years after admission, by CMA (2018 admission cohort, 2023 tax year)",
                   "subtitle": "2023 constant dollars, all admission categories", "unit": "CAD_year",
                   "series": [{"id": "wages5y", "label": "Median wages, salaries and commissions", "points": [{"x": names[p], "y": v, "label": names[p], "placeId": p, "f": ["rounded"]} for p, v in cma_w]}],
                   "notes": "CMA of residence when filing (not intended destination). Excludes places the table does not cover.", "sourceIds": ["statcan-43-10-0030-01"]}
    ins.append({"id": "immigrant-income", "topic": "immigrant_income",
                "title": f"Immigrants' employment income rises with years in Canada, but the level differs sharply by admission category (economic principal applicants {money(y5['econ_pa'])} vs refugees {money(y5['refugee'])} at year 5)",
                "question": "What have immigrants admitted in earlier years actually earned, by how they were admitted and how long they have been here?",
                "dek": "Historical medians from tax records of immigrants admitted since 2008, in constant 2023 dollars. They describe past cohorts, not what a new arrival will earn.",
                "findings": [f1, f2, f3], "charts": [chart_line, chart_wages],
                "interpretation": ["Use these figures to understand typical trajectories: incomes start lower in the first full years after admission and rise with time, and the starting point and pace differ by admission category.",
                                   "Place-level medians mix many occupations and family situations. Treat the CMA comparison as context for local labour markets and immigrant composition, not as an earnings forecast, and check occupation-specific wages in the Work section."],
                "methodology": ["Source: StatCan table 43-10-0030-01 (Longitudinal Immigration Database, IRCC landing records linked to tax files). Population: immigrant taxfilers aged 15+ residing in Canada; geography is the postal code on the tax return.",
                                "Years since admission = tax year minus admission year (the table has no separate field). Income is in 2023 constant dollars; zero and one dollar values are excluded from medians.",
                                "Series use 'Median employment income' (wages plus self-employment); the place-level metric uses 'Median wages, salaries and commissions'. Values are rounded to the nearest $100."],
                "limitations": ["Survivor and composition effects: only people who file tax and are in Canada are counted; leavers and non-filers drop out.",
                                "Admission year is the year of landing, which may differ from arrival; pre-admission Canadian experience (e.g. former students and workers) is not separated here (the table has that dimension but the series use all).",
                                "The table has no territories, and census agglomerations (Charlottetown, Brandon) have no values; the latest cohort with five observed years is 2018."],
                "sourceIds": ["statcan-43-10-0030-01"], "relatedPlaceIds": [p for p, _ in top + bot], "computedAt": TODAY})
    # ------------------------------------------------------------------ settlement
    r_sorted = sorted([(o["placeId"], o["value"]) for o in rates if o["value"] is not None], key=lambda t: -t[1])
    ch = {o["placeId"]: o["value"] for o in ircc_obs if o["metricId"] == "imm_pr_admissions_change"}
    adm = {o["placeId"]: o["value"] for o in ircc_obs if o["metricId"] == "imm_pr_admissions"}
    latest, prev = ircc_info["latest"], ircc_info["prev"]
    can = ircc_data[("country", "Canada", None)]
    c_l, c_p = can["annual"][latest][0], can["annual"][prev][0]
    chvals = [v for v in ch.values() if v is not None]
    n_down = sum(1 for v in chvals if v < 0)
    top5, low5 = r_sorted[:5], r_sorted[-3:]
    sum_adm = sum(v for v in adm.values() if v)
    f4 = {"id": "intended-destinations-per-1000", "kind": "calculation",
          "headline": f"New permanent residents per 1,000 residents in {latest} ranged from {r_sorted[-1][1]:.1f} in {names[r_sorted[-1][0]]} to {r_sorted[0][1]:.1f} in {names[r_sorted[0][0]]}; {n_down} of {len(chvals)} places saw fewer admissions than in {prev}",
          "detail": (f"Admissions by CMA/CA of intended destination at landing in {latest}, divided by StatCan's July 1 {latest} population estimate: highest {', '.join(f'{names[p]} {v:.1f}' for p, v in top5)}; lowest {', '.join(f'{names[p]} {v:.1f}' for p, v in reversed(low5))}. "
                     f"Across Canada IRCC counts {c_l:,.0f} admissions in {latest} versus {c_p:,.0f} in {prev} ({(c_l / c_p - 1) * 100:+.1f}%). "
                     f"Year-to-date {ircc_info['ytd']}: Toronto {ircc_data[('area', 'Toronto', 'ON')]['annual'][ircc_info['ly']][0]:,.0f}, Vancouver {ircc_data[('area', 'Vancouver', 'BC')]['annual'][ircc_info['ly']][0]:,.0f}, Montréal {ircc_data[('area', 'Montréal', 'QC')]['annual'][ircc_info['ly']][0]:,.0f} (rounded to 5; partial year, not comparable with full years). "
                     "Intended destination is the address given at landing; it is not where people live later (see retention below). Counts are rounded to the nearest 5 and 0-5 shown as suppressed."),
          "stat": {"value": r_sorted[0][1], "unit": "per_1000", "label": f"admissions per 1,000 residents, {names[r_sorted[0][0]]}", "period": str(latest)},
          "placeIds": [p for p, _ in top5] + [p for p, _ in low5], "metricId": "imm_pr_admissions_per_1000", "sourceIds": ["ircc-pr-cma", "statcan-17-10-0148-01"],
          "calc": f"IRCC PR admissions {latest} (calendar-year total, CMA/CA of intended destination) / StatCan 17-10-0148-01 population July 1 {latest} (all ages, total gender, same CMA/CA, 2021 boundaries) x 1000; Ottawa/Gatineau use their Ontario/Quebec parts. Change = ({latest}/{prev} - 1) x 100."}
    # retention
    prov_ret = {}
    for o in ret_obs:
        if o["metricId"] == "imm_retention_5y" and o["value"] is not None:
            prov_ret[o["geo"]["name"]] = o["value"]
    pr_sorted = sorted(prov_ret.items(), key=lambda t: -t[1])
    ca_ret = next(p for p in ret_series if p["id"] == "imm_retention_ca_2015")
    cma_ret = {o["placeId"]: o["value"] for o in ret_obs if o["metricId"] == "imm_retention_cma_5y" and o["value"] is not None}
    cr_sorted = sorted(cma_ret.items(), key=lambda t: -t[1])
    p_places = {}
    for o in ret_obs:
        if o["metricId"] == "imm_retention_5y" and o["value"] is not None:
            p_places.setdefault(o["geo"]["name"], o["placeId"])
    f5 = {"id": "provincial-retention-5y", "kind": "observation",
          "headline": f"Five years on, {pr_sorted[0][1]:.0f}% of 2018 immigrants who intended to settle in {pr_sorted[0][0]} still file there, versus {pr_sorted[-1][1]:.0f}% for {pr_sorted[-1][0]}",
          "detail": ("Retention rate in the 2023 tax year for immigrants admitted in 2018 (all categories), by province of intended destination: " + "; ".join(f"{k} {v:.1f}%" for k, v in pr_sorted) +
                     f". At CMA level the highest retention among our places is {names[cr_sorted[0][0]]} ({cr_sorted[0][1]:.1f}%) and the lowest {names[cr_sorted[-1][0]]} ({cr_sorted[-1][1]:.1f}%). "
                     "Retention counts people who stayed in the intended province or CMA divided by those who stayed plus those who filed elsewhere; it ignores people who moved in from elsewhere, and it is a measure of past cohorts, not a promise about any place. Province values are shown on place pages as provincial values."),
          "stat": {"value": pr_sorted[-1][1], "unit": "percent", "label": f"lowest provincial 5-year retention ({pr_sorted[-1][0]})", "period": "2023"},
          "placeIds": [p_places[pr_sorted[0][0]], p_places[pr_sorted[-1][0]]] if pr_sorted[0][0] in p_places and pr_sorted[-1][0] in p_places else [],
          "metricId": "imm_retention_5y", "sourceIds": ["statcan-43-10-0022-01"],
          "calc": "Table 43-10-0022-01, Statistics='Retention rate', Admission year=2018, REF_DATE=2023 (5 years), category total, age group total, language total, pre-admission experience total; provinces sorted descending."}
    bar_rate = {"id": "pr-admissions-per-1000", "type": "bar_ranked", "title": f"Permanent resident admissions per 1,000 residents, {latest}",
                "subtitle": "By CMA/CA of intended destination at landing; July 1 population denominator", "unit": "per_1000",
                "series": [{"id": "per1000", "label": "Admissions per 1,000 residents", "points": [{"x": names[p], "y": v, "label": names[p], "placeId": p, "f": ["rounded"]} for p, v in r_sorted]}],
                "refs": [{"label": "Canada (all destinations)", "value": round(c_l / pops["__canada__"] * 1000, 2), "axis": "x"}] if pops.get("__canada__") else None,
                "notes": "Intended destination at landing is not current residence. Ottawa and Gatineau are the Ontario and Quebec parts of the CMA. Iqaluit is not published separately by IRCC.", "sourceIds": ["ircc-pr-cma", "statcan-17-10-0148-01"]}
    if bar_rate["refs"] is None:
        del bar_rate["refs"]
    bar_ret = {"id": "retention-5y-province", "type": "bar_ranked", "title": "Share of 2018 immigrants still filing in their intended province five years later",
               "subtitle": "Retention rate, 2023 tax year, all admission categories", "unit": "percent",
               "series": [{"id": "ret5", "label": "Retention rate", "points": [{"x": k, "y": v, "label": k, "f": ["provincial_value", "rounded"]} for k, v in pr_sorted]}],
               "notes": "Retention uses tax residence (postal code). Territories are not in the table.", "sourceIds": ["statcan-43-10-0022-01"]}
    ins.append({"id": "settlement", "topic": "settlement",
                "title": f"Admissions of new permanent residents fell in {n_down} of {len(chvals)} places in {latest}, and five-year retention in the intended province ranges from {pr_sorted[-1][1]:.0f}% ({pr_sorted[-1][0]}) to {pr_sorted[0][1]:.0f}% ({pr_sorted[0][0]})",
                "question": "Where do new permanent residents say they will settle, and how many are still there five years later?",
                "dek": f"IRCC's {latest} admissions by intended destination, scaled to population, kept separate from StatCan's measure of who still files tax in the intended province years later.",
                "findings": [f4, f5], "charts": [bar_rate, bar_ret],
                "interpretation": ["Admissions per 1,000 residents shows how large a place's newcomer inflow is relative to its size; large metros receive the most people, but smaller places such as Moncton and Brandon receive more per resident.",
                                   "Intended destination and retention answer different questions. The first is a declared address at landing; the second is revealed residence years later. Low retention in a province does not say why people left."],
                "methodology": ["Admissions: IRCC open data 'Permanent Residents by Province/Territory and CMA of intended destination' (monthly, January 2015 to August 2026), calendar-year totals; the latest complete year is " + str(latest) + ". Values are rounded to multiples of 5 and 0-5 suppressed; calculations use the rounded values.",
                                "Per-1,000 rates use StatCan 17-10-0148-01, July 1 estimates on 2021 boundaries (total gender, all ages) for the same CMA/CA or Ottawa-Gatineau part.",
                                "Retention: StatCan 43-10-0022-01, 2018 admission cohort in the 2023 tax year."],
                "limitations": ["Admissions are intended destination at landing, not residence; they include people who may later move, and exclude temporary residents and students.",
                                "IRCC publishes no Iqaluit row (Nunavut appears only as 'Other - Nunavut'); the retention table has no territories.",
                                "Rounding to 5 makes small-place rates and changes imprecise; year-over-year changes reflect national levels-plan changes as well as local differences."],
                "sourceIds": ["ircc-pr-cma", "statcan-17-10-0148-01", "statcan-43-10-0022-01"], "relatedPlaceIds": [p for p, _ in top5] + [p for p, _ in low5], "computedAt": TODAY})
    return ins
