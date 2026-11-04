"""Labour Force Survey -> observations, series, metrics for work domain."""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.statcan import read_table, source_record  # noqa: E402
from common.contract import geo, obs, load_places  # noqa: E402

T_CMA, T_TERR, T_ER = "14-10-0459-01", "14-10-0292-01", "14-10-0462-01"
SRC = {t: f"statcan-{t}" for t in (T_CMA, T_TERR, T_ER)}
HISTORY_FROM = "2019-01"
CHARS = {"Unemployment rate": "lfs_unemployment_rate", "Employment rate": "lfs_employment_rate",
         "Participation rate": "lfs_participation_rate"}

# place id -> (table, GEO label in table, geo kind)
CMA_NAMES = {
    "toronto": "Toronto, Ontario", "montreal": "Montréal, Quebec", "vancouver": "Vancouver, British Columbia",
    "calgary": "Calgary, Alberta", "edmonton": "Edmonton, Alberta",
    "ottawa": "Ottawa-Gatineau, Ontario part, Ontario/Quebec", "gatineau": "Ottawa-Gatineau, Quebec part, Ontario/Quebec",
    "winnipeg": "Winnipeg, Manitoba", "quebec-city": "Québec, Quebec", "hamilton": "Hamilton, Ontario",
    "kitchener-waterloo": "Kitchener-Cambridge-Waterloo, Ontario", "london": "London, Ontario",
    "halifax": "Halifax, Nova Scotia", "victoria": "Victoria, British Columbia", "saskatoon": "Saskatoon, Saskatchewan",
    "regina": "Regina, Saskatchewan", "st-johns": "St. John's, Newfoundland and Labrador", "windsor": "Windsor, Ontario",
    "kelowna": "Kelowna, British Columbia", "abbotsford-mission": "Abbotsford-Mission, British Columbia",
    "moncton": "Moncton, New Brunswick", "saint-john": "Saint John, New Brunswick",
    "fredericton": "Fredericton, New Brunswick", "sherbrooke": "Sherbrooke, Quebec",
    "sudbury": "Greater Sudbury, Ontario", "thunder-bay": "Thunder Bay, Ontario",
}
PROV_SA = {"charlottetown": ("Prince Edward Island", "PE", "11")}     # province-wide SA from CMA table
TERR = {"whitehorse": ("Yukon", "60"), "yellowknife": ("Northwest Territories", "61"), "iqaluit": ("Nunavut", "62")}
ER_UNADJ = {"brandon": ("Southwest, Manitoba", "4630", "Southwest")}


def metrics(sources_by_metric=None):
    base = dict(category="work", decimals=1, geoLevel="cma", periodType="three_month_avg",
                seasonalAdjustment="seasonally_adjusted", mapLayer=True)
    note = ("CMA and Ottawa/Gatineau part values: Statistics Canada LFS, three-month moving average, seasonally adjusted "
            "(Table 14-10-0459-01). Whitehorse, Yellowknife and Iqaluit show territory-wide values (14-10-0292-01, SA series; "
            "Nunavut's published SA values equal its unadjusted values in every month since 2019, and the Northwest Territories' in about a third of months). Charlottetown shows "
            "Prince Edward Island (province-wide, same table). Brandon shows the Southwest economic region, unadjusted 3-month moving "
            "average (14-10-0462-01) because no seasonally adjusted series exists below the province: do not rank it strictly "
            "against the SA values. LFS estimates for small areas carry large sampling variability.")
    return [
        {**base, "id": "lfs_unemployment_rate", "label": "Unemployment rate (LFS, 3-month average)", "shortLabel": "Unemployment rate",
         "unit": "percent", "higherIs": "worse",
         "description": "Unemployed people as a percentage of the labour force, population aged 15 and over; three-month moving average, seasonally adjusted.",
         "basis": "persons aged 15+, LFS 3-month moving average, seasonally adjusted", "sourceIds": list(SRC.values()), "comparabilityNote": note},
        {**base, "id": "lfs_employment_rate", "label": "Employment rate (LFS, 3-month average)", "shortLabel": "Employment rate",
         "unit": "percent", "higherIs": "better",
         "description": "Employed people as a percentage of the population aged 15 and over; three-month moving average, seasonally adjusted.",
         "basis": "persons aged 15+, LFS 3-month moving average, seasonally adjusted", "sourceIds": list(SRC.values()), "comparabilityNote": note},
        {**base, "id": "lfs_participation_rate", "label": "Participation rate (LFS, 3-month average)", "shortLabel": "Participation rate",
         "unit": "percent", "higherIs": "neutral",
         "description": "Labour force (employed + unemployed) as a percentage of the population aged 15 and over; three-month moving average, seasonally adjusted.",
         "basis": "persons aged 15+, LFS 3-month moving average, seasonally adjusted", "sourceIds": list(SRC.values()), "comparabilityNote": note},
        {**base, "id": "lfs_unemployment_rate_change_1y", "label": "Change in unemployment rate vs a year earlier", "shortLabel": "Unemployment rate, 1-yr change",
         "unit": "pp", "higherIs": "worse", "mapLayer": False,
         "description": "Unemployment rate (3-month moving average) minus the same measure 12 months earlier, in percentage points. Calculated from published rates; the note on each value gives Statistics Canada's standard error of the year-over-year change where published.",
         "basis": "difference of two published 3-month moving averages", "sourceIds": list(SRC.values()), "comparabilityNote": note},
    ]


