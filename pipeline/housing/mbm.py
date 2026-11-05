"""Market Basket Measure thresholds (StatCan 11-10-0066-01), reference family, latest year -> data/processed/cost/.

Table: MBM thresholds for the reference family by MBM region, component and base year. We use base '2023 base' and
'Current dollars' for the latest year (2025). Reference family = 2 adults + 2 children (Nunavut: 2 adults + 3 children).
Components published: Food, Clothing, Transportation, Shelter, Communication services, Other expenses (+ Inuusiqattiarniq in
Nunavut) and the Total threshold. Verified: Total = sum of components (rounding), and 11-10-0104-01 family-size totals follow
the square-root equivalence scale exactly (Toronto 1 person 31,440 = 62,880 x sqrt(1/4)).
"""
from __future__ import annotations

from common_h import places
from common.contract import geo, obs
from common.statcan import cube_metadata, read_table

TABLE = "11-10-0066-01"
TABLE_SIZES = "11-10-0104-01"
SID = f"statcan-{TABLE}"
SID_SIZES = f"statcan-{TABLE_SIZES}"
BASE, DOLLARS = "2023 base", "Current dollars"

COMPONENTS = {"Food": "food", "Clothing": "clothing", "Transportation": "transport", "Shelter": "shelter",
              "Communication services": "communication", "Other expenses": "other", "Total threshold": "total"}

# placeId -> (MBM region name as published, why). Regions are defined by StatCan by CMA/CA population class
# (table footnote): a named city = its CMA/CA; 'population 100,000 to 499,999' = CMAs of that size; '500,000 and over' = larger CMAs.
MBM = {
    "toronto": ("Toronto, Ontario", "named region = Toronto CMA"),
    "montreal": ("Montréal, Québec", "named region = Montréal CMA"),
    "vancouver": ("Vancouver, British Columbia", "named region = Vancouver CMA"),
    "calgary": ("Calgary, Alberta", "named region"), "edmonton": ("Edmonton, Alberta", "named region"),
    "ottawa": ("Ottawa-Gatineau, Ontario part, Ontario/Quebec", "named region = Ontario part of Ottawa-Gatineau"),
    "gatineau": ("Quebec, population 100,000 to 499,999", "ASSUMPTION: StatCan lists only the Ontario part of Ottawa-Gatineau as a named region; "
                 "the Quebec part (Gatineau, 100,000-499,999 residents) is taken to fall in the Quebec 100,000-499,999 class - verify with Statistics Canada"),
    "winnipeg": ("Winnipeg, Manitoba", "named region"), "quebec-city": ("Québec, Quebec", "named region = Québec CMA"),
    "hamilton": ("Hamilton/Burlington, Ontario", "named region = Hamilton CMA (includes Burlington)"),
    "kitchener-waterloo": ("Ontario, population 500,000 and over", "CMA with 500,000+ residents (2021 Census), no named region"),
    "london": ("Ontario, population 500,000 and over", "CMA with 500,000+ residents (2021 Census), no named region"),
    "halifax": ("Halifax, Nova Scotia", "named region"),
    "victoria": ("British Columbia, population 100,000 to 499,999", "CMA of 100,000-499,999 residents, no named region"),
    "saskatoon": ("Saskatoon, Saskatchewan", "named region"), "regina": ("Regina, Saskatchewan", "named region"),
    "st-johns": ("St. John's, Newfoundland and Labrador", "named region"),
    "windsor": ("Ontario, population 100,000 to 499,999", "CMA of 100,000-499,999 residents, no named region"),
    "kelowna": ("British Columbia, population 100,000 to 499,999", "CMA of 100,000-499,999 residents, no named region"),
    "abbotsford-mission": ("British Columbia, population 100,000 to 499,999", "CMA of 100,000-499,999 residents, no named region"),
    "moncton": ("Moncton, New Brunswick", "named region"),
    "saint-john": ("Saint John, New Brunswick", "named region"),
    "fredericton": ("Fredericton, New Brunswick", "named region"),
    "sherbrooke": ("Quebec, population 100,000 to 499,999", "CMA of 100,000-499,999 residents, no named region"),
    "sudbury": ("Ontario, population 100,000 to 499,999", "CMA of 100,000-499,999 residents, no named region"),
    "thunder-bay": ("Ontario, population 100,000 to 499,999", "CMA of 100,000-499,999 residents, no named region"),
    "charlottetown": ("Charlottetown, Prince Edward Island", "named region = Charlottetown CA"),
    "brandon": ("Brandon, Manitoba", "named region = Brandon CA"),
    "whitehorse": ("Yukon, Whitehorse", "named region"), "yellowknife": ("Northwest Territories, Yellowknife", "named region"),
    "iqaluit": ("Nunavut, Iqaluit", "named region; reference family is 2 adults + 3 children in Nunavut"),
}
LABEL = {"food": "Food", "clothing": "Clothing", "transport": "Transportation", "shelter": "Shelter",
         "communication": "Communication services", "other": "Other expenses", "total": "Total"}


def reference_household_size(region: str) -> int:
    return 5 if region.startswith("Nunavut,") else 4


