"""Step 3: ECCC Canadian Climate Normals 1991-2020, one composite station per place.

Source: https://climate.weather.gc.ca/climate_normals/ (station pages 'results_1991_2020_e.html?...&climate_id=...' and the
1991-2020 Composite Station Inventory CSV 'station_inventory_e.html?yr=1991'). The MSC GeoMet OGC API (api.weather.gc.ca)
only serves the 1981-2010 normals and the dd.weather.gc.ca datamart only holds 1981-2010 CSVs, so the 1991-2020
station pages are the official source used (HTML tables parsed; values are the published normals).

Station choice (transparent, rule-based): composites in the 1991-2020 inventory within 60 km of the place marker whose
normals code A-D (A: WMO 3-and-5 rule; B >= 25 y; C >= 20 y; D >= 15 y). The composite is the airport composite (name contains
'AIRPORT' or 'INT'L'/'INTL' thread) if one is within 30 km; otherwise the nearest A-D composite. Complete monthly
temperature, precipitation and snowfall normals are required (checked on the station page).
"""
from __future__ import annotations

import csv
import html
import io
import math
import re
import sys
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.fetch import fetch, meta_for, now_iso  # noqa: E402
from common.contract import obs, geo  # noqa: E402

BASE = "https://climate.weather.gc.ca/climate_normals/"
INVENTORY = BASE + "station_inventory_e.html?yr=1991"
SRC_ID = "eccc-climate-normals-1991-2020"
PERIOD = "1991-2020"
MONTHS = [f"{m:02d}" for m in range(1, 13)]
PROVNAME = {"NL": "NEWFOUNDLAND AND LABRADOR", "PE": "PRINCE EDWARD ISLAND", "NS": "NOVA SCOTIA", "NB": "NEW BRUNSWICK", "QC": "QUEBEC",
            "ON": "ONTARIO", "MB": "MANITOBA", "SK": "SASKATCHEWAN", "AB": "ALBERTA", "BC": "BRITISH COLUMBIA", "YT": "YUKON",
            "NT": "NORTHWEST TERRITORIES", "NU": "NUNAVUT"}
CODE_NOTE = {"A": "WMO '3 and 5' rule met (no more than 3 consecutive and 5 total missing years)", "B": "at least 25 years of data",
             "C": "at least 20 years of data", "D": "at least 15 years of data"}


def hav(lat1, lon1, lat2, lon2) -> float:
    p = math.pi / 180
    a = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(a))


def inventory() -> list[dict]:
    p = fetch(INVENTORY, max_age_days=30)
    rows = list(csv.DictReader(io.StringIO(p.read_text(encoding="utf-8-sig"))))
    return rows


def choose(place: dict, inv: list[dict]) -> list[dict]:
    """Ordered candidate composites (best first). Matching is by coordinates (not province), so Gatineau can use Ottawa airport."""
    groups: dict[str, list[dict]] = {}
    for r in inv:
        groups.setdefault(r["COMPOSITE_STATION_NAME"] + "|" + r["PROVINCE_OR_TERRITORY"], []).append(r)
    cands = []
    for key, rs in groups.items():
        name = key.split("|")[0]
        code = rs[0]["NORMALS_CODE"]
        d = min(hav(place["lat"], place["lon"], float(r["LATITUDE"]), float(r["LONGITUDE"])) for r in rs)
        airport = ("AIRPORT" in name or any(("INT'L" in r["STATION_NAME"] or "INTL" in r["STATION_NAME"]) for r in rs)
                   or any(r["TC_IDENTIFIER"] and r["STATION_NAME"].endswith(" A") for r in rs))
        cands.append({"name": name, "code": code, "d": d, "airport": airport, "rows": rs})
    good = lambda c: c["code"] in ("A", "B", "C", "D")
    t1 = sorted([c for c in cands if c["airport"] and good(c) and c["d"] <= 30], key=lambda c: (c["code"], c["d"]))
    t2 = sorted([c for c in cands if good(c) and c["d"] <= 30], key=lambda c: c["d"])
    t3 = sorted([c for c in cands if c["airport"] and c["d"] <= 30], key=lambda c: c["d"])
    t4 = sorted([c for c in cands if c["d"] <= 30], key=lambda c: c["d"])
    t5 = sorted([c for c in cands if good(c) and c["d"] <= 60], key=lambda c: c["d"])
    t6 = sorted([c for c in cands if c["d"] <= 60], key=lambda c: c["d"])
    seen, out = set(), []
    for c in t1 + t2 + t3 + t4 + t5 + t6:
        if c["name"] not in seen:
            seen.add(c["name"])
            out.append(c)
    return out


