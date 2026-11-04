"""Shared helpers for the immigration pipeline."""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from common.contract import geo, load_places  # noqa: E402

TODAY = "2026-11-04"

# IRCC CMA-table row label per place id (IRCC's "CMA" table also lists CAs).
IRCC_ROW = {
    "toronto": "Toronto", "montreal": "Montréal", "vancouver": "Vancouver", "calgary": "Calgary",
    "edmonton": "Edmonton", "ottawa": "Ottawa - Gatineau (Ontario part)",
    "gatineau": "Ottawa - Gatineau (Quebec part)", "winnipeg": "Winnipeg", "quebec-city": "Québec",
    "hamilton": "Hamilton", "kitchener-waterloo": "Kitchener - Cambridge - Waterloo", "london": "London",
    "halifax": "Halifax", "victoria": "Victoria", "saskatoon": "Saskatoon", "regina": "Regina",
    "st-johns": "St. John's", "windsor": "Windsor", "kelowna": "Kelowna",
    "abbotsford-mission": "Abbotsford - Mission", "moncton": "Moncton", "saint-john": "Saint John",
    "fredericton": "Fredericton", "sherbrooke": "Sherbrooke", "sudbury": "Greater Sudbury",
    "thunder-bay": "Thunder Bay", "charlottetown": "Charlottetown", "brandon": "Brandon",
    "whitehorse": "Whitehorse", "yellowknife": "Yellowknife",
    # iqaluit: IRCC publishes only "Other - Nunavut"
}

# StatCan geography label (43-10-0030-01 / 43-10-0022-01 / 17-10-0148-01 differ in naming).
PROV_NAME = {"NL": "Newfoundland and Labrador", "PE": "Prince Edward Island", "NS": "Nova Scotia",
             "NB": "New Brunswick", "QC": "Quebec", "ON": "Ontario", "MB": "Manitoba", "SK": "Saskatchewan",
             "AB": "Alberta", "BC": "British Columbia", "YT": "Yukon", "NT": "Northwest Territories",
             "NU": "Nunavut"}
PROV_CODE = {"NL": "10", "PE": "11", "NS": "12", "NB": "13", "QC": "24", "ON": "35", "MB": "46", "SK": "47",
             "AB": "48", "BC": "59", "YT": "60", "NT": "61", "NU": "62"}

# 43-10-0030 / 43-10-0022 geography label per place (taxfiler tables: CMAs only, no CAs).
TAX_GEO = {
    "toronto": "Toronto, Ontario", "montreal": "Montreal, Quebec", "vancouver": "Vancouver, British Columbia",
    "calgary": "Calgary, Alberta", "edmonton": "Edmonton, Alberta",
    "ottawa": "Ottawa - Gatineau, Ontario part", "gatineau": "Ottawa - Gatineau, Quebec part",
    "winnipeg": "Winnipeg, Manitoba", "quebec-city": "Québec, Quebec", "hamilton": "Hamilton, Ontario",
    "kitchener-waterloo": "Kitchener - Cambridge - Waterloo, Ontario", "london": "London, Ontario",
    "halifax": "Halifax, Nova Scotia", "victoria": "Victoria, British Columbia",
    "saskatoon": "Saskatoon, Saskatchewan", "regina": "Regina, Saskatchewan",
    "st-johns": "St. John's, Newfoundland and Labrador", "windsor": "Windsor, Ontario",
    "kelowna": "Kelowna, British Columbia", "abbotsford-mission": "Abbotsford - Mission, British Columbia",
    "moncton": "Moncton, New Brunswick", "saint-john": "Saint John, New Brunswick",
    "fredericton": "Fredericton, New Brunswick", "sherbrooke": "Sherbrooke, Quebec",
    "sudbury": "Greater Sudbury, Ontario", "thunder-bay": "Thunder Bay, Ontario",
}
# 17-10-0148-01 label per place.
POP_GEO = {
    "ottawa": "Ottawa - Gatineau (CMA), Ontario part, Ontario",
    "gatineau": "Ottawa - Gatineau (CMA), Quebec part, Quebec",
}


def place_info(p: dict) -> dict:
    """Normalise a place from either the seed or verified places.json into a flat dict."""
    g = p.get("geo") or {}
    cma = g.get("cma") or p.get("cma")
    part = g.get("cmaPart") or p.get("cmaPart")
    prov = g.get("province")
    return {"id": p["id"], "name": p["name"], "province": p["province"], "cma": cma, "part": part,
            "provinceGeo": prov, "tier": p.get("tier")}


def places() -> list[dict]:
    return [place_info(p) for p in load_places()]


def province_geo(code: str) -> dict:
    return geo("province", PROV_CODE[code], PROV_NAME[code], dguid=f"2021A0002{PROV_CODE[code]}", vintage="2021")


def place_geo(pi: dict) -> dict:
    """Geography an observation is for: CMA part if the place has one (Ottawa/Gatineau), else CMA/CA."""
    g = pi["part"] or pi["cma"]
    if not g:
        return None
    out = {k: g[k] for k in ("level", "id", "name", "dguid", "vintage") if g.get(k)}
    return out
