"""Official neighbourhood snapshots; no review scraping.

Run through refresh.py --domains neighbourhoods for staged, validated publication.
Geometry is kept at the census vintage. Edmonton/Calgary use EPSG:32612;
additional city adapters select an appropriate local projection.
"""
from __future__ import annotations

import json
import argparse
import importlib
import hashlib
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.contract import PROCESSED
from common.fetch import fetch, meta_for
from pyproj import Transformer
from shapely import make_valid, orient_polygons, transform
from shapely.geometry import Point, mapping, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree

PROJECT = Transformer.from_crs(4326, 32612, always_xy=True).transform
UNPROJECT = Transformer.from_crs(32612, 4326, always_xy=True).transform
SOURCES = []


def number(raw):
    if raw is None or str(raw).strip() in {"", "-", "..", "...", "x", "F"}:
        return None
    value = float(raw)
    if not math.isfinite(value) or value < 0:
        raise ValueError(f"Invalid non-negative measurement: {raw!r}")
    return value


def ratio(part, total):
    if part is None or total is None or total <= 0 or part > total:
        return None
    return round(100 * part / total, 1)


def sum_known(*values):
    return None if any(v is None for v in values) else sum(values)


def cell(value, reason="Not published, suppressed or not comparable at this geography."):
    return {"value": value, **({"missingReason": reason} if value is None else {})}


def park_id(row, key, geometry_key):
    # Edmonton leaves its public ID blank for some newly catalogued parks.
    # Retain those geometries with a stable content key rather than dropping them.
    return str(row[key]) if row.get(key) else "geometry-" + hashlib.sha256(json.dumps(row[geometry_key], sort_keys=True).encode()).hexdigest()[:16]


def dataset(city, key, period, *, select=None, where=None, notes=()):
    print(f"Reading {city}/{key}", flush=True)
    host = f"https://data.{city}.ca"
    meta_path = fetch(f"{host}/api/views/{key}.json", timeout=45)
    meta = json.loads(meta_path.read_text())
    params = {"$where": where} if where else {}
    count_path = fetch(f"{host}/resource/{key}.json", params={**params, "$select": "count(*)"}, timeout=45)
    count = int(json.loads(count_path.read_text())[0]["count"])
    if not 1 <= count <= 100000:
        raise ValueError(f"Unexpected dataset size for {key}: {count}")
    rows, paths = [], []
    while len(rows) < count:
        query = {**params, "$order": ":id", "$limit": 5000, "$offset": len(rows)}
        if select:
            query["$select"] = select
        path = fetch(f"{host}/resource/{key}.json", params=query, timeout=60)
        page = json.loads(path.read_text())
        if not isinstance(page, list) or not page:
            raise ValueError(f"Incomplete download for {key}: {len(rows)}/{count}")
        rows.extend(page)
        paths.append(path)
    if len(rows) != count:
        raise ValueError(f"Dataset changed during download: {key}")
    sid = f"{city}-{key}"
    updated = datetime.fromtimestamp(meta["rowsUpdatedAt"], timezone.utc).date().isoformat()
    census = period == "2021"
    source = {
        "id": sid, "title": meta["name"], "publisher": f"City of {city.title()}" + (" / Statistics Canada" if census else ""),
        "tableId": key, "url": f"{host}/d/{key}", "downloadUrl": f"{host}/resource/{key}.json",
        "releaseDate": updated, "retrievedAt": max(meta_for(p)["retrievedAt"] for p in paths),
        "referencePeriod": period if census else f"Dataset updated {updated}",
        "licence": "Statistics Canada Open Licence" if census else f"City of {city.title()} Open Data Terms of Use",
        "attribution": ("Adapted from Statistics Canada, 2021 Census of Population. This does not constitute an endorsement by Statistics Canada of this product."
                        if census else f"Contains information from the City of {city.title()} Open Data Catalogue. The City does not endorse this product."),
        "transformations": ["Join by publisher's neighbourhood/community code; retain missing values and source dates.", *notes],
        "notes": ["Manually refreshed snapshot; the retrieval date is not the observation period."], "status": "ok",
    }
    SOURCES.append(source)
    return rows, sid


