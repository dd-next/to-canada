"""Winnipeg's matched 2016 census geographies, with dated municipal inventories.

The public census API stops at 2016. Never join the separate 2021 profiles to
these boundaries: the city has added and changed neighbourhoods since then.
Run this file to write only the processed Winnipeg bundle.
"""
from __future__ import annotations

import csv
import io
import json
import math
import sys
import zipfile
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.contract import PROCESSED
from common.fetch import fetch, meta_for
from pyproj import Transformer
from shapely import make_valid, orient_polygons, transform
from shapely.geometry import Point, mapping, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree

HOST = "https://data.winnipeg.ca"
GTFS_URL = "https://gtfs.winnipegtransit.com/google_transit.zip"
PROJECT = Transformer.from_crs(4326, 26914, always_xy=True).transform
UNPROJECT = Transformer.from_crs(26914, 4326, always_xy=True).transform
CENSUS_YEAR = "2016"
CENSUS_LABELS = {
    1: "Total - Age groups of the population in private households",
    2: "0 to 14 years",
    1596: "Total - Private households by household size",
    1597: "1 person",
    1602: "Number of persons in private households",
    1668: "Total - Private households by tenure",
    1670: "Renter",
    1718: "Total - Occupied private dwellings by structural type of dwelling",
    1720: "Apartment in a building that has five or more storeys",
    1725: "Apartment in a building that has fewer than five storeys",
    1763: "Total - Tenant households in non-farm, non-reserve private dwellings",
    1766: "Median monthly shelter costs for rented dwellings ($)",
    6169: "Total - Main mode of commuting for the employed labour force aged 15 years and over in private households with a usual place of work or no fixed workplace address",
    6172: "Public transit",
    6173: "Walked",
    6174: "Bicycle",
}


def number(raw):
    if raw is None or str(raw).strip().lower() in {"", "-", "..", "...", "x", "f", "n/a"}:
        return None
    value = float(raw)
    if not math.isfinite(value) or value < 0:
        raise ValueError(f"Invalid census value: {raw!r}")
    return value


def cell(value, reason="Not published, suppressed, or undefined for this census geography."):
    return {"value": value, **({"missingReason": reason} if value is None else {})}


def share(part, total):
    if part is None or total is None or total <= 0 or part > total:
        return None
    return round(100 * part / total, 1)


def sum_known(*values):
    return None if any(v is None for v in values) else sum(values)


def census_index(rows):
    result = {}
    for row in rows:
        if (str(row["year"]), row["boundary_type"], row["sex"]) != (CENSUS_YEAR, "Neighbourhood", "All"):
            raise ValueError("Census geography, year, or sex changed")
        code = int(row["description_id"])
        if code not in CENSUS_LABELS or row["description"].strip() != CENSUS_LABELS[code]:
            raise ValueError(f"Unexpected census characteristic {code}: {row['description']}")
        key = (row["boundary_code"], code)
        if key in result:
            raise ValueError(f"Duplicate census cell: {key}")
        result[key] = row
    return result


def census_metrics(index, code):
    def get(characteristic):
        return number(index.get((code, characteristic), {}).get("value"))

    household_people, households = get(1602), get(1596)
    size = round(household_people / households, 1) if household_people is not None and households and household_people >= households else None
    tenant_total, tenant_cost = get(1763), get(1766)
    # The API represents some absent cost estimates as zero. Do not display
    # those as a $0 rent, including where rounded renter counts are positive.
    tenant_cost = tenant_cost if tenant_total and tenant_cost and tenant_cost > 0 else None
    values = {
        "population": get(1), "households": households,
        "children": share(get(2), get(1)), "householdSize": size,
        "livingAlone": share(get(1597), households),
        "apartments": share(sum_known(get(1720), get(1725)), get(1718)),
        "renters": share(get(1670), get(1668)), "tenantShelter": tenant_cost,
        "transit": share(get(6172), get(6169)),
        "walkCycle": share(sum_known(get(6173), get(6174)), get(6169)),
    }
    result = {key: cell(value) for key, value in values.items()}
    if tenant_cost is None:
        result["tenantShelter"] = cell(None, "No positive tenant shelter-cost estimate with a positive tenant-household denominator. The source's zero/absent amount is not treated as $0 rent.")
    return result


