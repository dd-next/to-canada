"""StatCan 46-10-0092-01: asking and paid rents (experimental) -> observations + series."""
from __future__ import annotations

import pandas as pd

from common_h import places, quarter_label, statcan_geo_key
from common.contract import geo, obs
from common.statcan import clean_value, flags_for, read_table

TABLE = "46-10-0092-01"
SID = f"statcan-{TABLE}"
ASKING = "Average asking rent"
PAID = "Average paid rent"
UNIT_TYPES = {  # contract unitType -> table member (apartments only; houses/rooms are not in the unit-type controls)
    "Studio": "Apartment - No bedroom",
    "1 bedroom": "Apartment - 1 bedroom",
    "2 bedroom": "Apartment - 2 bedrooms",
    "3 bedroom+": "Apartment - 3 or more bedrooms",
}
METRIC_IDS = {"Studio": "studio", "1 bedroom": "1br", "2 bedroom": "2br", "3 bedroom+": "3br"}


def load() -> pd.DataFrame:
    df = read_table(TABLE)
    df["Q"] = df["REF_DATE"].map(quarter_label)
    return df


def _lookup(df):
    """dict[(dguid, est, member, ref_date)] -> (value, status, symbol)"""
    d = {}
    for r in df.itertuples(index=False):
        d[(r.DGUID, r.Estimates, getattr(r, "_3"), r.REF_DATE)] = (r.VALUE_NUM, r.STATUS, r.SYMBOL)
    return d


def build():
    df = load()
    df = df.rename(columns={"Rental unit type": "unit"})
    lk = {(r.DGUID, r.Estimates, r.unit, r.REF_DATE): (r.VALUE_NUM, r.STATUS, r.SYMBOL) for r in df.itertuples(index=False)}
    refs = sorted(df.REF_DATE.unique())
    latest, prev_year = refs[-1], refs[-5]
    since_2019 = refs[0]
    # "all CMAs" benchmark
    out_obs, out_series, cov = [], [], {}
    per_place_vals = {}
    dguids = set(df.DGUID)
    for pl in places():
        dg, gref = statcan_geo_key(pl)
        if dg is None:
            cov[pl["id"]] = "no CMA/CA geography in place record (not covered by this table)"
            continue
        if dg not in dguids:
            cov[pl["id"]] = f"{gref['name']} ({gref['level'].upper()}) is not a geography in {TABLE} (CMAs only)"
            for ut, mid in METRIC_IDS.items():
                out_obs.append(obs(pl["id"], f"rent_asking_{mid}", None, quarter_label(latest), gref, SID,
                                   ["not_available"], "Geography not published in StatCan 46-10-0092-01 (CMAs only)."))
            continue
        cov[pl["id"]] = "covered"
        for ut, member in UNIT_TYPES.items():
            mid = METRIC_IDS[ut]
            v, st, sy = lk.get((dg, ASKING, member, latest), (float("nan"), "..", ""))
            fl = flags_for(st, sy)
            if pl["part"]:
                pass  # part-level value published; no cma_wide flag needed
            out_obs.append(obs(pl["id"], f"rent_asking_{mid}", clean_value(v, st), quarter_label(latest), gref, SID, fl))
            per_place_vals[(pl["id"], mid)] = clean_value(v, st)
            if ut in ("1 bedroom", "2 bedroom"):
                # 1y percentage change
                v0, st0, _ = lk.get((dg, ASKING, member, prev_year), (float("nan"), "..", ""))
                a, b = clean_value(v, st), clean_value(v0, st0)
                if ut == "1 bedroom":
                    chg = round((a / b - 1) * 100, 1) if a is not None and b else None
                    # The year-earlier quarter (2025-Q2) is flagged by StatCan "use with caution" (one listing platform
                    # missing; modelled estimates), so every 1y change inherits the caution flag.
                    cfl = ["use_with_caution"]
                    out_obs.append(obs(pl["id"], "rent_asking_1br_change_1y", chg, quarter_label(latest), gref, SID, cfl,
                                       f"(asking rent {quarter_label(latest)} / {quarter_label(prev_year)} - 1) x 100; computed from published rounded values."))
                # paid rents (only 1 and 2 bedroom apartments are published)
                vp, stp, syp = lk.get((dg, PAID, member, latest), (float("nan"), "..", ""))
                out_obs.append(obs(pl["id"], f"rent_paid_{mid}", clean_value(vp, stp), quarter_label(latest), gref, SID,
                                   flags_for(stp, syp), "Average paid rent is a moving average of the last three quarters."))
                # series
                for est, key in ((ASKING, "rent_asking"), (PAID, "rent_paid")):
                    pts = []
                    for rd in refs:
                        vv, ss, sy2 = lk.get((dg, est, member, rd), (float("nan"), "..", ""))
                        f = flags_for(ss, sy2)
                        pts.append({"t": quarter_label(rd), "v": clean_value(vv, ss), **({"f": f} if f else {})})
                    if any(p["v"] is not None for p in pts):
                        out_series.append({
                            "id": f"{key}_{mid}_{pl['id']}",
                            "label": f"{'Average asking rent' if est == ASKING else 'Average paid rent'}, {ut} apartment - {gref['name']}",
                            "unit": "CAD_month", "placeId": pl["id"], "metricId": f"{key}_{mid}", "geo": gref,
                            "sourceId": SID, "seasonalAdjustment": "unadjusted", "priceBasis": "current_dollars",
                            "dims": {"family": key, "unitType": ut}, "points": pts})
    return out_obs, out_series, cov, {"latest": latest, "prev_year": prev_year, "first": since_2019, "df": df, "lk": lk}


