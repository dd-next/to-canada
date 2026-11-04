"""Consumer Price Index (StatCan 18-10-0004-01): 12-month change in the rent index and all-items.

CPI is a *price-change* measure (index, 2002=100); it says nothing about price levels. StatCan publishes it for
Canada, provinces and selected cities only; places without a city CPI get their province's value, flagged provincial_value.
City-level sub-index for rent is 'Rented accommodation' (rent + tenants' insurance and related); a stand-alone
'Rent' index is published only for Canada and provinces, so 'Rented accommodation' is used for every geography.
"""
from __future__ import annotations

from common_h import places
from common.contract import geo, obs
from common.statcan import read_table

TABLE = "18-10-0004-01"
SID = f"statcan-{TABLE}"
RENT = "Rented accommodation"
ALL = "All-items"

# place -> published GEO label of the city/territorial-capital CPI series (None = use province)
CITY = {
    "toronto": "Toronto, Ontario", "montreal": "Montréal, Quebec", "vancouver": "Vancouver, British Columbia",
    "calgary": "Calgary, Alberta", "edmonton": "Edmonton, Alberta", "ottawa": "Ottawa-Gatineau, Ontario part, Ontario/Quebec",
    "winnipeg": "Winnipeg, Manitoba", "quebec-city": "Québec, Quebec", "halifax": "Halifax, Nova Scotia",
    "victoria": "Victoria, British Columbia", "saskatoon": "Saskatoon, Saskatchewan", "regina": "Regina, Saskatchewan",
    "st-johns": "St. John's, Newfoundland and Labrador", "saint-john": "Saint John, New Brunswick",
    "thunder-bay": "Thunder Bay, Ontario", "charlottetown": "Charlottetown and Summerside, Prince Edward Island",
    "whitehorse": "Whitehorse, Yukon", "yellowknife": "Yellowknife, Northwest Territories", "iqaluit": "Iqaluit, Nunavut",
}
PROV = {"ON": "Ontario", "QC": "Quebec", "BC": "British Columbia", "AB": "Alberta", "MB": "Manitoba", "SK": "Saskatchewan",
        "NS": "Nova Scotia", "NB": "New Brunswick", "NL": "Newfoundland and Labrador", "PE": "Prince Edward Island"}
PROV_CODE = {"ON": "35", "QC": "24", "BC": "59", "AB": "48", "MB": "46", "SK": "47", "NS": "12", "NB": "13", "NL": "10", "PE": "11"}


def load():
    df = read_table(TABLE, usecols=["REF_DATE", "GEO", "DGUID", "Products and product groups", "VALUE", "STATUS", "SYMBOL"],
                    row_filter=lambda c: c[c["Products and product groups"].isin([RENT, ALL]) & (c.REF_DATE >= "2017-12")])
    idx = {}
    for r in df.itertuples(index=False):
        if r.VALUE_NUM == r.VALUE_NUM:
            idx[(r.GEO, r[3], r.REF_DATE)] = r.VALUE_NUM
    dguid = dict(zip(df.GEO, df.DGUID))
    return idx, dguid, sorted(df.REF_DATE.unique())


def _prev(ref, months):
    y, m = int(ref[:4]), int(ref[5:])
    t = y * 12 + (m - 1) - months
    return f"{t // 12:04d}-{t % 12 + 1:02d}"


def pct(idx, g, prod, ref):
    a, b = idx.get((g, prod, ref)), idx.get((g, prod, _prev(ref, 12)))
    return None if a is None or b is None else round((a / b - 1) * 100, 1)


def build():
    idx, dguid, refs = load()
    latest = refs[-1]
    out_obs, out_series, cov = [], [], {}
    for pl in places():
        city = CITY.get(pl["id"])
        if city:
            geo_label, provincial = city, False
        else:
            geo_label, provincial = PROV[pl["province"]], True
        d = dguid.get(geo_label) or None
        if provincial:
            gref = geo("province", PROV_CODE[pl["province"]], geo_label, d, "2016")
        elif pl["id"] == "charlottetown":
            gref = geo("ca", "charlottetown-summerside", geo_label, None, None)
        elif pl["id"] in ("whitehorse", "yellowknife", "iqaluit"):
            gref = geo("csd", (d or "")[-7:], geo_label, d, "2011")
        elif pl["id"] == "ottawa":
            gref = geo("cma_part", "35505", geo_label, d, "2011")
        else:
            gref = geo("cma", (d or "")[-3:], geo_label, d, "2011")
        cov[pl["id"]] = geo_label + (" (provincial)" if provincial else "")
        for prod, mid, label in ((RENT, "cpi_rent_change_1y", "Rented accommodation"), (ALL, "cpi_all_items_change_1y", "All-items")):
            v = pct(idx, geo_label, prod, latest)
            fl, note = [], f"12-month change of the {label} CPI (2002=100) for {geo_label}, {latest} vs {_prev(latest, 12)}."
            if provincial:
                fl.append("provincial_value")
                note += " No city CPI is published for this place; this is the province's value."
            elif pl["id"] == "charlottetown":
                fl.append("regional_value")
                note += " Published for Charlottetown and Summerside combined."
            if prod == RENT and v is None:
                note += " Rented accommodation CPI is not published for this geography."
            out_obs.append(obs(pl["id"], mid, v, latest, gref, SID, fl if v is not None or fl else [], note))
            pts = []
            for ref in refs:
                if ref < "2019-01":
                    continue
                pts.append({"t": ref, "v": pct(idx, geo_label, prod, ref)})
            if any(p["v"] is not None for p in pts):
                out_series.append({"id": f"{mid}_{pl['id']}", "label": f"{label} CPI, 12-month % change - {geo_label}",
                                   "unit": "percent", "placeId": pl["id"], "metricId": mid, "geo": gref, "sourceId": SID,
                                   "seasonalAdjustment": "unadjusted", "dims": {"family": mid},
                                   "points": pts})
    return out_obs, out_series, cov, {"latest": latest, "idx": idx}


def metric_defs():
    base = dict(category="housing", unit="percent", decimals=1, higherIs="worse", geoLevel="cma", periodType="month",
                seasonalAdjustment="unadjusted", sourceIds=[SID], mapLayer=False,
                comparabilityNote="CPI measures price change over time, not price levels: do not use it to rank which place is cheaper. "
                                  "Published for provinces and selected cities only; other places show their province's value (flagged provincial_value).")
    return [
        {**base, "id": "cpi_rent_change_1y", "label": "Rent price change, 12 months (CPI rented accommodation)",
         "shortLabel": "Rent CPI, 1y change", "mapLayer": True,
         "description": "12-month percentage change in the Consumer Price Index for rented accommodation (rent and closely related tenant costs) "
                        "- how fast rents already being paid by tenants are rising. City series where StatCan publishes one, otherwise provincial.",
         "basis": "CPI (2002=100), not seasonally adjusted, price change not price level", "dims": {"family": "cpi_rent"}},
        {**base, "id": "cpi_all_items_change_1y", "label": "All-items inflation, 12 months (CPI)", "shortLabel": "CPI all-items, 1y change",
         "description": "12-month percentage change in the all-items Consumer Price Index. Not a cost-of-living index.",
         "basis": "CPI (2002=100), not seasonally adjusted", "dims": {"family": "cpi_all_items"}},
    ]
