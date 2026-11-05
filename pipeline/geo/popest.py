"""StatCan 17-10-0148-01: population estimates, July 1, CMA/CA (2021 boundaries) -> metric pop_estimate.

One observation per place for the latest year in the table (Ottawa and Gatineau use their provincial parts, matched by
DGUID). Iqaluit is a single municipality, not a CMA/CA, so the table does not cover it: it stays on the 2021 Census count.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.contract import obs  # noqa: E402
from common.statcan import flags_for, read_table, source_record  # noqa: E402

TABLE = "17-10-0148-01"
SID = f"statcan-{TABLE}"
METRIC = {
    "id": "pop_estimate", "label": "Population estimate, July 1", "shortLabel": "Population (July 1 est.)",
    "category": "people", "unit": "persons", "decimals": 0, "higherIs": "neutral",
    "description": "Statistics Canada's annual postcensal population estimate for July 1 for the place's census metropolitan area / agglomeration (provincial part for Ottawa and Gatineau), on 2021 boundaries.",
    "basis": "Postcensal estimate based on the 2021 Census adjusted for net undercoverage, plus births, deaths and migration; all ages, both genders",
    "geoLevel": "cma", "periodType": "year", "mapLayer": False, "seasonalAdjustment": "not_applicable",
    "sourceIds": [SID],
    "comparabilityNote": "Compares CMA/CA populations (not city-proper). Estimates are adjusted for census undercoverage, so they are higher than the 2021 Census counts. Iqaluit is not a CMA/CA and is not covered.",
}


def main(places: list[dict]) -> tuple[list[dict], list[dict], list[dict]]:
    keep = {p["population"]["geo"]["dguid"]: p for p in places if p["geo"].get("cma")}
    df = read_table(TABLE, usecols=["REF_DATE", "GEO", "DGUID", "Gender", "Age group", "VALUE", "STATUS", "SYMBOL"],
                    row_filter=lambda c: c[c["DGUID"].isin(keep.keys()) & c["Gender"].eq("Total - gender") & c["Age group"].eq("All ages")])
    df = df[df["VALUE_NUM"].notna()]
    year = str(max(int(y) for y in df["REF_DATE"]))
    out = []
    for dguid, p in keep.items():
        sub = df[(df["DGUID"] == dguid) & (df["REF_DATE"] == year)]
        if sub.empty:
            out.append(obs(p["id"], "pop_estimate", None, year, p["population"]["geo"], SID, note=f"No July 1, {year} estimate for this geography in {TABLE}."))
            continue
        r = sub.iloc[0]
        out.append(obs(p["id"], "pop_estimate", float(r["VALUE_NUM"]), year, p["population"]["geo"], SID, flags=flags_for(r["STATUS"], r["SYMBOL"]),
                       note=f"July 1, {year} estimate, {r['GEO']}"))
    for p in places:
        if not p["geo"].get("cma"):
            out.append(obs(p["id"], "pop_estimate", None, year, p["population"]["geo"], SID, flags=["not_available"],
                           note=f"{TABLE} covers CMAs/CAs only; {p['name']} is a single municipality, so the 2021 Census count is used."))
    src = source_record(TABLE, reference_period=f"July 1, 2001 to {year} (annual); {year} used",
                        transformations=["Kept Gender='Total - gender' and Age group='All ages'; matched each place by DGUID to its CMA/CA (Ottawa and Gatineau by their Ontario/Quebec part).",
                                         f"Latest reference year in the table ({year}, July 1) shown as the place's headline population; the 2021 Census count stays available as pop_2021."])
    return [METRIC], out, [src]


if __name__ == "__main__":
    import json
    pl = json.loads((Path(__file__).resolve().parents[2] / "data/processed/geo/places.json").read_text())
    m, o, s = main(pl)
    print(len(o), sum(1 for x in o if x["value"] is not None), o[0])
