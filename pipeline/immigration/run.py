"""Rebuild every immigration output (PR admissions, taxfiler outcomes, retention, program directory, insights).

Run from the repo root:   python3 -I pipeline/immigration/run.py
Refresh from the network: NORTHWARD_REFRESH=1 python3 -I pipeline/immigration/run.py
Writes data/processed/immigration/{sources,metrics,observations,series,insights,programs}.json

The two StatCan taxfiler tables (43-10-0030-01 ~16 GB, 43-10-0022-01 ~20 GB uncompressed) are streamed from their cached zips
into small filtered extracts in data/raw/statcan_tables/<pid>/filtered_northward.csv (never extracted in full).
"""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

from common.contract import write_processed  # noqa: E402
from common.fetch import fetch_json, meta_for, now_iso  # noqa: E402
from common.statcan import source_record, full_table_csv  # noqa: E402
import ircc, income, retention, programs, insights, pop  # noqa: E402
from common_i import TODAY  # noqa: E402

DOMAIN = "immigration"


def metric(id, label, short, unit, decimals, higher, desc, basis, geolvl, ptype, sids, *, price=None, map_layer=False, note=None, dims=None):
    m = {"id": id, "label": label, "shortLabel": short, "category": "immigration", "unit": unit, "decimals": decimals, "higherIs": higher,
         "description": desc, "basis": basis, "geoLevel": geolvl, "periodType": ptype, "sourceIds": sids, "mapLayer": map_layer}
    if price:
        m["priceBasis"], m["priceBaseYear"] = "constant_dollars", price
    if note:
        m["comparabilityNote"] = note
    if dims:
        m["dims"] = dims
    return m


def metrics(latest: int) -> list[dict]:
    return [
        metric("imm_pr_admissions", f"New permanent residents by intended destination, {latest}", "PR admissions", "persons", 0, "neutral",
               f"Number of people granted permanent resident status in the calendar year whose intended destination at landing was this CMA/CA (or Ottawa-Gatineau part). Rounded to the nearest 5 by IRCC; counts of 0-5 are suppressed. Not current residence.",
               "IRCC admissions, calendar year, CMA/CA of intended destination", "cma", "year", ["ircc-pr-cma"], map_layer=True,
               note="Ottawa and Gatineau are the Ontario and Quebec parts of the CMA. IRCC publishes Nunavut only as 'Other - Nunavut', so Iqaluit has no value.", dims={"family": "imm_pr_admissions"}),
        metric("imm_pr_admissions_change", "Change in new permanent residents vs previous year", "PR admissions, 1-yr change", "percent", 1, "neutral",
               "Percent change in calendar-year permanent resident admissions (intended destination) from the previous calendar year; computed from IRCC values rounded to the nearest 5.",
               "(admissions this year / previous year - 1) x 100", "cma", "year", ["ircc-pr-cma"], note="Imprecise for small places because of rounding and suppression."),
        metric("imm_pr_admissions_per_1000", "New permanent residents per 1,000 residents", "PR admissions per 1,000", "per_1000", 1, "neutral",
               "Calendar-year permanent resident admissions by intended destination per 1,000 residents (StatCan July 1 population estimate for the same year and geography; persons per 1,000 residents).",
               "IRCC admissions / StatCan 17-10-0148-01 July 1 population x 1000", "cma", "year", ["ircc-pr-cma", "statcan-17-10-0148-01"], map_layer=True,
               note="Numerator is intended destination at landing, denominator is all residents; not a measure of immigrant share."),
        metric("imm_retention_5y", "Immigrant retention in intended province, 5 years after admission", "5-year retention (province)", "percent", 1, "neutral",
               "Of immigrant taxfilers admitted in 2018 whose intended destination was this province, the share still filing tax there in 2023: stayed / (stayed + out-migrated). Province value shown for each place in the province (flagged provincial_value).",
               "IMDB tax-record residence (postal code), taxfilers aged 15+, all admission categories, both sexes, 2018 cohort", "province", "year", ["statcan-43-10-0022-01"], map_layer=True,
               note="Province-level; does not count people who moved in from elsewhere. No values for territories."),
        metric("imm_retention_cma_5y", "Immigrant retention in intended CMA, 5 years after admission", "5-year retention (CMA)", "percent", 1, "neutral",
               "Of immigrant taxfilers admitted in 2018 whose intended destination was this CMA, the share still filing tax in the same CMA in 2023: stayed / (stayed + out-migrated).",
               "IMDB tax-record residence, taxfilers aged 15+, all admission categories, 2018 cohort", "cma", "year", ["statcan-43-10-0022-01"],
               note="CMAs only; no census agglomerations or territories. Fredericton has no value because the CMA is new in the 2021 geography."),
        metric("imm_median_wages_5y", "Median wages of immigrants five years after admission (2018 cohort)", "Immigrant median wages, year 5", "CAD_year", 0, "better",
               "Median wages, salaries and commissions of immigrant taxfilers aged 15+ admitted in 2018, in the 2023 tax year (5 years after admission), all admission categories, both sexes. Values of 0 and 1 dollars excluded from medians.",
               "2023 constant dollars; geography is residence (postal code) when filing; provincial value (provincial_value) where no CMA value exists", "cma", "year", ["statcan-43-10-0030-01"], price="2023", map_layer=True,
               note="Composition of the cohort differs by place (admission category, age, occupations). Not a forecast for a new arrival. No territories in the table."),
    ]