def build():
    df = read_table(TABLE, row_filter=lambda c: c[(c["Base year"] == BASE) & (c["Dollar concept"] == DOLLARS)])
    latest = sorted(df.REF_DATE.unique())[-1]
    df = df[df.REF_DATE == latest]
    meta = cube_metadata(TABLE)
    member_id = {}
    for d in meta["dimension"]:
        if d["dimensionNameEn"] == "Geography":
            member_id = {m["memberNameEn"]: str(m["memberId"]) for m in d["member"]}
    lk = {(r.GEO, r.Component): (r.VALUE_NUM, r.DGUID) for r in df.itertuples(index=False)}
    out_obs, cov, values = [], {}, {}
    for pl in places():
        region, why = MBM[pl["id"]]
        gref = geo("mbm_region", member_id[region], region, None, "MBM 2023 base")
        cov[pl["id"]] = f"{region} - {why}"
        for comp, key in COMPONENTS.items():
            v, _ = lk.get((region, comp), (None, None))
            values[(pl["id"], key)] = v
            note = f"MBM region '{region}' ({why}). Reference family (2 adults + 2 children; Nunavut 2 adults + 3 children), {latest} current dollars, 2023-base MBM."
            out_obs.append(obs(pl["id"], f"cost_mbm_{key}", v, latest, gref, SID, [], note))
        if pl["id"] == "iqaluit":
            v, _ = lk.get((region, "Inuusiqattiarniq (Nunavut only)"), (None, None))
            out_obs.append(obs("iqaluit", "cost_mbm_inuusiqattiarniq", v, latest, gref, SID, [],
                               "Nunavut-only component, applicable to Indigenous families; included in the total threshold."))
    for observation in out_obs:
        observation["referenceHouseholdSize"] = reference_household_size(observation["geo"]["name"])
        observation["methodology"] = f"MBM {BASE}; {DOLLARS}; reference household {observation['referenceHouseholdSize']}"
    return out_obs, {"latest": latest, "values": values, "cov": cov,
                     "referenceHouseholdSizes": {p["id"]: reference_household_size(MBM[p["id"]][0]) for p in places()}}


def size_check():
    """Check the sqrt equivalence scale against 11-10-0104-01 (Toronto, 2023 base, latest year)."""
    d = read_table(TABLE_SIZES, row_filter=lambda c: c[(c["Market Basket Measure (MBM) base year"] == BASE) & c.GEO.str.startswith("Toronto")])
    d = d[d.REF_DATE == max(d.REF_DATE)]
    vals = {r["Total threshold by family size"]: r.VALUE_NUM for _, r in d.iterrows()}
    ref = vals["4 persons"]
    return [{"persons": n, "published": vals[f"{n} person{'s' if n > 1 else ''}"], "sqrt_scale": round(ref * (n / 4) ** 0.5)} for n in (1, 2, 3, 5)]


def metric_defs():
    base = dict(category="cost", unit="CAD_year", decimals=0, higherIs="worse", geoLevel="mbm_region", periodType="year",
                seasonalAdjustment="not_applicable", priceBasis="current_dollars", sourceIds=[SID], mapLayer=False,
                comparabilityNote="MBM regions differ from CMAs (named cities, or population classes such as 'Ontario, population 100,000 to 499,999'); "
                                  "several places share one regional value. Annual reference-household dollars (four people; five in Nunavut), not per-person costs or directly comparable city ranks.")
    scale = ("To approximate other household sizes, StatCan's MBM uses a square-root equivalence scale: the cost for a household of n persons "
             "is the reference-family cost x sqrt(n/referenceHouseholdSize), where the reference is 4 people, or 5 in Nunavut; e.g. 1 person = 50%, 2 persons = 71%, 3 persons = 87%, 5 persons = 112%. "
             "Published family-size totals in table 11-10-0104-01 follow this scale.")
    desc = {
        "food": "Food: the cost of a nutritious diet (per the National Nutritious Food Basket) prepared at home.",
        "clothing": "Clothing and footwear basket.",
        "transport": "Transportation: the basket's cost of getting around (public transit and/or running a vehicle, depending on the region).",
        "shelter": "Shelter: the housing cost in the basket (rent and utilities for a modest rental dwelling in the region); it is a benchmark, not an advertised rent. Left out of the arrival budget scenario because asking rent is entered separately.",
        "communication": "Communication services (phone and internet) - a separate component in the 2023-base MBM.",
        "other": "Other expenses: the allowance in the basket for everything else (for example personal care, household needs, recreation and reading).",
        "total": "Total MBM threshold: the sum of all components (food, clothing, transportation, shelter, communication services, other expenses).",
    }
    out = []
    for key, text in desc.items():
        out.append({**base, "id": f"cost_mbm_{key}", "label": f"MBM basket - {LABEL[key].lower()} (reference family, per year)",
                    "shortLabel": f"MBM {LABEL[key].lower()}",
                    "description": f"{text} Annual cost for the MBM reference family (2 adults + 2 children; Nunavut: 2 adults + 3 children), "
                                   f"current dollars for the observation year, 2023-base MBM. {scale}",
                    "basis": "Market Basket Measure (2023 base), reference household of four (five in Nunavut), current dollars, annual",
                    "dims": {"family": "cost_mbm", "component": LABEL[key]}})
    out.append({**base, "id": "cost_mbm_inuusiqattiarniq", "label": "MBM basket - Inuusiqattiarniq (Nunavut only)", "shortLabel": "MBM Inuusiqattiarniq",
                "description": "Nunavut-only component, applicable to Indigenous families; included in Nunavut total thresholds.",
                "dims": {"family": "cost_mbm", "component": "Inuusiqattiarniq"}, "basis": "MBM 2023 base, Nunavut"})
    return out