def metric_defs():
    base = dict(category="housing", unit="CAD_month", decimals=0, higherIs="worse", geoLevel="cma", periodType="quarter",
                seasonalAdjustment="unadjusted", priceBasis="current_dollars", sourceIds=[SID],
                comparabilityNote="Experimental StatCan estimates built from online listings (asking rent) for apartments in CMAs; "
                                  "not comparable to CMHC survey rents (paid by sitting tenants in purpose-built rentals) or to census rents.")
    out = []
    labels = {"Studio": "studio (no-bedroom) apartment", "1 bedroom": "1-bedroom apartment",
              "2 bedroom": "2-bedroom apartment", "3 bedroom+": "apartment with 3 or more bedrooms"}
    for ut, mid in METRIC_IDS.items():
        out.append({**base, "id": f"rent_asking_{mid}", "label": f"Average asking rent, {labels[ut]}",
                    "shortLabel": f"Asking rent, {ut.replace(' bedroom', ' bed').replace('+', '+')}",
                    "description": f"Average advertised monthly rent for {labels[ut]} listings in the quarter (new listings, not rents "
                                   "currently paid by sitting tenants). Rounded to the nearest $10 by StatCan.",
                    "basis": "asking (advertised) rent, apartments, CMA", "mapLayer": True,
                    "dims": {"family": "rent_asking", "unitType": ut}})
    out.append({**base, "id": "rent_asking_1br_change_1y", "label": "Change in average asking rent, 1-bedroom, vs a year earlier",
                "shortLabel": "Asking rent 1 bed, 1y change", "unit": "percent", "decimals": 1, "higherIs": "worse",
                "description": "Percentage change in the 1-bedroom apartment average asking rent from the same quarter a year earlier. "
                               "A change in advertised prices, not a price level. Caution: StatCan flags 2025-Q2 estimates (the comparison quarter) as modelled because one listing platform was unavailable.",
                "basis": "asking (advertised) rent, computed from published values", "mapLayer": True,
                "dims": {"family": "rent_asking_change", "unitType": "1 bedroom"}})
    for ut in ("1 bedroom", "2 bedroom"):
        mid = METRIC_IDS[ut]
        out.append({**base, "id": f"rent_paid_{mid}", "label": f"Average paid rent, {labels[ut]}",
                    "shortLabel": f"Paid rent, {ut.replace(' bedroom', ' bed')}",
                    "description": "StatCan experimental estimate of the average rent paid for occupied private rental apartments, "
                                   "as a moving average of the last three quarters. Published for apartments with 1 or 2 bedrooms in 18 CMAs only.",
                    "basis": "paid rent, 3-quarter moving average, apartments, CMA", "mapLayer": False,
                    "dims": {"family": "rent_paid", "unitType": ut}})
    return out