def thread_for(c: dict, place: dict) -> dict:
    # thread with an identifier (current automated/airport thread) preferred, else the nearest
    rs = sorted(c["rows"], key=lambda r: (0 if r["TC_IDENTIFIER"] else 1, hav(place["lat"], place["lon"], float(r["LATITUDE"]), float(r["LONGITUDE"]))))
    return rs[0]


def page_url(climate_id: str) -> str:
    return BASE + f"results_1991_2020_e.html?stnID=&climate_id={climate_id}&autofwd=1"


def strip(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s))).strip()


def parse_page(text: str) -> dict:
    """Return {'title': ..., 'tables': {(caption, row label): [12 monthly + year, code]}}"""
    title = re.search(r'<a href="#metadata-thread">([^<]+)</a>', text)
    out: dict = {"title": strip(title.group(1)) if title else None, "rows": {}}
    for tb in re.findall(r"<table.*?</table>", text, re.S):
        cap = re.search(r"<caption[^>]*>(.*?)</caption>", tb, re.S)
        capt = strip(cap.group(1)) if cap else ""
        for tr in re.findall(r"<tr.*?</tr>", tb, re.S):
            cells = [strip(c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S)]
            if len(cells) >= 14 and cells[0] and not cells[0].startswith("Jan"):
                out["rows"].setdefault(cells[0], []).append(cells[1:])
    return out


def val(x: str):
    x = x.replace("\xa0", "").replace(",", "").strip()
    try:
        return float(x)
    except ValueError:
        return None


def row_after(rows: dict, label_prefix: str, nth: int = 0):
    for k, v in rows.items():
        if k.startswith(label_prefix) and len(v) > nth:
            return v[nth]
    return None


# --------------------------------------------------------------------------- build
ELEMENTS = {  # key -> (row label, unit, series label)
    "temp_mean": ("Daily Average (°C)", "degC", "Mean daily temperature"),
    "temp_max": ("Daily Maximum (°C)", "degC", "Mean daily maximum temperature"),
    "temp_min": ("Daily Minimum (°C)", "degC", "Mean daily minimum temperature"),
    "precip": ("Precipitation (mm)", "mm", "Precipitation (rain + snow water equivalent)"),
    "snow": ("Snowfall (cm)", "cm", "Snowfall"),
}


def get_normals(place: dict, inv: list[dict]):
    for c in choose(place, inv):
        th = thread_for(c, place)
        url = page_url(th["CLIMATE_ID"])
        try:
            path = fetch(url, max_age_days=None, suffix=".html")
        except Exception:
            continue
        parsed = parse_page(path.read_text(encoding="utf-8", errors="replace"))
        rows = parsed["rows"]
        need = [row_after(rows, ELEMENTS[k][0]) for k in ("temp_mean", "temp_max", "temp_min")]
        if all(n and sum(val(x) is not None for x in n[:12]) == 12 for n in need):
            return c, th, parsed, url, path
    return None