def dataset(key, *, where=None, select=None, period=None, census=False, transformations=()):
    print(f"Reading Winnipeg {key}", flush=True)
    metadata = json.loads(fetch(f"{HOST}/api/views/{key}.json", timeout=60).read_text())
    filters = {"$where": where} if where else {}
    count = int(json.loads(fetch(f"{HOST}/resource/{key}.json", params={**filters, "$select": "count(*)"}, timeout=60).read_text())[0]["count"])
    if not 1 <= count <= 100000:
        raise ValueError(f"Unexpected Winnipeg dataset size: {key}: {count}")
    rows, paths = [], []
    while len(rows) < count:
        params = {**filters, "$order": ":id", "$limit": 5000, "$offset": len(rows)}
        if select:
            params["$select"] = select
        path = fetch(f"{HOST}/resource/{key}.json", params=params, timeout=90)
        page = json.loads(path.read_text())
        if not isinstance(page, list) or not page:
            raise ValueError(f"Incomplete Winnipeg download: {key}")
        rows.extend(page)
        paths.append(path)
    if len(rows) != count:
        raise ValueError(f"Winnipeg dataset changed during download: {key}")
    updated = datetime.fromtimestamp(metadata["rowsUpdatedAt"], timezone.utc).date().isoformat()
    source = {
        "id": f"winnipeg-{key}", "title": metadata["name"],
        "publisher": "City of Winnipeg / Statistics Canada" if census else "City of Winnipeg",
        "tableId": key, "url": f"{HOST}/d/{key}", "downloadUrl": f"{HOST}/resource/{key}.json",
        "releaseDate": updated, "retrievedAt": max(meta_for(p)["retrievedAt"] for p in paths),
        "referencePeriod": period or f"Dataset updated {updated}",
        "licence": "Open Government Licence - Winnipeg; Statistics Canada Open Licence" if census else "Open Government Licence - Winnipeg",
        "attribution": "Contains information licensed under the Open Government Licence - Winnipeg. " + (
            "Adapted from Statistics Canada, 2016 Census of Population, custom tabulation supplied to the City of Winnipeg. This does not constitute an endorsement by Statistics Canada of this product."
            if census else "The City of Winnipeg does not endorse this product."),
        "transformations": list(transformations),
        "notes": ["Manually refreshed snapshot. Retrieval and catalogue update dates do not change the observation period."],
        "status": "ok",
    }
    return rows, source


def gtfs_stops(path):
    """Retain distinct bus boarding stops used by a trip in this feed."""
    with zipfile.ZipFile(path) as archive:
        def rows(name):
            with archive.open(name) as stream:
                yield from csv.DictReader(io.TextIOWrapper(stream, encoding="utf-8-sig"))

        info = list(rows("feed_info.txt"))
        if len(info) != 1:
            raise ValueError("Expected one Winnipeg GTFS feed information record")
        start = datetime.strptime(info[0]["feed_start_date"], "%Y%m%d").date().isoformat()
        end = datetime.strptime(info[0]["feed_end_date"], "%Y%m%d").date().isoformat()
        if start > end:
            raise ValueError("Invalid GTFS validity period")
        route_ids = {r["route_id"] for r in rows("routes.txt") if r["route_type"] == "3"}
        trip_ids = {r["trip_id"] for r in rows("trips.txt") if r["route_id"] in route_ids}
        used_ids = {r["stop_id"] for r in rows("stop_times.txt") if r["trip_id"] in trip_ids}
        stops = {}
        for row in rows("stops.txt"):
            if row["stop_id"] not in used_ids or row.get("location_type", "") not in {"", "0"}:
                continue
            sid = row["stop_id"]
            stop = {"id": sid, "name": row["stop_name"], "lon": float(row["stop_lon"]), "lat": float(row["stop_lat"])}
            if sid in stops:
                raise ValueError(f"Duplicate GTFS stop ID: {sid}")
            if not (-98 < stop["lon"] < -96 and 49 < stop["lat"] < 51):
                raise ValueError(f"Bus stop outside Winnipeg region: {sid}")
            stops[sid] = stop
        if used_ids - stops.keys():
            raise ValueError("A scheduled bus stop is absent or is not a boarding stop")
    return sorted(stops.values(), key=lambda s: s["id"]), start, end