def definition(label, unit, source_id, note, period="2021"):
    return {"label": label, "unit": unit, "sourceId": source_id, "period": period, "note": note}


def census_index(rows):
    result = {}
    for row in rows:
        key = (row["neighbourhood_number"], int(row["characteristics_code"]))
        if key in result:
            raise ValueError(f"Duplicate census cell {key}")
        result[key] = row
    return result


def edmonton():
    boundaries, bs = dataset("edmonton", "5bk4-5txu", "2021", select="the_geom,neighbourh,descriptiv")
    short, ss = dataset("edmonton", "rw8s-vqrs", "2021", where="neighbourhood_number IS NOT NULL AND characteristics_code IN (1,28,33,34,35,39,40,43,44,49)")
    long, ls = dataset("edmonton", "9325-erna", "2021", where="neighbourhood_number IS NOT NULL AND characteristics_code IN (297,299,377,2573,2577,2578,2579)")
    index = census_index(short + long)
    defs = {
        "population": definition("Population", "persons", ss, "Total population, 2021 Census; counts are randomly rounded."),
        "children": definition("Children under 15", "percent", ss, "Share of the total population, 2021 Census."),
        "householdSize": definition("Average household size", "persons", ss, "People per private household, 2021 Census."),
        "livingAlone": definition("One-person households", "percent", ss, "One-person households divided by all private households; rounded counts."),
        "apartments": definition("Homes in apartment buildings", "percent", ss, "Occupied dwellings in buildings with fewer than five or five-plus storeys, divided by all occupied dwellings. Duplexes excluded."),
        "renters": definition("Households renting", "percent", ls, "Renter households divided by households by tenure; 25% census sample, rounded counts."),
        "tenantShelter": definition("Median tenant shelter cost", "CAD_month", ls, "2021 occupied rentals, including utilities where applicable. All dwelling sizes; not today's asking rent. 25% census sample."),
        "transit": definition("Commutes by public transit", "percent", ls, "Among employed people 15+ with a usual workplace or no fixed workplace; excludes working at home. 25% sample; pandemic-era travel."),
        "walkCycle": definition("Commutes on foot or by bike", "percent", ls, "Same commuting denominator; excludes working at home. 25% sample; pandemic-era travel."),
    }
    records = []
    for row in boundaries:
        code = str(int(float(row["neighbourh"])))
        def get(c):
            return number(index.get((code, c), {}).get("total_gender"))
        values = {"population": get(1), "children": get(28), "householdSize": get(49),
                  "livingAlone": ratio(get(44), get(43)), "apartments": ratio(sum_known(get(39), get(40)), get(34)),
                  "renters": ratio(get(299), get(297)), "tenantShelter": get(377),
                  "transit": ratio(get(2577), get(2573)), "walkCycle": ratio(sum_known(get(2578), get(2579)), get(2573))}
        quality = {k: index.get((code, 1), {}).get(k) for k in ("nonresponse_rate", "incomplete_enumeration_flag", "short_form_data_quality_flag", "long_form_data_quality_flag", "long_form_income_data_quality")}
        records.append({"id": code, "name": row["descriptiv"], "geometry": row["the_geom"], "metrics": {k: cell(v) for k, v in values.items()}, "quality": quality})
    parks, ps = dataset("edmonton", "gdd9-eqv9", "snapshot", where="status = 'Active'", select="id,official_name,common_name,geometry_multipolygon")
    stations, ts = dataset("edmonton", "fhxi-cnhe", "snapshot", select="lrt_stop_number,lrt_stop_description,latitude,longitude")
    parks = [{"id": park_id(r, "id", "geometry_multipolygon"), "name": r.get("official_name") or r.get("common_name") or "Unnamed park", "geometry": r["geometry_multipolygon"]} for r in parks]
    stations = [{"id": r["lrt_stop_number"], "name": r["lrt_stop_description"], "lon": float(r["longitude"]), "lat": float(r["latitude"])} for r in stations]
    return finish("edmonton", records, defs, bs, parks, ps, stations, ts,
                  "2021 census-day boundaries and names. Some neighbourhoods have since been renamed or changed.",
                  "Active park polygons published by the City of Edmonton; not a measure of tree canopy or all green space.")