def metric_defs() -> list[dict]:
    base = dict(category="climate", geoLevel="station", periodType="normals", seasonalAdjustment="not_applicable", mapLayer=True,
                sourceIds=[SRC_ID],
                comparabilityNote="Values are for the climate station chosen to represent the place (flag station_proxy), not for the whole city. Stations differ in elevation, distance to water and urban setting. All use the 1991-2020 normals period.")
    d = lambda **k: {**base, **k}
    return [
        d(id="clim_jan_mean_temp", label="January mean daily temperature (1991–2020 normal)", shortLabel="Jan mean temp", unit="degC", decimals=1, higherIs="better",
          description="Average of daily mean temperatures in January, 1991–2020 climate normal at the representative station.", basis="ECCC climate normal; monthly mean of daily mean temperature"),
        d(id="clim_jul_mean_temp", label="July mean daily temperature (1991–2020 normal)", shortLabel="Jul mean temp", unit="degC", decimals=1, higherIs="neutral",
          description="Average of daily mean temperatures in July, 1991–2020 climate normal at the representative station.", basis="ECCC climate normal; monthly mean of daily mean temperature"),
        d(id="clim_jan_min_temp", label="January mean daily minimum temperature (1991–2020 normal)", shortLabel="Jan mean low", unit="degC", decimals=1, higherIs="better",
          description="Average of daily minimum temperatures in January (typical overnight low), 1991–2020 normal.", basis="ECCC climate normal; monthly mean of daily minimum temperature"),
        d(id="clim_jul_max_temp", label="July mean daily maximum temperature (1991–2020 normal)", shortLabel="Jul mean high", unit="degC", decimals=1, higherIs="neutral",
          description="Average of daily maximum temperatures in July (typical afternoon high), 1991–2020 normal.", basis="ECCC climate normal; monthly mean of daily maximum temperature"),
        d(id="clim_annual_precip", label="Annual precipitation (1991–2020 normal)", shortLabel="Precipitation", unit="mm", decimals=0, higherIs="neutral",
          description="Average yearly total of rain plus the water equivalent of snow, 1991–2020 normal.", basis="ECCC climate normal; annual total of daily precipitation"),
        d(id="clim_annual_snow", label="Annual snowfall (1991–2020 normal)", shortLabel="Snowfall", unit="cm", decimals=0, higherIs="neutral",
          description="Average yearly total snowfall (depth of fresh snow), 1991–2020 normal.", basis="ECCC climate normal; annual total snowfall in cm"),
        d(id="clim_days_below_minus20", label="Days per year with minimum below −20 °C (1991–2020 normal)", shortLabel="Days below −20 °C", unit="days", decimals=1, higherIs="worse",
          description="Average number of days per year when the daily minimum temperature is below −20 °C, 1991–2020 normal.", basis="ECCC climate normal; days with minimum temperature < −20 °C"),
        d(id="clim_days_above_30", label="Days per year with maximum above 30 °C (1991–2020 normal)", shortLabel="Days above 30 °C", unit="days", decimals=1, higherIs="worse",
          description="Average number of days per year when the daily maximum temperature exceeds 30 °C, 1991–2020 normal.", basis="ECCC climate normal; days with maximum temperature > 30 °C"),
    ]