def main() -> None:
    # ---------------- IRCC
    i_obs, i_series, i_gaps, ctx = ircc.build()
    latest = ctx["latest"]
    r_obs, r_gaps, pops = ircc.per_1000(i_obs, latest)
    pdf = pop.read_filtered()
    crow = pdf[(pdf.GEO == "Canada") & (pdf.REF_DATE == str(latest))]
    pops["__canada__"] = float(crow.iloc[0]["VALUE_NUM"]) if len(crow) else None
    # ---------------- StatCan outcomes
    inc_obs, inc_series, inc_gaps, _ = income.build()
    ret_obs, ret_series, ret_gaps, _ = retention.build()
    observations = i_obs + r_obs + inc_obs + ret_obs
    series = i_series + inc_series + ret_series
    # ---------------- sources
    info = ctx["info"]
    meta = info["meta"]
    src_ircc = {
        "id": "ircc-pr-cma", "title": "Permanent Residents - Monthly IRCC Updates: Canada - Admissions of Permanent Residents by Province/Territory and Census Metropolitan Area of Intended Destination",
        "publisher": "Immigration, Refugees and Citizenship Canada (IRCC)", "tableId": "open.canada.ca dataset f7e5498e-0ad8-4417-85c9-9b8aff9b9eda; resource EN_ODP-PR-CMA.xlsx (81021dfd-c110-42cf-a975-1b9be8b82980)",
        "url": ircc.LANDING, "downloadUrl": ircc.URL, "releaseDate": "2026-10-20", "retrievedAt": meta.get("retrievedAt") or now_iso(),
        "referencePeriod": f"January 2015 to August 2026 (monthly); annual totals 2015-{latest}; year-to-date {ctx['ytd']}",
        "licence": "Open Government Licence - Canada", "attribution": "Contains information licensed under the Open Government Licence - Canada. Source: IRCC, Permanent Residents - Monthly IRCC Updates.",
        "transformations": [f"Read the XLSX (not the CSV, which IRCC labels 'rounded - not for calculations'); took each row's calendar-year Total column (annual totals) and the 2026 year-to-date total (January-August).",
                            "IRCC rounds every value to the nearest 5 and shows 0-5 as '--' (kept as null + suppressed flag); all values carry the 'rounded' flag. Calendar-year totals are published values and may not equal the sum of monthly cells.",
                            "Rows are 'CMA' per IRCC, which includes some census agglomerations (Charlottetown, Brandon, Whitehorse, Yellowknife are present). Ottawa - Gatineau is published as Ontario part and Quebec part and used as such.",
                            f"Change = (latest-year / previous-year - 1) x 100 on rounded values; per-1,000 = admissions / StatCan July 1 population x 1000."],
        "notes": ["Admissions are by intended destination at landing, not current residence.", "Dataset metadata last modified 2026-10-20; file last-modified header " + str(meta.get("lastModified")) + ".",
                  "Iqaluit: IRCC publishes Nunavut only as 'Other - Nunavut', so no Iqaluit value is available."], "status": "ok"}
    srcs = [src_ircc]
    srcs.append(source_record("17-10-0148-01", reference_period="July 1, 2001 to 2025 (annual); 2025 used", transformations=[
        "Kept Gender='Total - gender' and Age group='All ages'; matched each place by DGUID suffix to its CMA/CA code (Ottawa and Gatineau by their Ontario/Quebec part).",
        "Used as the denominator for admissions per 1,000 (same calendar year, July 1 estimate)."],
        notes=["Population estimates on 2021 boundaries; may be revised."]))
    srcs.append(source_record("43-10-0030-01", reference_period="Tax years 2009-2023; admission years 2008-2022", transformations=[
        "Streamed the ~16 GB full-table CSV and kept Sex='Total, sex', Pre-admission experience='Total', Knowledge of official languages='Total' and Statistics in {Total number of residents, Median employment income, Median wages salaries and commissions} for Canada, provinces and our CMAs (data/raw/statcan_tables/43100030/filtered_northward.csv).",
        "Years since admission = tax year (REF_DATE) minus admission year; the admission-year-equals-tax-year cell is not published.",
        "imm_median_wages_5y = Median wages, salaries and commissions, admission year 2018, tax year 2023, category total; Charlottetown and Brandon use the provincial value (flagged provincial_value); territories have no data.",
        "Values rounded by StatCan (flag rounded); '..' -> null + not_available."],
        notes=["Population: immigrant taxfilers aged 15 and older residing in Canada (IMDB: IRCC landing records linked to tax files). Income in 2023 constant dollars; values zero and one excluded from medians. Geography = postal code on the tax return (may differ from province of taxation).",
               "Admission year = year of first landing/PR status, which may differ from arrival year."]))
    srcs.append(source_record("43-10-0022-01", reference_period="Tax years 2007-2023; admission years 2007-2023", transformations=[
        "Streamed the ~20 GB full-table CSV from the zip (not extracted) and kept Age group='Total, age group', Pre-admission experience='Total', Knowledge of official languages='Total' for Canada, provinces and our CMAs (data/raw/statcan_tables/43100022/filtered_northward.csv).",
        "Used Statistics='Retention rate' (percent) for admission year 2018 in tax year 2023 (5 years after admission), category total; province values flagged provincial_value on place observations; CMA values as imm_retention_cma_5y.",
        "Series: retention by years since admission for the 2015 cohort (tax years 2016-2023)."],
        notes=["'Retention rate represents the percentage of immigrant taxfilers continuing their residence in the geographical area (province or CMA) of intended destination ... This does not take into account immigrants migrating in from another destination.' (table note 11). Retention = stayed / (stayed + out migration).",
               "Table covers Canada, provinces and CMAs; no territories or census agglomerations."]))
    srcs += programs.sources(now_iso())
    # ---------------- programs / insights
    progs = programs.build()
    ins = insights.build(i_obs, ctx, r_obs, pops, inc_obs, inc_series, ret_obs, ret_series, ctx["data"])
    for name, data in [("sources", srcs), ("metrics", metrics(latest)), ("observations", observations), ("series", series),
                       ("insights", ins), ("programs", progs)]:
        p = write_processed(DOMAIN, name, data)
        print(f"wrote {p.relative_to(HERE.parents[1])} ({len(data)} records)")
    gaps = i_gaps + r_gaps + inc_gaps + ret_gaps
    print("coverage gaps:")
    for g in sorted(set(gaps)):
        print("  ", g)


if __name__ == "__main__":
    main()