def calgary():
    rows, cs = dataset("calgary", "f9wk-wej9", "2021", select="community_code,community_name,total_pop_household,pop_age_0_to_14_percent,the_geom")
    families, fs = dataset("calgary", "msjx-5ygv", "2021", select="community_code,total_private_households,house_size_1_person,avg_household_size")
    by_code = {r["community_code"]: r for r in families}
    if len(by_code) != len(families):
        raise ValueError("Duplicate Calgary community household records")
    defs = {
        "population": definition("Population in private households", "persons", cs, "Excludes collective dwellings. 2021 Census, published on the city's 2022 community boundaries; rounded counts."),
        "children": definition("Children under 15", "percent", cs, "Share of people in private households; 2021 Census. Excludes collective dwellings."),
        "householdSize": definition("Average household size", "persons", fs, "People per private household, 2021 Census."),
        "livingAlone": definition("One-person households", "percent", fs, "One-person households divided by all private households; rounded counts."),
    }
    records = []
    for row in rows:
        family = by_code.get(row["community_code"], {})
        values = {"population": number(row.get("total_pop_household")), "children": number(row.get("pop_age_0_to_14_percent")),
                  "householdSize": number(family.get("avg_household_size")),
                  "livingAlone": ratio(number(family.get("house_size_1_person")), number(family.get("total_private_households")))}
        records.append({"id": row["community_code"].lower(), "name": row["community_name"].title(), "geometry": row["the_geom"], "metrics": {k: cell(v) for k, v in values.items()}})
    parks, ps = dataset("calgary", "kami-qbfh", "snapshot", where="life_cycle_status = 'ACTIVE'", select="asset_cd,site_name,the_geom")
    stations, ts = dataset("calgary", "2axz-xm4q", "snapshot", where="status = 'Current'", select="stationnam,the_geom")
    parks = [{"id": park_id(r, "asset_cd", "the_geom"), "name": r.get("site_name") or "Unnamed park site", "geometry": r["the_geom"]} for r in parks]
    stations = [{"id": str(i), "name": r["stationnam"], "lon": r["the_geom"]["coordinates"][0], "lat": r["the_geom"]["coordinates"][1]} for i, r in enumerate(stations)]
    return finish("calgary", records, defs, cs, parks, ps, stations, ts,
                  "2021 census communities on the publisher's 2022 boundaries. Population covers private households only; newly created communities may be absent.",
                  "Active Calgary Parks sites used for maintenance operations; not all green space. Definitions differ from Edmonton's parks inventory.")


