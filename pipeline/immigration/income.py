"""Immigrant taxfiler outcomes from StatCan 43-10-0030-01 (IMDB): income by admission category / years since admission,
and the place-level metric imm_median_wages_5y."""
from __future__ import annotations

import pandas as pd

import taxfilers
from common.contract import obs
from common.statcan import flags_for, clean_value
from common_i import TAX_GEO, PROV_NAME, PROV_CODE, place_geo, places, geo

SID = "statcan-43-10-0030-01"
CATS = {  # series key -> (table member, label)
    "econ_pa": ("Economic Immigrant, principal applicant", "Economic immigrants, principal applicants"),
    "econ_dep": ("Economic Immigrant, spouse and dependent", "Economic immigrants, spouses and dependants"),
    "family": ("Immigrants sponsored by family", "Immigrants sponsored by family"),
    "refugee": ("Refugee", "Refugees"),
    "all": ("Total, immigrant admission category", "All admission categories"),
}
COHORTS = [2010, 2015, 2018]
WAGE_COHORT, WAGE_TAXYEAR = 2018, 2023          # 5 years since admission in the latest tax year (2023)
TAX_NAME_TO_PROV = {v: k for k, v in PROV_NAME.items()}


def _cell(df_idx, geo_name, cat, stat, adm, tax):
    r = df_idx.get((geo_name, cat, stat, f"{adm}, admission year", str(tax)))
    if r is None:
        return None, ["not_available"], None
    v = clean_value(r["VALUE_NUM"], r["STATUS"])
    fl = flags_for(r["STATUS"], r["SYMBOL"]) or []
    if v is not None:
        fl = fl + ["rounded"]
    return v, fl, r


def index(df):
    return {(r.GEO, r["Immigrant admission category"], r.Statistics, r["Admission year"], r.REF_DATE): r
            for _, r in df.iterrows()}


def build():
    df = taxfilers.read_filtered()
    idx = index(df)
    ca_geo = geo("country", "11124", "Canada", dguid="2021A000011124")
    series, obs_out, gaps = [], [], []
    for ck, (member, label) in CATS.items():
        for c in COHORTS:
            pts = []
            for tax in range(c + 1, min(2024, c + 11)):
                v, fl, r = _cell(idx, "Canada", member, "Median employment income", c, tax)
                p = {"t": str(tax - c), "v": v}
                if fl:
                    p["f"] = fl
                pts.append(p)
            series.append({
                "id": f"imm_emp_income_canada_{ck}_{c}", "label": f"Median employment income by years since admission - {label}, admitted {c}, Canada",
                "unit": "CAD_year", "geo": ca_geo, "sourceId": SID, "priceBasis": "constant_dollars",
                "dims": {"category": label, "admissionYear": str(c), "xAxis": "years since admission (tax year minus admission year)",
                         "statistic": "Median employment income", "population": "immigrant taxfilers aged 15+ residing in Canada",
                         "priceBaseYear": "2023"},
                "points": pts})
    # place-level 5-year median wages (2018 admission cohort, tax year 2023, total categories)
    for pi in places():
        pid = pi["id"]
        name = TAX_GEO.get(pid)
        pg = place_geo(pi)
        base = ("Median wages, salaries and commissions of immigrant taxfilers aged 15+ admitted in 2018, observed in the 2023 tax year "
                "(5 years after admission), all admission categories, both sexes, 2023 constant dollars. Geography is the postal code of residence "
                "when filing (current residence, not intended destination). Values with 0 or 1 dollars excluded from the median.")
        if name is not None:
            v, fl, r = _cell(idx, name, CATS["all"][0], "Median wages, salaries and commissions", WAGE_COHORT, WAGE_TAXYEAR)
            n, _, _ = _cell(idx, name, CATS["all"][0], "Total number of residents", WAGE_COHORT, WAGE_TAXYEAR)
            note = base + (f" Cohort size in 2023: {n:,.0f} taxfilers." if n else "")
            if pi["part"]:
                note += " Ottawa - Gatineau part published separately."
            obs_out.append(obs(pid, "imm_median_wages_5y", v, str(WAGE_TAXYEAR), pg, SID, fl, note))
        else:
            prov = pi["province"]
            pname = PROV_NAME[prov]
            if pname in {g for (g, *_) in idx}:
                v, fl, r = _cell(idx, pname, CATS["all"][0], "Median wages, salaries and commissions", WAGE_COHORT, WAGE_TAXYEAR)
                obs_out.append(obs(pid, "imm_median_wages_5y", v, str(WAGE_TAXYEAR), geo("province", PROV_CODE[prov], pname, vintage="2021"), SID,
                                   fl + ["provincial_value"],
                                   base + f" Table has no value for the {pi['name']} census agglomeration; this is the provincial value ({pname})."))
            else:
                gaps.append((pid, f"43-10-0030-01 has no territorial or {pi['name']} geography"))
                obs_out.append(obs(pid, "imm_median_wages_5y", None, str(WAGE_TAXYEAR), pg or geo("province", PROV_CODE[pi["province"]], PROV_NAME[pi["province"]]), SID,
                                   ["not_available"], "Table 43-10-0030-01 covers Canada, the ten provinces and CMAs only; no territories."))
    # provincial series for wages by years since admission (2018 cohort, all categories) for context
    for prov, pname in PROV_NAME.items():
        if (pname) not in {g for (g, *_) in idx}:
            continue
        pts = []
        for tax in range(2019, 2024):
            v, fl, r = _cell(idx, pname, CATS["all"][0], "Median wages, salaries and commissions", 2018, tax)
            p = {"t": str(tax - 2018), "v": v}
            if fl:
                p["f"] = fl
            pts.append(p)
        series.append({"id": f"imm_wages_province_{prov.lower()}_2018", "label": f"Median wages by years since admission - 2018 admission cohort, all categories, {pname}",
                       "unit": "CAD_year", "geo": geo("province", PROV_CODE[prov], pname, vintage="2021"), "sourceId": SID, "priceBasis": "constant_dollars",
                       "dims": {"admissionYear": "2018", "xAxis": "years since admission", "statistic": "Median wages, salaries and commissions", "priceBaseYear": "2023"},
                       "points": pts})
    return obs_out, series, gaps, idx