def main(places: list[dict]):
    inv = inventory()
    observations, series, stations, sources = [], [], {}, []
    retrieved = now_iso()
    gaps = {}
    for p in places:
        res = get_normals(p, inv)
        if not res:
            gaps[p["id"]] = "no station with complete 1991-2020 temperature/precipitation/snowfall normals within 60 km"
            continue
        c, th, parsed, url, path = res
        rows = parsed["rows"]
        d = hav(p["lat"], p["lon"], float(th["LATITUDE"]), float(th["LONGITUDE"]))
        st = {"name": parsed["title"] or c["name"], "climateId": th["CLIMATE_ID"], "lat": float(th["LATITUDE"]), "lon": float(th["LONGITUDE"]),
              "elevationM": float(th["ELEVATION(m)"]) if th["ELEVATION(m)"] else None, "distanceKm": round(d, 1), "normalsPeriod": PERIOD, "sourceId": SRC_ID}
        if st["elevationM"] is None:
            st.pop("elevationM")
        stations[p["id"]] = st
        sg = geo("station", th["CLIMATE_ID"], st["name"], None, PERIOD)
        flags = ["station_proxy"]
        def rowc(key):
            r_ = row_after(rows, ELEMENTS[key][0])
            return r_ if r_ and sum(val(x) is not None for x in r_[:12]) == 12 else None
        code_of = lambda key: (rowc(key) or rowc("temp_mean"))[13]

        def note(key):
            cd = code_of(key)
            return f"{st['name']} (climate ID {th['CLIMATE_ID']}, {d:.0f} km from the place marker); normals code {cd}: {CODE_NOTE.get(cd, 'fewer than 15 years; see ECCC legend')}"

        def fl(key):
            return flags + (["use_with_caution"] if code_of(key) in ("E", "F", "G") else [])

        def add(metric, key, idx):
            if rowc(key) is None:
                observations.append(obs(p["id"], metric, None, PERIOD, sg, SRC_ID, ["not_available"] + flags,
                                        f"{ELEMENTS[key][2]} is not published in the 1991-2020 normals for {st['name']} (climate ID {th['CLIMATE_ID']})"))
                return
            observations.append(obs(p["id"], metric, val(rowc(key)[idx]), PERIOD, sg, SRC_ID, fl(key), note(key)))
        add("clim_jan_mean_temp", "temp_mean", 0)
        add("clim_jul_mean_temp", "temp_mean", 6)
        add("clim_jan_min_temp", "temp_min", 0)
        add("clim_jul_max_temp", "temp_max", 6)
        add("clim_annual_precip", "precip", 12)
        add("clim_annual_snow", "snow", 12)
        mn = rows.get("< -20 °C", [])
        mx = rows.get("> 30 °C", [])
        for metric, rr in (("clim_days_below_minus20", mn), ("clim_days_above_30", mx)):
            if rr:
                v = val(rr[0][12]); cd = rr[0][13]
                observations.append(obs(p["id"], metric, v, PERIOD, sg, SRC_ID, flags + (["use_with_caution"] if cd in ("E", "F", "G") else []),
                                        f"{st['name']} (climate ID {th['CLIMATE_ID']}); normals code {cd}"))
            else:
                observations.append(obs(p["id"], metric, None, PERIOD, sg, SRC_ID, ["not_available"] + flags, "Not published for this station"))
        for key, (lab, unit, title) in ELEMENTS.items():
            r = rowc(key)
            if r is None:
                continue
            pts = [{"t": m, "v": val(r[i])} for i, m in enumerate(MONTHS)]
            series.append({"id": f"normals-{p['id']}-{key}", "label": f"{title}, 1991–2020 normals", "unit": unit, "placeId": p["id"], "geo": sg,
                           "sourceId": SRC_ID, "dims": {"element": key, "period": PERIOD, "station": st["name"], "normalsCode": code_of(key), "year": r[12]},
                           "points": pts})
    sources.append({
        "id": SRC_ID, "title": "Canadian Climate Normals 1991–2020 (station pages and composite station inventory)",
        "publisher": "Environment and Climate Change Canada (Meteorological Service of Canada)", "tableId": "Canadian Climate Normals 1991-2020",
        "url": "https://climate.weather.gc.ca/climate_normals/index_e.html", "downloadUrl": INVENTORY,
        "retrievedAt": retrieved, "referencePeriod": "1991-2020 (30-year climate normals)",
        "licence": "Environment and Climate Change Canada data servers end-use licence / Open Government Licence – Canada",
        "attribution": "Source: Environment and Climate Change Canada, Canadian Climate Normals 1991-2020.",
        "transformations": ["Station pages (results_1991_2020_e.html?climate_id=...) parsed: monthly rows for daily average/maximum/minimum temperature, precipitation and snowfall; annual 'Year' column used for totals and for days with minimum < -20 °C and maximum > 30 °C.",
                            "One composite station per place chosen by rule (see pipeline/geo/README.md); values are not adjusted or interpolated."],
        "notes": ["The MSC GeoMet OGC API (climate-normals collection) and the dd.weather.gc.ca datamart only hold the 1981-2010 normals, so the 1991-2020 station pages were used.",
                  "ECCC normals codes: A = WMO '3 and 5' rule met; B = at least 25 years; C = at least 20 years; D = at least 15 years; E-G = fewer years (kept with use_with_caution)."],
        "status": "ok" if not gaps else "partial"})
    return metric_defs(), observations, series, stations, sources, gaps


if __name__ == "__main__":
    import json
    P = json.loads((Path(__file__).resolve().parents[2] / "data/processed/geo/places.json").read_text())
    m, o, s, st, src, gaps = main(P)
    print(len(o), len(s), gaps)
    for k, v in st.items():
        print(k, v["name"], v["climateId"], v["distanceKm"], v.get("elevationM"))