def transit_dataset():
    print("Reading Winnipeg Transit GTFS", flush=True)
    path = fetch(GTFS_URL, timeout=90)
    stations, start, end = gtfs_stops(path)
    if not 1000 <= len(stations) <= 10000:
        raise ValueError("Unexpected Winnipeg bus-stop coverage")
    metadata = meta_for(path)
    modified = metadata.get("lastModified")
    source = {
        "id": "winnipeg-transit-gtfs", "title": "Winnipeg Transit GTFS schedule and bus stops",
        "publisher": "Winnipeg Transit, City of Winnipeg", "tableId": "GTFS",
        "url": "https://winnipegtransit.com/en/open-data/about/", "downloadUrl": GTFS_URL,
        **({"releaseDate": parsedate_to_datetime(modified).date().isoformat()} if modified else {}),
        "retrievedAt": metadata["retrievedAt"], "referencePeriod": f"{start} to {end}",
        "licence": "Open Data Commons Public Domain Dedication and Licence (PDDL) v1.0; LICENCE included in the feed",
        "attribution": "Winnipeg Transit GTFS data. The City does not endorse this product.",
        "transformations": ["Keep distinct stop_id boarding stops referenced by bus-route trips (GTFS route_type 3). Opposite-direction stops remain distinct.", "Measure straight-line distance from each point to each original 2016 neighbourhood polygon in EPSG:26914; include stops inside or within 800 m."],
        "notes": ["Schedule inventory over the feed's full validity period; not real-time availability, frequency, walking distance, or a measure of daily service."],
        "status": "ok",
    }
    return stations, source


def projected(geometry):
    result = transform(make_valid(shape(geometry)), PROJECT, interleaved=False)
    if result.is_empty:
        raise ValueError("Empty municipal geometry")
    return result


def park_inventory(rows):
    """Unify duplicate publisher park IDs before area calculations/counts."""
    by_id = {}
    for row in rows:
        sid = str(row["park_id"])
        if not row.get("polygon"):
            raise ValueError(f"Park {sid} lacks its polygon")
        entry = by_id.setdefault(sid, {"id": sid, "name": row.get("park_name") or "Unnamed park/open space", "geometries": []})
        entry["geometries"].append(projected(row["polygon"]))
    return [{"id": r["id"], "name": r["name"], "geometry": unary_union(r["geometries"])} for r in by_id.values()]


def park_overlap(geometry, parks, tree):
    matches = [int(i) for i in tree.query(geometry, predicate="intersects") if geometry.intersection(parks[int(i)]["geometry"]).area > 1]
    covered = geometry.intersection(unary_union([parks[i]["geometry"] for i in matches])).area if matches else 0
    if covered > geometry.area + 0.01:
        raise ValueError("Park union exceeds neighbourhood area")
    return round(100 * covered / geometry.area, 1), sorted(parks[i]["name"] for i in matches)


def nearby_stops(geometry, stations, points, tree):
    matches = [int(i) for i in tree.query(geometry, predicate="dwithin", distance=800)]
    return sorted([{**stations[i], "distanceToBoundaryM": round(geometry.distance(points[i]))} for i in matches], key=lambda s: (s["distanceToBoundaryM"], s["name"], s["id"]))


def definition(label, unit, source, note, period=None, scope=None):
    return {"label": label, "unit": unit, "sourceId": source["id"],
            "period": period or source["referencePeriod"], "note": note,
            "geographicScope": scope or "City of Winnipeg neighbourhoods on the publisher's 2016 census boundaries; not the Winnipeg CMA."}


