"""Insights computed from observations and their actual periods/geographies."""
from __future__ import annotations

import statistics

from common_i import TODAY, places

CATLABEL = {"econ_pa": "Economic principal applicants", "econ_dep": "Economic spouses and dependants",
            "family": "Family sponsored", "refugee": "Refugees", "all": "All categories"}
CATK = ["econ_pa", "econ_dep", "family", "refugee"]


def _pts(series, sid):
    s = next(x for x in series if x["id"] == sid)
    return {int(p["t"]): p["v"] for p in s["points"]}


def money(x):
    return f"${x:,.0f}"


def one_period(rows):
    periods = {r["period"] for r in rows if r.get("value") is not None}
    if len(periods) != 1:
        raise ValueError(f"Analytical cohort has mixed or missing reference periods: {periods}")
    return periods.pop()


def ranked_cmas(rows, period):
    """Only full CMAs of one period; broader areas and provincial parts stay contextual."""
    return sorted(((r["placeId"], r["value"]) for r in rows
                   if r.get("value") is not None and r["period"] == period and r["geo"]["level"] == "cma"
                   and not set(r.get("flags", [])) & {"provincial_value", "regional_value", "national_value", "cma_wide"}),
                  key=lambda pair: -pair[1])


def build(ircc_obs, ircc_info, rates, pops, inc_obs, inc_series, ret_obs, ret_series, ircc_data):
    names = {p["id"]: p["name"] for p in places()}
    wage_rows = [r for r in inc_obs if r["metricId"] == "imm_median_wages_5y"]
    tax_year = one_period(wage_rows)
    cohort = int(tax_year) - 5
    bases = {s.get("dims", {}).get("priceBaseYear") for s in inc_series if s.get("priceBasis") == "constant_dollars"}
    if None in bases or len(bases) != 1:
        raise ValueError("Income insights require a single verified constant-dollar base year")
    price_year = bases.pop()
    y5 = {ck: _pts(inc_series, f"imm_emp_income_canada_{ck}_{cohort}")[5] for ck in CATLABEL}
    if any(value is None for value in y5.values()):
        raise ValueError("The latest five-year cohort has missing category medians; preserve previous analysis")
    history_cohort = 2015  # deliberate historical comparison, not a claimed latest cohort
    history = {ck: _pts(inc_series, f"imm_emp_income_canada_{ck}_{history_cohort}") for ck in CATK}
    common_years = set.intersection(*({t for t, v in values.items() if v is not None} for values in history.values()))
    if len(common_years) < 2:
        raise ValueError("Insufficient comparable history for income growth")
    first, last = min(common_years), max(common_years)
    growth = {ck: (history[ck][last] / history[ck][first] - 1) * 100 for ck in CATK}
    cmas = ranked_cmas(wage_rows, tax_year)
    if not cmas:
        raise ValueError("No comparable full-CMA income observations")
    top, bottom = cmas[:3], cmas[-3:]
    income_source = "statcan-43-10-0030-01"
    income = {
        "id": "immigrant-income", "topic": "immigrant_income",
        "title": f"Five years after admission, income differs by admission category ({cohort} cohort)",
        "question": "What have earlier immigrant cohorts earned, and how do their histories differ?",
        "dek": f"Historical taxfiler medians, {tax_year} tax year, in {price_year} constant dollars. These are not forecasts for a new arrival.",
        "findings": [
            {"id": "income-by-category-yr5", "kind": "observation",
             "headline": f"Median employment income at year five: {money(y5['econ_pa'])} for economic principal applicants and {money(y5['refugee'])} for refugees",
             "detail": f"Canada; admitted {cohort}, observed {tax_year}; taxfilers aged 15+ with employment income; {price_year} constant dollars. " + "; ".join(f"{CATLABEL[k]}: {money(y5[k])}" for k in CATLABEL) + ". Composition, age and employment participation differ across groups.",
             "stat": {"value": y5["econ_pa"], "unit": "CAD_year", "label": f"economic principal applicants, {cohort} cohort, year 5", "period": tax_year},
             "placeIds": [], "sourceIds": [income_source],
             "calc": f"Canada, Median employment income, admission year {cohort}, tax year {tax_year}; no mixing of cohorts."},
            {"id": "income-growth-history", "kind": "calculation",
             "headline": f"Employment income changes between years {first} and {last} for the {history_cohort} cohort",
             "detail": "; ".join(f"{CATLABEL[k]}: {money(history[k][first])} to {money(history[k][last])} ({growth[k]:+.1f}%)" for k in CATK) + f". {price_year} constant dollars; changing taxfiler composition is part of this movement.",
             "placeIds": [], "sourceIds": [income_source],
             "calc": f"(median in {history_cohort + last} / median in {history_cohort + first} - 1) × 100, same {history_cohort} admission cohort, each category separately."},
            {"id": "wages-5y-by-cma", "kind": "observation",
             "headline": f"Median wages at year five range from {money(cmas[-1][1])} to {money(cmas[0][1])} across {len(cmas)} comparable CMAs",
             "detail": f"Admitted {cohort}; tax year {tax_year}; {price_year} constant dollars. Highest: " + "; ".join(f"{names[p]} {money(v)}" for p, v in top) + ". Lowest: " + "; ".join(f"{names[p]} {money(v)}" for p, v in reversed(bottom)) + ". These are full CMAs of residence; provincial values and CMA parts are excluded from this ranking.",
             "stat": {"value": statistics.median(v for _, v in cmas), "unit": "CAD_year", "label": "median of comparable CMA medians", "period": tax_year},
             "placeIds": [p for p, _ in top + bottom], "metricId": "imm_median_wages_5y", "sourceIds": [income_source],
             "calc": f"Median wages, salaries and commissions; admission year {cohort}; tax year {tax_year}; total categories; full-CMA geography only."},
        ],
        "charts": [
            {"id": "income-by-years-since-admission", "type": "line", "title": f"Median employment income — {history_cohort} cohort, Canada", "subtitle": f"{price_year} constant dollars", "unit": "CAD_year", "xLabel": "Years since admission", "yLabel": "Median employment income",
             "series": [{"id": ck, "label": CATLABEL[ck], "points": [{"x": t, "y": v} for t, v in sorted(history[ck].items())]} for ck in CATK], "sourceIds": [income_source]},
            {"id": "wages-5y-cma", "type": "bar_ranked", "title": f"Median wages by CMA — {cohort} cohort in {tax_year}", "subtitle": f"{price_year} constant dollars; same full-CMA geography and methodology", "unit": "CAD_year", "series": [{"id": "wages5y", "label": "Median wages", "points": [{"x": names[p], "y": v, "placeId": p, "f": ["rounded"]} for p, v in cmas]}], "sourceIds": [income_source]},
        ],
        "interpretation": ["Use historical cohorts as context. Their admission categories, occupations and demographic composition differ from those of today's arrivals.", "Local medians are not a forecast of an individual's earnings."],
        "methodology": [f"StatCan table 43-10-0030-01; taxfilers aged 15+; price basis read from the publisher's footnotes: {price_year} constant dollars.", "Years since admission = tax year minus admission year. Admission year itself is not published; medians exclude zero and one-dollar values.", "CMA ranking uses the same observation period and full-CMA geography. Provincial fallbacks and provincial parts remain visible on place pages but are not included here."],
        "limitations": ["Taxfilers who leave Canada or stop filing are not represented; composition changes over time.", "Income combines employment and self-employment in the historical chart; the place comparison uses wages, salaries and commissions.", "No territorial observations; some smaller places only have provincial context."],
        "sourceIds": [income_source], "relatedPlaceIds": [p for p, _ in top + bottom], "computedAt": TODAY,
    }
    latest, prev = ircc_info["latest"], ircc_info["prev"]
    ranked_rates = ranked_cmas(rates, str(latest))
    changes = [r["value"] for r in ircc_obs if r["metricId"] == "imm_pr_admissions_change" and r.get("value") is not None and r["geo"]["level"] == "cma"]
    if not ranked_rates:
        raise ValueError("No comparable full-CMA admissions rates")
    retention_rows = [r for r in ret_obs if r["metricId"] == "imm_retention_5y"]
    ret_year = one_period(retention_rows)
    ret_cohort = int(ret_year) - 5
    province_values = {r["geo"]["name"]: r["value"] for r in retention_rows if r.get("value") is not None and r["period"] == ret_year and r["geo"]["level"] == "province"}
    provinces = sorted(province_values.items(), key=lambda pair: -pair[1])
    if not provinces:
        raise ValueError("No comparable province retention observations")
    first_year, first_month = ircc_info["info"]["first_month"]
    last_year, last_month = ircc_info["info"]["last_month"]
    ids = [p for p, _ in ranked_rates[:3] + ranked_rates[-3:]]
    settlement = {
        "id": "settlement", "topic": "settlement", "title": f"New permanent residents by intended destination in {latest}, and historical provincial retention",
        "question": "Where do new permanent residents intend to settle, and who remains in their intended province?",
        "dek": "Admissions describe the destination at landing; retention describes tax residence years later. They are separate measures.",
        "findings": [
            {"id": "intended-destinations-per-1000", "kind": "calculation", "headline": f"Admissions per 1,000 residents range from {ranked_rates[-1][1]:.1f} to {ranked_rates[0][1]:.1f} among comparable CMAs in {latest}",
             "detail": f"{sum(v < 0 for v in changes)} of {len(changes)} full CMAs with observed changes had fewer admissions than in {prev}. The newest published year covers {ircc_info['ytd']}; partial years are not pooled with full calendar years.", "stat": {"value": ranked_rates[0][1], "unit": "per_1000", "label": f"admissions per 1,000, {names[ranked_rates[0][0]]}", "period": str(latest)}, "placeIds": ids, "metricId": "imm_pr_admissions_per_1000", "sourceIds": ["ircc-pr-cma", "statcan-17-10-0148-01"], "calc": f"IRCC calendar-year {latest} admissions / StatCan July 1 {latest} population × 1,000; matching full-CMA geography. CA and provincial-part values are not ranked together with CMAs."},
            {"id": "provincial-retention-5y", "kind": "observation", "headline": f"Provincial retention five years after admission ranges from {provinces[-1][1]:.0f}% to {provinces[0][1]:.0f}%",
             "detail": f"Admitted {ret_cohort}; tax year {ret_year}. " + "; ".join(f"{p}: {v:.1f}%" for p, v in provinces) + ". These are province-level figures, not city rankings.", "stat": {"value": provinces[-1][1], "unit": "percent", "label": f"lowest provincial retention ({provinces[-1][0]})", "period": ret_year}, "placeIds": [], "metricId": "imm_retention_5y", "sourceIds": ["statcan-43-10-0022-01"], "calc": f"Publisher's Retention rate; admission year {ret_cohort}, tax year {ret_year}; total categories and ages. Stayed / (stayed + out-migrated)."},
        ],
        "charts": [
            {"id": "pr-admissions-per-1000", "type": "bar_ranked", "title": f"Permanent resident admissions per 1,000 — full CMAs, {latest}", "unit": "per_1000", "series": [{"id": "per1000", "label": "Admissions per 1,000", "points": [{"x": names[p], "y": v, "placeId": p, "f": ["rounded"]} for p, v in ranked_rates]}], "sourceIds": ["ircc-pr-cma", "statcan-17-10-0148-01"]},
            {"id": "retention-5y-province", "type": "bar_ranked", "title": f"Provincial retention — {ret_cohort} cohort, {ret_year} tax year", "unit": "percent", "series": [{"id": "ret5", "label": "Retention rate", "points": [{"x": p, "y": v, "f": ["provincial_value", "rounded"]} for p, v in provinces]}], "sourceIds": ["statcan-43-10-0022-01"]},
        ],
        "interpretation": ["A high admissions rate indicates a relatively large intended inflow, not a higher chance of eligibility or employment.", "Retention does not explain why people left and excludes people who moved into the province from another initial destination."],
        "methodology": [f"IRCC workbook coverage: {first_year}-{first_month:02d} to {last_year}-{last_month:02d}; latest complete calendar year {latest}. Values rounded to five; suppressed values remain missing.", f"Retention uses the {ret_cohort} admission cohort in tax year {ret_year}, from StatCan 43-10-0022-01.", "Admissions per 1,000 use matching year and full-CMA July 1 population denominators; CA and CMA-part figures remain contextual."],
        "limitations": ["Intended destination at landing can differ from later residence.", "IRCC publishes no separate Iqaluit row; territorial retention is unavailable.", "Rounding and suppression limit comparisons for small populations."],
        "sourceIds": ["ircc-pr-cma", "statcan-17-10-0148-01", "statcan-43-10-0022-01"], "relatedPlaceIds": ids, "computedAt": TODAY,
    }
    return [income, settlement]