def _frame(table, filt):
    d = read_table(table, row_filter=filt)
    return d


def build(places=None):
    places = {p["id"]: p for p in (places or load_places())}
    cma = _frame(T_CMA, lambda c: c[(c["Data type"] == "Seasonally adjusted") & c["Labour force characteristics"].isin(list(CHARS) + [])])
    terr = _frame(T_TERR, lambda c: c[(c["Data type"] == "Seasonally adjusted") & (c.Gender == "Total - Gender") & (c["Age group"] == "15 years and over")
                                      & c["Labour force characteristics"].isin(list(CHARS))])
    er = _frame(T_ER, lambda c: c[c.GEO.isin(["Southwest, Manitoba"]) & c["Labour force characteristics"].isin(list(CHARS))])

    def pick(df, geo_name):
        s = df[df.GEO == geo_name]
        est = s[s.Statistics == "Estimate"]
        se = s[s.Statistics == "Standard error of estimate"]
        sey = s[s.Statistics == "Standard error of year-over-year change"]
        return est, se, sey

    observations, series = [], []
    latest_period = max(cma.REF_DATE)
    coverage = {}
    for pid, p in places.items():
        flags_extra, note_extra = [], ""
        if pid in CMA_NAMES:
            df, name, table = cma, CMA_NAMES[pid], T_CMA
            r0 = df[df.GEO == name].iloc[0]
            if pid in ("ottawa", "gatineau"):
                lvl = "cma_part"
                gref = geo(lvl, "35505" if pid == "ottawa" else "24505", name, r0.DGUID, "2021")
                note_extra = "Provincial part of the Ottawa-Gatineau CMA as published by LFS."
            else:
                gref = geo("cma", r0.DGUID[-3:], name.split(",")[0], r0.DGUID, "2021")
            sadj = "seasonally_adjusted"
        elif pid in PROV_SA:
            df, name, table = cma, PROV_SA[pid][0], T_CMA
            r0 = df[df.GEO == name].iloc[0]
            gref = geo("province", PROV_SA[pid][2], name, r0.DGUID)
            flags_extra = ["provincial_value"]
            note_extra = "Province-wide value (Prince Edward Island is a single economic region); Charlottetown is not published separately by the LFS."
            sadj = "seasonally_adjusted"
        elif pid in TERR:
            df, name, table = terr, TERR[pid][0], T_TERR
            r0 = df[df.GEO == name].iloc[0]
            gref = geo("province", TERR[pid][1], name, r0.DGUID)
            flags_extra = ["provincial_value"]
            note_extra = "Territory-wide value; the LFS does not publish the capital separately."
            sadj = "seasonally_adjusted"
        elif pid in ER_UNADJ:
            df, name, table = er, ER_UNADJ[pid][0], T_ER
            r0 = df[df.GEO == name].iloc[0]
            gref = geo("economic_region", ER_UNADJ[pid][1], ER_UNADJ[pid][2], r0.DGUID, "ER 2021")
            flags_extra = ["regional_value"]
            note_extra = "Southwest economic region (Manitoba), UNADJUSTED three-month moving average; not seasonally adjusted, so not strictly comparable with the SA values of other places."
            sadj = "unadjusted"
        else:
            continue
        sid = SRC[table]
        est, se, sey = pick(df, name)
        for ch, mid in CHARS.items():
            s = est[est["Labour force characteristics"] == ch].sort_values("REF_DATE")
            s = s[s.REF_DATE >= HISTORY_FROM]
            vals = {r.REF_DATE: (r.VALUE_NUM, r.STATUS) for r in s.itertuples()}
            if latest_period not in vals:
                observations.append(obs(pid, mid, None, latest_period, gref, sid, ["not_available"] + flags_extra, note_extra))
                continue
            v, st = vals[latest_period]
            sec = se[(se["Labour force characteristics"] == ch) & (se.REF_DATE == latest_period)]
            note = f"Three months ending {latest_period}. " + note_extra
            if len(sec) and not pd.isna(sec.iloc[0].VALUE_NUM):
                note += f" Standard error of estimate: {sec.iloc[0].VALUE_NUM:g} pp."
            observations.append(obs(pid, mid, None if pd.isna(v) else float(v), latest_period, gref, sid, flags_extra, note.strip()))
            if mid == "lfs_unemployment_rate":
                py = f"{int(latest_period[:4]) - 1}{latest_period[4:]}"
                if py in vals and not pd.isna(vals[py][0]) and not pd.isna(v):
                    chg = round(float(v) - float(vals[py][0]), 1)
                    seyc = sey[(sey["Labour force characteristics"] == ch) & (sey.REF_DATE == latest_period)]
                    n = f"{latest_period} minus {py}: {v:g} - {vals[py][0]:g} (both three-month moving averages). " + note_extra
                    if len(seyc) and not pd.isna(seyc.iloc[0].VALUE_NUM):
                        n += f" Standard error of year-over-year change: {seyc.iloc[0].VALUE_NUM:g} pp."
                    observations.append(obs(pid, "lfs_unemployment_rate_change_1y", chg, latest_period, gref, sid, flags_extra, n.strip()))
                else:
                    observations.append(obs(pid, "lfs_unemployment_rate_change_1y", None, latest_period, gref, sid, ["not_available"] + flags_extra))
            if mid in ("lfs_unemployment_rate", "lfs_employment_rate"):
                pts = []
                for t, (vv, stt) in vals.items():
                    pts.append({"t": t, "v": None if (pd.isna(vv)) else float(vv)} if not stt else {"t": t, "v": None, "f": ["suppressed"]})
                series.append({"id": f"{mid}:{pid}", "label": f"{'Unemployment' if mid.endswith('unemployment_rate') else 'Employment'} rate, {name}",
                               "unit": "percent", "placeId": pid, "metricId": mid, "geo": gref, "sourceId": sid,
                               "seasonalAdjustment": sadj, "points": pts})
        coverage[pid] = (name, table)
    return observations, series, latest_period, coverage


def sources():
    out = []
    for t, tr in [(T_CMA, ["Selected seasonally adjusted rows for the places' CMAs, Ottawa-Gatineau Ontario/Quebec parts and Prince Edward Island; unemployment, employment and participation rates (Estimate) plus standard errors."]),
                  (T_TERR, ["Seasonally adjusted rows, Total gender, age 15+, for Yukon, Northwest Territories, Nunavut."]),
                  (T_ER, ["Southwest, Manitoba economic region only (Brandon); unadjusted 3-month moving average."])]:
        r = source_record(t, transformations=tr + ["1-year change = rate(t) - rate(t-12 months), percentage points; monthly series since 2019-01 kept as published."],
                          notes=["Rates are three-month moving averages: each month's value is the average of that month and the two before it, so month-to-month changes are smoothed and overlap."])
        out.append(r)
    return out