def build():
    boundaries, bs = dataset("re9d-6c9j", where="year=2016 AND boundary_type='Neighbourhood'", period="2016 census boundaries", transformations=["Select 2016 Neighbourhood records; keep the geometry supplied with that census release. Display-only simplification by 12 metres in EPSG:26914; WGS84 clockwise exteriors."])
    if len(boundaries) != 194 or len({r["boundary_code"] for r in boundaries}) != 194:
        raise ValueError("Expected the 194 published Winnipeg 2016 census neighbourhoods")
    rows, cs = dataset("ckim-fid6", where=f"year=2016 AND boundary_type='Neighbourhood' AND sex='All' AND description_id IN ({','.join(map(str, CENSUS_LABELS))})", period="2016", census=True, transformations=["Join year=2016 and exact boundary_code to the publisher's census boundaries; retain sex=All. Validate characteristic labels and reject duplicate cells.", "Derive shares from rounded counts. Estimate people per private household from persons in private households divided by households; do not use the API's integer-only average.", "Do not interpret an absent/zero tenant shelter-cost estimate as a $0 rent."])
    index = census_index(rows)
    boundary_codes = {r["boundary_code"] for r in boundaries}
    if {key[0] for key in index} != boundary_codes:
        raise ValueError("Census and boundary geography codes do not match")
    boundary_index = {b["boundary_code"]: b for b in boundaries}
    for row in rows:
        boundary = boundary_index[row["boundary_code"]]
        if row["boundary_name"] != boundary["boundary_name"]:
            raise ValueError("Census and boundary names disagree")
    park_rows, ps = dataset("tx3d-pfxq", select="park_id,park_name,polygon", transformations=["Union geometry by park_id; intersect original 2016 neighbourhoods in EPSG:26914. Count sites with more than 1 square metre of overlap; union overlapping sites for area share."])
    library_rows, ls = dataset("bt47-pkkm", select="complex_id,name,point", transformations=["Deduplicate complex_id and count mapped library points covered by original 2016 polygons. Inventory records do not certify current opening hours or operational status."])
    recreation_rows, rs = dataset("bmi4-vvs2", select="complex_name,address,community_centre,arena,indoor_pool,outdoor_pool,fitness_leisure_centre,geometry", transformations=["Deduplicate recreation complexes by name and address; attribute sites with more than 1 square metre of polygon overlap. The community-centre count includes only community_centre=true sites."])
    stations, ts = transit_dataset()
    sources = [bs, cs, ps, ls, rs, ts]
    defs = {
        "population": definition("Population in private households", "persons", cs, "2016 custom census profile age total for people in private households. Excludes collective-dwelling residents; 25% sample, rounded counts."),
        "households": definition("Private households", "count", cs, "Private households by household size, 2016 custom census tabulation; rounded counts."),
        "children": definition("Children under 15", "percent", cs, "People aged 0–14 divided by population in private households; 2016 custom tabulation, rounded counts."),
        "householdSize": definition("Estimated people per household", "persons", cs, "Persons in private households divided by private households by household size, rounded to one decimal. Calculated from rounded 2016 counts, not the publisher's average."),
        "livingAlone": definition("One-person households", "percent", cs, "One-person households divided by private households by household size, 2016 custom census tabulation."),
        "apartments": definition("Homes in apartment buildings", "percent", cs, "Occupied private dwellings in apartment buildings with fewer than five or at least five storeys, divided by occupied dwellings by structural type. Duplexes excluded; rounded 2016 counts."),
        "renters": definition("Households renting", "percent", cs, "Renter households divided by all private households by tenure; 2016 25% sample, rounded counts."),
        "tenantShelter": definition("Median tenant shelter cost", "CAD_month", cs, "2016 occupied rentals in non-farm, non-reserve private dwellings; includes utilities where applicable, all dwelling sizes, 25% sample. Not current asking rent. Zero/absent cost estimates or non-positive tenant denominators remain unavailable."),
        "transit": definition("Commutes by public transit", "percent", cs, "Public-transit commuters divided by employed people aged 15+ in private households with a usual workplace or no fixed workplace address; excludes home workers. 2016 25% sample; historical commuting, not present service."),
        "walkCycle": definition("Commutes on foot or by bike", "percent", cs, "Walking plus cycling commuters over the same 2016 employed commuter denominator; excludes home workers, rounded 25% sample counts."),
        "parkland": definition("Mapped parks and open space", "percent", ps, "Share covered by the union of the city's park/open-space polygons; overlapping polygons counted once. Includes the inventory's open-space categories and any water within the polygons; not tree canopy or all green space.", ps["releaseDate"]),
        "parks": definition("Park/open-space sites overlapping the area", "count", ps, "Distinct park IDs with more than 1 m² of polygon overlap. A site crossing boundaries can appear in more than one neighbourhood.", ps["releaseDate"]),
        "busStops": definition("Bus stops in or near the area", "count", ts, "Distinct scheduled boarding stop IDs inside or within 800 m of the original polygon. Opposite-direction stops count separately. Straight-line distance to the area, not walking distance from a home, frequency, or rail service."),
        "libraries": definition("Mapped library sites in the area", "count", ls, "Distinct library complex IDs whose published point lies inside or on the 2016 boundary. The inventory has no operational-status field; counts do not promise an open branch or opening hours.", ls["releaseDate"]),
        "communityCentres": definition("Mapped community centres overlapping the area", "count", rs, "Recreation complexes marked community_centre=true with more than 1 m² of overlap with the 2016 boundary; distinct name/address pairs. Not all civic facilities, and no assurance of opening hours.", rs["releaseDate"]),
    }
    parks = park_inventory(park_rows)
    park_tree = STRtree([p["geometry"] for p in parks])
    points = [projected({"type": "Point", "coordinates": [s["lon"], s["lat"]]}) for s in stations]
    stop_tree = STRtree(points)
    libraries = {}
    for row in library_rows:
        sid = row["complex_id"]
        if sid in libraries:
            raise ValueError(f"Duplicate library complex ID: {sid}")
        libraries[sid] = {"name": row["name"], "point": projected(row["point"])}
    complexes = {}
    for row in recreation_rows:
        key = (row["complex_name"], row.get("address", ""))
        if key in complexes:
            raise ValueError(f"Duplicate recreation complex: {key}")
        complexes[key] = {**row, "shape": projected(row["geometry"])}
    records = []
    for boundary in boundaries:
        geometry = projected(boundary["location"])
        if geometry.geom_type not in {"Polygon", "MultiPolygon"} or geometry.area <= 0:
            raise ValueError("Invalid census boundary")
        metrics = census_metrics(index, boundary["boundary_code"])
        park_share, park_names = park_overlap(geometry, parks, park_tree)
        near = nearby_stops(geometry, stations, points, stop_tree)
        local_libraries = [r for r in libraries.values() if geometry.covers(r["point"])]
        local_complexes = [r for r in complexes.values() if geometry.intersects(r["shape"]) and geometry.intersection(r["shape"]).area > 1]
        amenities = [{"name": r["name"], "category": "Library", "sourceId": ls["id"]} for r in local_libraries]
        categories = {"community_centre": "Community centre", "arena": "Arena", "indoor_pool": "Indoor pool", "outdoor_pool": "Outdoor pool", "fitness_leisure_centre": "Fitness/leisure centre"}
        for r in local_complexes:
            for field, category in categories.items():
                if r.get(field) is True:
                    amenities.append({"name": r["complex_name"], "category": category, "sourceId": rs["id"]})
        metrics.update(parkland=cell(park_share), parks=cell(len(park_names)), busStops=cell(len(near)), libraries=cell(len(local_libraries)), communityCentres=cell(sum(r.get("community_centre") is True for r in local_complexes)))
        display = orient_polygons(transform(geometry.simplify(12, preserve_topology=True), UNPROJECT, interleaved=False), exterior_cw=True)
        records.append({
            "id": boundary["boundary_code"].lower(), "name": boundary["boundary_name"],
            "geometry": json.loads(json.dumps(mapping(display))), "metrics": metrics,
            "parks": park_names, "stations": [],
            "amenities": sorted(amenities, key=lambda a: (a["category"], a["name"])),
            "quality": {"censusYear": CENSUS_YEAR, "globalNonResponseRate": boundary.get("global_non_response_rate"), "populationScope": "People in private households; 2016 custom tabulation."},
        })
    return {
        "schemaVersion": 1, "placeId": "winnipeg", "cityName": "Winnipeg",
        "boundarySourceId": bs["id"], "boundaryVintage": CENSUS_YEAR,
        "boundaryNote": "The 194 neighbourhood boundaries published with Winnipeg's 2016 census values, joined by year and boundary code. These historical census polygons are retained when measuring newer municipal inventories.",
        "coverageNote": "City of Winnipeg only, not the Winnipeg CMA. Covers the 194 neighbourhoods in the 2016 census-boundary release; industrial, undeveloped and other areas absent from that release are not mapped. Separate 2021 profiles exist, but their boundary correspondence has not been verified. Census facts remain 2016; parks, facilities and bus stops carry their own dates. These inventories do not cover groceries, schools, clinics or all local amenities.",
        "definitions": defs, "sources": sources,
        "neighbourhoods": sorted(records, key=lambda n: n["name"]), "stations": [],
        "links": {"hoodmaps": "https://hoodmaps.com/winnipeg-neighborhood-map", "reddit": "https://www.reddit.com/r/Winnipeg/", "profiles": "https://www.winnipeg.ca/census/2016/"},
    }


if __name__ == "__main__":
    bundle = build()
    path = PROCESSED / "neighbourhoods" / "winnipeg.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(bundle, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n")
    print(f"Winnipeg: {len(bundle['neighbourhoods'])} neighbourhoods; {path.stat().st_size // 1024} KiB")