def finish(city, records, defs, boundary_source, parks, park_source, stations, station_source, boundary_note, park_note):
    park_shapes = [transform(make_valid(shape(p["geometry"])), PROJECT, interleaved=False) for p in parks]
    tree = STRtree(park_shapes)
    # Several platforms/stops can represent the same named station. Keep one point per name.
    unique_stations = {}
    for station in sorted(stations, key=lambda s: s["id"]):
        unique_stations.setdefault(station["name"], station)
    stations = list(unique_stations.values())
    station_points = [transform(Point(s["lon"], s["lat"]), PROJECT, interleaved=False) for s in stations]
    source_by_id = {s["id"]: s for s in SOURCES}
    defs["parkland"] = definition("Mapped parkland", "percent", park_source, park_note + " Share of the neighbourhood covered by the union of park polygons; overlaps counted once.", source_by_id[park_source]["releaseDate"])
    defs["parks"] = definition("Park sites overlapping the area", "count", park_source, "Park/site records with more than 1 m² inside the boundary, deduplicated by publisher ID or geometry when no ID is supplied. A site spanning two areas can appear in both.", source_by_id[park_source]["releaseDate"])
    defs["rail"] = definition("LRT stations in or near the area", "count", station_source, "Distinct named stations inside or within 800 m of the boundary, measured in a straight line. Not a walking distance from a home or a service-frequency measure.", source_by_id[station_source]["releaseDate"])
    for record in records:
        geometry = transform(make_valid(shape(record["geometry"])), PROJECT, interleaved=False)
        if geometry.area <= 0:
            raise ValueError(f"Empty neighbourhood: {record['id']}")
        nearby_parks = [int(i) for i in tree.query(geometry, predicate="intersects") if geometry.intersection(park_shapes[int(i)]).area > 1]
        park_area = geometry.intersection(unary_union([park_shapes[i] for i in nearby_parks])).area if nearby_parks else 0
        park_names = {parks[i]["id"]: parks[i]["name"] for i in nearby_parks}
        near_stations = [{**s, "distanceToBoundaryM": round(geometry.distance(pt))} for s, pt in zip(stations, station_points) if geometry.distance(pt) <= 800]
        record["metrics"].update(parkland=cell(round(100 * min(park_area, geometry.area) / geometry.area, 1)), parks=cell(len(park_names)), rail=cell(len(near_stations)))
        record["parks"] = sorted(park_names.values())
        record["stations"] = sorted(near_stations, key=lambda s: (s["distanceToBoundaryM"], s["name"]))
        # Simplification is for display only. Intersections above use the original polygons.
        display = orient_polygons(transform(geometry.simplify(12, preserve_topology=True), UNPROJECT, interleaved=False), exterior_cw=True)
        record["geometry"] = json.loads(json.dumps(mapping(display)))
    used = {d["sourceId"] for d in defs.values()} | {boundary_source}
    return {"schemaVersion": 1, "placeId": city, "cityName": city.title(), "boundarySourceId": boundary_source,
            "boundaryNote": boundary_note, "boundaryVintage": "2021" if city == "edmonton" else "2022",
            "definitions": defs, "sources": [s for s in SOURCES if s["id"] in used],
            "neighbourhoods": sorted(records, key=lambda n: n["name"]), "stations": stations,
            "links": {"hoodmaps": f"https://hoodmaps.com/{city}-neighborhood-map", "reddit": f"https://www.reddit.com/r/{city}/",
                      "profiles": "https://www.edmonton.ca/residential_neighbourhoods/neighbourhoods/neighbourhood-profiles" if city == "edmonton" else "https://www.calgary.ca/communities/profiles.html"}}


def main():
    from neighbourhoods.check import validate
    out = PROCESSED / "neighbourhoods"
    existing = {p.stem for p in out.glob("*.json") if p.name != "sources.json"}
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cities", nargs="+", default=sorted(existing | {"edmonton", "calgary"}))
    args = parser.parse_args()
    SOURCES.clear()
    bundles = []
    for city in dict.fromkeys(args.cities):
        if city in {"edmonton", "calgary"}:
            bundles.append({"edmonton": edmonton, "calgary": calgary}[city]())
        else:
            if not city.replace("-", "").isalnum():
                raise ValueError(f"Invalid city slug: {city}")
            bundles.append(importlib.import_module(f"neighbourhoods.{city.replace('-', '_')}").build())
        if bundles[-1]["placeId"] != city:
            raise ValueError(f"Adapter returned the wrong geography: {city}")
    for bundle in bundles:
        validate(bundle)
    out.mkdir(parents=True, exist_ok=True)
    for bundle in bundles:
        path = out / f"{bundle['placeId']}.json"
        path.write_text(json.dumps(bundle, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n")
        print(f"{bundle['cityName']}: {len(bundle['neighbourhoods'])} neighbourhoods; {path.stat().st_size // 1024} KiB")
    # A scoped refresh must retain the provenance of every untouched city.
    all_sources = {}
    for path in sorted(out.glob("*.json")):
        if path.name == "sources.json":
            continue
        for source in json.loads(path.read_text())["sources"]:
            previous = all_sources.get(source["id"])
            if previous is None or source["retrievedAt"] >= previous["retrievedAt"]:
                all_sources[source["id"]] = source
    (out / "sources.json").write_text(json.dumps(list(all_sources.values()), ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
