"""Retention of immigrant taxfilers in their intended province / CMA of destination, from StatCan 43-10-0022-01."""
from __future__ import annotations

import mobility
from common.contract import obs
from common.statcan import flags_for, clean_value
from common_i import TAX_GEO, PROV_NAME, PROV_CODE, place_geo, places, geo

SID = "statcan-43-10-0022-01"
COHORT, TAXYEAR = 2018, 2023     # 5 years after admission in the latest tax year
TOT = "Total, immigrant admission category"
NOTE = ("Share of immigrant taxfilers (aged 15+, admitted in 2018, all admission categories, both sexes) who file tax in 2023 (5 years after admission) in "
        "the {what} of their intended destination at landing: stayed / (stayed + out-migrated). Does not count people who moved in from elsewhere. "
        "Residence = postal code on the tax return.")


def index(df):
    d = df[(df["Immigrant admission category"] == TOT)]
    return {(r.GEO, r.Statistics, r["Admission year"], r.REF_DATE): r for _, r in d.iterrows()}


def cell(idx, g, stat, adm, tax):
    r = idx.get((g, stat, f"{adm}, admission year", str(tax)))
    if r is None:
        return None, ["not_available"], None
    v = clean_value(r["VALUE_NUM"], r["STATUS"])
    fl = flags_for(r["STATUS"], r["SYMBOL"])
    if v is None and not fl:
        fl = ["not_available"]
    if v is not None:
        fl = fl + ["rounded"]
    return v, fl, r


def build():
    df = mobility.read_filtered()
    idx = index(df)
    have = {k[0] for k in idx}
    out, series, gaps = [], [], []
    for pi in places():
        pid, prov = pi["id"], pi["province"]
        pname = PROV_NAME[prov]
        pgeo = geo("province", PROV_CODE[prov], pname, dguid=f"2021A0002{PROV_CODE[prov]}", vintage="2021")
        # provincial retention (all places)
        if pname in have:
            v, fl, r = cell(idx, pname, "Retention rate", COHORT, TAXYEAR)
            st, _, _ = cell(idx, pname, "Stayed in intended geography", COHORT, TAXYEAR)
            ot, _, _ = cell(idx, pname, "Out migration", COHORT, TAXYEAR)
            note = NOTE.format(what="province or territory") + (f" Counts (rounded): {st:,.0f} stayed, {ot:,.0f} out-migrated." if st is not None and ot is not None else "")
            out.append(obs(pid, "imm_retention_5y", v, str(TAXYEAR), pgeo, SID, fl + ["provincial_value"], note))
        else:
            gaps.append((pid, f"43-10-0022-01 has no {pname} (territories are not in the table)"))
            out.append(obs(pid, "imm_retention_5y", None, str(TAXYEAR), pgeo, SID, ["not_available", "provincial_value"],
                           f"Table 43-10-0022-01 covers Canada, the ten provinces and CMAs only; no value for {pname}."))
        # CMA retention
        name = TAX_GEO.get(pid)
        if name:
            v, fl, r = cell(idx, name, "Retention rate", COHORT, TAXYEAR)
            st, _, _ = cell(idx, name, "Stayed in intended geography", COHORT, TAXYEAR)
            ot, _, _ = cell(idx, name, "Out migration", COHORT, TAXYEAR)
            note = NOTE.format(what="census metropolitan area (CMA)")
            if st is not None and ot is not None:
                note += f" Counts (rounded): {st:,.0f} stayed, {ot:,.0f} out-migrated."
            if v is None and st == 0 and ot == 0:
                note += " StatCan shows no immigrants with this CMA as intended destination (CMA created with 2021 boundaries), so no rate exists."
            if pi["part"]:
                note += " Ottawa - Gatineau part published separately."
            out.append(obs(pid, "imm_retention_cma_5y", v, str(TAXYEAR), place_geo(pi), SID, fl, note))
        else:
            out.append(obs(pid, "imm_retention_cma_5y", None, str(TAXYEAR), place_geo(pi) or pgeo, SID, ["not_available"],
                           "Table 43-10-0022-01 publishes CMAs (and provinces) only; this census agglomeration or territory has no value."))
    # series: retention by years since admission per province, 2015 cohort; Canada too
    for g, code in [("Canada", None)] + [(n, p) for p, n in PROV_NAME.items() if n in have]:
        pts = []
        for tax in range(2016, 2024):
            v, fl, r = cell(idx, g, "Retention rate", 2015, tax)
            p = {"t": str(tax - 2015), "v": v}
            if fl:
                p["f"] = fl
            pts.append(p)
        gref = geo("country", "11124", "Canada", dguid="2021A000011124") if code is None else geo("province", PROV_CODE[code], g, dguid=f"2021A0002{PROV_CODE[code]}", vintage="2021")
        series.append({"id": f"imm_retention_{(code or 'ca').lower()}_2015", "label": f"Retention in intended destination by years since admission - 2015 admission cohort, {g}",
                       "unit": "percent", "geo": gref, "sourceId": SID,
                       "dims": {"admissionYear": "2015", "xAxis": "years since admission (tax year minus admission year)", "statistic": "Retention rate",
                                "category": "all admission categories"}, "points": pts})
    return out, series, gaps, idx
